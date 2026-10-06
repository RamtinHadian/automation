// Package voip connects the app to the company phone system (Issabel / Asterisk) through its AMI port.
//
// It does two things: it turns "a call is ringing on extension X" into a pop-up for the person who owns
// that extension, and it can place a call (the person's phone rings first, then the other party is dialled).
package voip

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Config is how to reach the phone system. An empty Host switches the feature off.
type Config struct {
	Host   string
	Port   string
	User   string
	Secret string
}

func (c Config) Enabled() bool { return c.Host != "" && c.User != "" && c.Secret != "" }

// Event is one message Asterisk sent (keys as Asterisk names them, e.g. "Event", "CallerIDNum").
type Event map[string]string

// Client keeps one connection to Asterisk and reconnects by itself when it drops.
type Client struct {
	cfg       Config
	connected atomic.Bool
	seq       atomic.Uint64

	mu      sync.Mutex // guards conn writes and pending
	conn    net.Conn
	pending map[string]chan Event

	// OnEvent is called for every event from Asterisk (from the reader goroutine; keep it quick).
	OnEvent func(Event)
}

func NewClient(cfg Config) *Client {
	return &Client{cfg: cfg, pending: map[string]chan Event{}}
}

func (c *Client) Enabled() bool   { return c.cfg.Enabled() }
func (c *Client) Connected() bool { return c.connected.Load() }

// Run connects and stays connected until ctx ends.
func (c *Client) Run(ctx context.Context) {
	if !c.cfg.Enabled() {
		Logf("اتصال به تلفن تنظیم نشده است؛ ارتباط با ویپ خاموش است.")
		return
	}
	backoff := 2 * time.Second
	for ctx.Err() == nil {
		err := c.session(ctx)
		c.connected.Store(false)
		if ctx.Err() != nil {
			return
		}
		Logf("ارتباط با صندوق تلفن قطع شد (%v)؛ %s دیگر دوباره تلاش می‌شود.", err, backoff)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 30*time.Second {
			backoff *= 2
		}
	}
}

func (c *Client) session(ctx context.Context) error {
	d := net.Dialer{Timeout: 8 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(c.cfg.Host, c.cfg.Port))
	if err != nil {
		return err
	}
	defer conn.Close()
	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()
	go func() { // closing the connection unblocks the reader when the program stops
		<-ctx.Done()
		conn.Close()
	}()

	r := bufio.NewReader(conn)
	if _, err := r.ReadString('\n'); err != nil { // banner: "Asterisk Call Manager/x.y"
		return err
	}

	loginID := c.nextID()
	c.register(loginID)
	if err := c.send(map[string]string{"Action": "Login", "ActionID": loginID, "Username": c.cfg.User, "Secret": c.cfg.Secret, "Events": "call"}); err != nil {
		return err
	}
	go func() {
		resp, err := c.wait(loginID, 8*time.Second)
		if err != nil || resp["Response"] != "Success" {
			Logf("ورود به صندوق تلفن رد شد (نام کاربری یا رمز AMI را بررسی کنید): %v %s", err, resp["Message"])
			conn.Close()
			return
		}
		c.connected.Store(true)
		Logf("به صندوق تلفن وصل شد؛ منتظر تماس هستم.")
	}()

	for {
		ev, err := readBlock(r)
		if err != nil {
			return err
		}
		if id := ev["ActionID"]; id != "" && ev["Response"] != "" {
			c.deliver(id, ev)
			continue
		}
		if ev["Event"] != "" {
			noteEvent()
		}
		normalizeEvent(ev)
		if ev["Event"] != "" && c.OnEvent != nil {
			c.OnEvent(ev)
		}
	}
}

func readBlock(r *bufio.Reader) (Event, error) {
	ev := Event{}
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return nil, err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if len(ev) == 0 {
				continue
			}
			return ev, nil
		}
		if i := strings.Index(line, ":"); i > 0 {
			ev[strings.TrimSpace(line[:i])] = strings.TrimSpace(line[i+1:])
		}
	}
}

func (c *Client) nextID() string { return fmt.Sprintf("app-%d", c.seq.Add(1)) }

func (c *Client) register(id string) {
	c.mu.Lock()
	c.pending[id] = make(chan Event, 1)
	c.mu.Unlock()
}

func (c *Client) deliver(id string, ev Event) {
	c.mu.Lock()
	ch := c.pending[id]
	c.mu.Unlock()
	if ch != nil {
		select {
		case ch <- ev:
		default:
		}
	}
}

func (c *Client) wait(id string, d time.Duration) (Event, error) {
	c.mu.Lock()
	ch := c.pending[id]
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
	}()
	select {
	case ev := <-ch:
		return ev, nil
	case <-time.After(d):
		return nil, errors.New("no answer from the phone system")
	}
}

func (c *Client) send(fields map[string]string) error {
	var b strings.Builder
	// Action first, as Asterisk expects
	b.WriteString("Action: " + fields["Action"] + "\r\n")
	for k, v := range fields {
		if k != "Action" {
			b.WriteString(k + ": " + v + "\r\n")
		}
	}
	b.WriteString("\r\n")
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return errors.New("not connected")
	}
	_ = c.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	_, err := c.conn.Write([]byte(b.String()))
	return err
}

var digits = regexp.MustCompile(`^[0-9*#+]{1,20}$`)

// Call rings the caller's own extension first and, when they pick up, dials the target.
func (c *Client) Call(fromExt, target string) error {
	if !c.Connected() {
		return errors.New("اتصال به تلفن سازمان برقرار نیست.")
	}
	if !digits.MatchString(fromExt) || !digits.MatchString(target) {
		return errors.New("شماره معتبر نیست.")
	}
	id := c.nextID()
	c.register(id)
	err := c.send(map[string]string{
		"Action": "Originate", "ActionID": id,
		"Channel":  "Local/" + fromExt + "@from-internal",
		"Context":  "from-internal",
		"Exten":    target,
		"Priority": "1",
		"CallerID": "App <" + fromExt + ">",
		"Timeout":  "30000",
		"Async":    "true",
	})
	if err != nil {
		return err
	}
	resp, err := c.wait(id, 8*time.Second)
	if err != nil {
		return err
	}
	if resp["Response"] != "Success" {
		return errors.New("تماس برقرار نشد: " + resp["Message"])
	}
	return nil
}

// normalizeEvent lets older phone systems (Asterisk 11 and older, e.g. Issabel 4) talk like the newer ones. There a
// ringing leg is ONE event «Dial» with SubEvent Begin/End (and the called channel is called «Destination»), and no
// event has a Linkedid; everything below is written for the newer names (DialBegin, DialEnd, DestChannel, Linkedid).
func normalizeEvent(ev Event) {
	if ev["Event"] == "Dial" {
		switch strings.ToLower(ev["SubEvent"]) {
		case "begin":
			ev["Event"] = "DialBegin"
			if ev["DestChannel"] == "" {
				ev["DestChannel"] = ev["Destination"]
			}
		case "end":
			ev["Event"] = "DialEnd"
		}
	}
	switch ev["Event"] {
	case "DialBegin", "DialEnd", "Hangup":
		if ev["Linkedid"] == "" && ev["LinkedID"] == "" {
			if u := pick(ev, "Uniqueid", "UniqueID"); u != "" {
				ev["Linkedid"] = u
			}
		}
	}
}
