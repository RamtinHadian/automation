// Package license makes the system run only where the vendor allowed it.
//
// An activation code is a small signed document (customer, expiry, number of users, the install it is for). Only the vendor's private
// key can sign one; the server holds the public half and checks the signature. The code is tied to one installation: its fingerprint is
// made from a random install id kept in the database and, when available, the host's machine id, so copying the program (or the database)
// to another server does not carry the licence along.
package license

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"time"

	"automation/server/internal/store"
)

// vendorPublicKey is the public half of the vendor's signing key (base64). The private half never leaves the vendor.
const vendorPublicKey = "e5xT7vCK1/prq/wa2m6jfbHHsecgn1LBSOEpu+zrfn4="

const prefix = "HM1-"

// License is what an activation code says.
type License struct {
	Serial   string   `json:"s"`
	Customer string   `json:"c"`
	FP       string   `json:"f"` // fingerprint of the installation it is for
	Issued   int64    `json:"i"`
	Expires  int64    `json:"e"`
	MaxUsers int      `json:"u"`
	Features []string `json:"x,omitempty"`
}

func pub() (ed25519.PublicKey, error) {
	b, err := base64.StdEncoding.DecodeString(vendorPublicKey)
	if err != nil || len(b) != ed25519.PublicKeySize {
		return nil, errors.New("vendor key missing")
	}
	return ed25519.PublicKey(b), nil
}

// Encode signs a licence (used by the vendor's tool).
func Encode(priv ed25519.PrivateKey, l License) string {
	payload, _ := json.Marshal(l)
	sig := ed25519.Sign(priv, payload)
	return prefix + base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig)
}

// Decode checks the signature and returns the licence.
func Decode(code string) (License, error) {
	var l License
	code = strings.Join(strings.Fields(code), "")
	if !strings.HasPrefix(code, prefix) {
		return l, errors.New("کد فعال‌سازی معتبر نیست.")
	}
	parts := strings.SplitN(strings.TrimPrefix(code, prefix), ".", 2)
	if len(parts) != 2 {
		return l, errors.New("کد فعال‌سازی معتبر نیست.")
	}
	payload, err1 := base64.RawURLEncoding.DecodeString(parts[0])
	sig, err2 := base64.RawURLEncoding.DecodeString(parts[1])
	k, err3 := pub()
	if err1 != nil || err2 != nil || err3 != nil || !ed25519.Verify(k, payload, sig) {
		return l, errors.New("کد فعال‌سازی معتبر نیست.")
	}
	if json.Unmarshal(payload, &l) != nil {
		return l, errors.New("کد فعال‌سازی معتبر نیست.")
	}
	return l, nil
}

// Fingerprint makes the install code shown to the customer (and signed into the licence).
func Fingerprint(installID, hostID string) string {
	sum := sha256.Sum256([]byte("hoormand|" + hostID + "|" + installID))
	h := strings.ToUpper(hex.EncodeToString(sum[:10]))
	return h[0:4] + "-" + h[4:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20]
}

// ---------- runtime state ----------

type state struct {
	mu         sync.Mutex
	demo       bool
	installID  string
	fp         string
	graceUntil time.Time
	lastSeen   time.Time
	lic        *License
	code       string
}

var st = &state{}

// Mode of the installation: active, grace (an existing installation that has not been activated yet), expired (read-only) or none (locked).
type Status struct {
	Mode      string `json:"mode"`
	Licensed  bool   `json:"licensed"` // may the system be used at all
	ReadOnly  bool   `json:"readOnly"`
	Customer  string `json:"customer,omitempty"`
	Serial    string `json:"serial,omitempty"`
	Expires   string `json:"expires,omitempty"`
	DaysLeft  int    `json:"daysLeft"`
	MaxUsers  int    `json:"maxUsers"`
	InstallID string `json:"installId"`
}

func hostID() string {
	path := os.Getenv("HOST_ID_FILE")
	if path == "" {
		path = "/etc/host-machine-id"
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func randomID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		sum := sha256.Sum256([]byte(time.Now().String()))
		copy(b, sum[:16])
	}
	return hex.EncodeToString(b)
}

// Init loads (or creates) the install identity and the saved activation code. A database that already holds real data when this
// feature first appears gets a 30-day grace period, so an installation that is already working is not locked out; a fresh one needs a code at once.
func Init(ctx context.Context, demo bool) error {
	st.mu.Lock()
	defer st.mu.Unlock()
	st.demo = demo
	var raw []byte
	err := store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'install'`).Scan(&raw)
	doc := map[string]any{}
	if err == nil {
		_ = json.Unmarshal(raw, &doc)
	}
	if id, _ := doc["id"].(string); id != "" {
		st.installID = id
	} else {
		st.installID = randomID()
		doc["id"] = st.installID
		var users, other int
		_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&users)
		_ = store.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM transfers) + (SELECT count(*) FROM tasks) + (SELECT count(*) FROM crm_customers)`).Scan(&other)
		if users > 1 || other > 0 {
			until := time.Now().Add(30 * 24 * time.Hour)
			doc["graceUntil"] = until.Unix()
			st.graceUntil = until
		}
		b, _ := json.Marshal(doc)
		if _, err := store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('install', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, string(b)); err != nil {
			return err
		}
	}
	if g, ok := doc["graceUntil"].(float64); ok {
		st.graceUntil = time.Unix(int64(g), 0)
	}
	if ls, ok := doc["lastSeen"].(float64); ok {
		st.lastSeen = time.Unix(int64(ls), 0)
	}
	st.fp = Fingerprint(st.installID, hostID())
	var lraw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'license'`).Scan(&lraw) == nil {
		var d struct {
			Code string `json:"code"`
		}
		if json.Unmarshal(lraw, &d) == nil && d.Code != "" {
			st.code = d.Code
			if l, err := Decode(d.Code); err == nil && l.FP == st.fp {
				st.lic = &l
			}
		}
	}
	return nil
}

// Run keeps a record of the latest time seen, so winding the clock back does not extend a licence.
func Run(ctx context.Context) {
	tick := time.NewTicker(10 * time.Minute)
	defer tick.Stop()
	for {
		st.mu.Lock()
		now := time.Now()
		if now.After(st.lastSeen) {
			st.lastSeen = now
			_, _ = store.Pool.Exec(ctx, `UPDATE settings SET data = data || jsonb_build_object('lastSeen', $1::bigint) WHERE key = 'install'`, now.Unix())
		}
		st.mu.Unlock()
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

// Check evaluates the licence right now.
func Check() Status {
	st.mu.Lock()
	defer st.mu.Unlock()
	s := Status{InstallID: st.fp}
	if st.demo {
		s.Mode, s.Licensed = "active", true
		return s
	}
	now := time.Now()
	rolledBack := !st.lastSeen.IsZero() && now.Before(st.lastSeen.Add(-24*time.Hour)) // the clock was wound back
	if st.lic != nil {
		s.Customer, s.Serial, s.MaxUsers = st.lic.Customer, st.lic.Serial, st.lic.MaxUsers
		exp := time.Unix(st.lic.Expires, 0)
		s.Expires = exp.UTC().Format(time.RFC3339)
		s.DaysLeft = int(time.Until(exp).Hours() / 24)
		if now.Before(exp) && !rolledBack {
			s.Mode, s.Licensed = "active", true
			return s
		}
		s.Mode, s.Licensed, s.ReadOnly = "expired", true, true
		return s
	}
	if now.Before(st.graceUntil) && !rolledBack {
		s.Mode, s.Licensed = "grace", true
		s.DaysLeft = int(time.Until(st.graceUntil).Hours() / 24)
		s.Expires = st.graceUntil.UTC().Format(time.RFC3339)
		return s
	}
	s.Mode = "none"
	return s
}

// Activate checks a code for this installation and stores it.
func Activate(ctx context.Context, code string) error {
	l, err := Decode(code)
	if err != nil {
		return err
	}
	st.mu.Lock()
	fp := st.fp
	st.mu.Unlock()
	if l.FP != fp {
		return errors.New("این کد برای این سرور صادر نشده است؛ کد نصب را دقیقاً به فروشنده بدهید.")
	}
	if time.Now().After(time.Unix(l.Expires, 0)) {
		return errors.New("این کد منقضی شده است.")
	}
	clean := strings.Join(strings.Fields(code), "")
	b, _ := json.Marshal(map[string]string{"code": clean})
	if _, err := store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('license', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, string(b)); err != nil {
		return err
	}
	st.mu.Lock()
	st.lic, st.code = &l, clean
	st.mu.Unlock()
	return nil
}

// UsersAllowed says whether one more user may be added (0 = no limit).
func UsersAllowed(current int) bool {
	s := Check()
	if !s.Licensed || s.ReadOnly {
		return false
	}
	return s.MaxUsers == 0 || current < s.MaxUsers
}
