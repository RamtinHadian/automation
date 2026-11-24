package workflow

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Resolver turns the people named in a file into user ids (the server looks them up in the database; the tests use a fake).
type Resolver interface {
	Resolve(refs []Ref, st *State) []string
}

type Event struct {
	At       time.Time `json:"at"`
	Step     string    `json:"step"`
	StepName string    `json:"stepName,omitempty"`
	Type     string    `json:"type"`             // start approval task condition notify end
	By       string    `json:"by,omitempty"`     // user id
	ByName   string    `json:"byName,omitempty"` // shown name
	Action   string    `json:"action,omitempty"` // start approve reject complete cancel auto
	Comment  string    `json:"comment,omitempty"`
	Note     string    `json:"note,omitempty"`
}

// State is everything the server keeps about one running or finished request.
type State struct {
	Current   string         `json:"current"`
	Status    string         `json:"status"` // running approved rejected done cancelled
	StarterID string         `json:"starterId"`
	Values    map[string]any `json:"values"`
	Waiting   []string       `json:"waiting"`  // who may act now
	Approved  []string       `json:"approved"` // mode «all»: who has already approved the current step
	DueAt     *time.Time     `json:"dueAt,omitempty"`
	History   []Event        `json:"history"`
}

// Effect is a notice the server must send after a change.
type Effect struct {
	Users []string
	Title string
	Body  string
}

var tmpl = regexp.MustCompile(`\{\{\s*([A-Za-z0-9_-]+)\s*\}\}`)

// Render fills «{{key}}» of a text with the values of the form.
func Render(text string, values map[string]any, names map[string]string) string {
	return tmpl.ReplaceAllStringFunc(text, func(m string) string {
		key := tmpl.FindStringSubmatch(m)[1]
		if n, ok := names[key]; ok {
			return n
		}
		return display(values[key])
	})
}

func display(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		if t {
			return "بله"
		}
		return "خیر"
	case json.Number:
		return t.String()
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	}
	return fmt.Sprint(v)
}

func num(v any) (float64, bool) {
	switch t := v.(type) {
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case float64:
		return t, true
	case int:
		return float64(t), true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f, err == nil
	}
	return 0, false
}

func compare(a any, op string, b any) bool {
	switch op {
	case "empty":
		return strings.TrimSpace(display(a)) == ""
	case "notEmpty":
		return strings.TrimSpace(display(a)) != ""
	case "contains":
		return strings.Contains(display(a), display(b))
	}
	x, xok := num(a)
	y, yok := num(b)
	if xok && yok {
		switch op {
		case "==":
			return x == y
		case "!=":
			return x != y
		case ">":
			return x > y
		case ">=":
			return x >= y
		case "<":
			return x < y
		case "<=":
			return x <= y
		}
	}
	s, t := display(a), display(b)
	switch op {
	case "==":
		return s == t
	case "!=":
		return s != t
	case ">":
		return s > t
	case ">=":
		return s >= t
	case "<":
		return s < t
	case "<=":
		return s <= t
	}
	return false
}

// Eval answers a condition about the form's values.
func Eval(c *Cond, values map[string]any) bool {
	if c == nil {
		return false
	}
	if len(c.All) > 0 {
		for i := range c.All {
			if !Eval(&c.All[i], values) {
				return false
			}
		}
		return true
	}
	if len(c.Any) > 0 {
		for i := range c.Any {
			if Eval(&c.Any[i], values) {
				return true
			}
		}
		return false
	}
	return compare(values[c.Field], c.Op, c.Value)
}

// CheckValues checks what the person typed against the form and returns the cleaned values.
func (p *Package) CheckValues(in map[string]any) (map[string]any, error) {
	out := map[string]any{}
	for _, f := range p.Fields {
		v, has := in[f.Key]
		if s, ok := v.(string); ok {
			v = strings.TrimSpace(s)
			has = has && v != ""
		}
		if !has || v == nil {
			if f.Required {
				return nil, fmt.Errorf("«%s» را پر کنید.", f.Label)
			}
			continue
		}
		switch f.Type {
		case "number", "money":
			n, ok := num(v)
			if !ok {
				return nil, fmt.Errorf("«%s» باید عدد باشد.", f.Label)
			}
			v = n
		case "yesno":
			b, ok := v.(bool)
			if !ok {
				return nil, fmt.Errorf("«%s» باید بله یا خیر باشد.", f.Label)
			}
			v = b
		case "select":
			s, _ := v.(string)
			okOpt := false
			for _, o := range f.Options {
				if o == s {
					okOpt = true
				}
			}
			if !okOpt {
				return nil, fmt.Errorf("«%s»: گزینهٔ انتخاب‌شده درست نیست.", f.Label)
			}
		default:
			s, ok := v.(string)
			if !ok {
				return nil, fmt.Errorf("«%s» درست نیست.", f.Label)
			}
			if len(s) > 4000 {
				return nil, fmt.Errorf("«%s» بیش از حد طولانی است.", f.Label)
			}
		}
		out[f.Key] = v
	}
	return out, nil
}

func (st *State) add(e Event) { st.History = append(st.History, e) }

func without(ids []string, drop string) []string {
	out := []string{}
	for _, x := range ids {
		if x != drop && x != "" {
			out = append(out, x)
		}
	}
	return out
}

func uniq(ids []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, x := range ids {
		if x != "" && !seen[x] {
			seen[x] = true
			out = append(out, x)
		}
	}
	return out
}

// Begin makes the state of a new request and runs it up to the first step that waits for someone.
func Begin(p *Package, starterID, starterName string, values map[string]any, r Resolver, now time.Time) (*State, []Effect, error) {
	st := &State{Current: p.First(), Status: "running", StarterID: starterID, Values: values}
	st.add(Event{At: now, Step: "", Type: "start", By: starterID, ByName: starterName, Action: "start"})
	fx, err := Run(p, st, r, now)
	return st, fx, err
}

// Run moves the request forward through the steps that need nobody (conditions, notices) until one waits for a person or the request ends.
func Run(p *Package, st *State, r Resolver, now time.Time) ([]Effect, error) {
	var fx []Effect
	for guard := 0; guard < 100; guard++ {
		s := p.Step(st.Current)
		if s == nil {
			return fx, errors.New("مرحلهٔ جاری پیدا نشد")
		}
		switch s.Type {
		case "condition":
			yes := Eval(s.If, st.Values)
			next := s.Else
			note := "خیر"
			if yes {
				next, note = s.Then, "بله"
			}
			st.add(Event{At: now, Step: s.ID, StepName: s.Name, Type: "condition", Action: "auto", Note: note})
			st.Current = next
		case "notify":
			users := uniq(r.Resolve(s.To, st))
			if len(users) > 0 {
				fx = append(fx, Effect{Users: users, Title: p.Name, Body: Render(s.Text, st.Values, nil)})
			}
			st.add(Event{At: now, Step: s.ID, StepName: s.Name, Type: "notify", Action: "auto"})
			st.Current = s.Next
		case "approval", "task":
			users := uniq(r.Resolve(s.Who, st))
			if s.Type == "approval" {
				// nobody approves his own request: when he is the only one, the CEO decides instead
				if l := without(users, st.StarterID); len(l) > 0 {
					users = l
				} else if len(users) > 0 {
					users = uniq(r.Resolve([]Ref{{Kind: "ceo"}}, st))
					users = without(users, st.StarterID)
				}
			}
			if len(users) == 0 {
				return fx, fmt.Errorf("برای مرحلهٔ «%s» هیچ‌کس پیدا نشد؛ نام‌ها یا واحدهای فایل را بررسی کنید", firstNonEmpty(s.Name, s.ID))
			}
			st.Waiting, st.Approved = users, nil
			st.DueAt = nil
			if s.Hours > 0 {
				d := now.Add(time.Duration(s.Hours * float64(time.Hour)))
				st.DueAt = &d
			}
			what := "برای تأیید شما"
			if s.Type == "task" {
				what = "برای انجام توسط شما"
			}
			fx = append(fx, Effect{Users: users, Title: p.Name + " — " + firstNonEmpty(s.Name, s.ID), Body: Render(titleOf(p), st.Values, nil) + " " + what})
			return fx, nil
		case "end":
			st.Status, st.Waiting, st.Approved, st.DueAt = s.Outcome, nil, nil, nil
			st.add(Event{At: now, Step: s.ID, StepName: s.Name, Type: "end", Action: "auto", Note: s.Outcome})
			fx = append(fx, Effect{Users: []string{st.StarterID}, Title: p.Name, Body: Render(titleOf(p), st.Values, nil) + " — " + OutcomeText(s.Outcome)})
			return fx, nil
		default:
			return fx, errors.New("نوع مرحله شناخته‌شده نیست")
		}
	}
	return fx, errors.New("گردشکار در یک حلقهٔ بی‌پایان افتاد")
}

func titleOf(p *Package) string {
	if strings.TrimSpace(p.Start.Title) != "" {
		return p.Start.Title
	}
	return p.Name
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// OutcomeText says in Persian how a request ended.
func OutcomeText(o string) string {
	switch o {
	case "approved":
		return "تأیید شد"
	case "rejected":
		return "رد شد"
	case "done":
		return "انجام شد"
	case "cancelled":
		return "لغو شد"
	}
	return o
}

// Title is the line that names a request (the title template of the file filled with the form).
func Title(p *Package, values map[string]any, names map[string]string) string {
	return Render(titleOf(p), values, names)
}

// Act: a person decides the current step. action: approve | reject | complete. onBehalf is set when an administrator acts for the people waiting.
func Act(p *Package, st *State, actor, actorName, action, comment string, onBehalf bool, r Resolver, now time.Time) ([]Effect, error) {
	if st.Status != "running" {
		return nil, errors.New("این درخواست دیگر در جریان نیست.")
	}
	s := p.Step(st.Current)
	if s == nil || (s.Type != "approval" && s.Type != "task") {
		return nil, errors.New("این درخواست الان منتظر هیچ‌کس نیست.")
	}
	is := false
	for _, w := range st.Waiting {
		if w == actor {
			is = true
		}
	}
	if !is && !onBehalf {
		return nil, errors.New("نوبت شما نیست.")
	}
	comment = strings.TrimSpace(comment)
	switch {
	case s.Type == "approval" && action == "approve":
	case s.Type == "approval" && action == "reject":
		if comment == "" {
			return nil, errors.New("دلیل رد را بنویسید.")
		}
	case s.Type == "task" && action == "complete":
	default:
		return nil, errors.New("این کار برای این مرحله ممکن نیست.")
	}
	ev := Event{At: now, Step: s.ID, StepName: s.Name, Type: s.Type, By: actor, ByName: actorName, Action: action, Comment: comment}
	if onBehalf && !is {
		ev.Note = "از طرف مدیر سیستم"
	}
	st.add(ev)
	if action == "approve" && s.Mode == "all" && !onBehalf {
		for _, a := range st.Approved {
			if a == actor {
				return nil, errors.New("شما قبلاً تأیید کرده‌اید.")
			}
		}
		st.Approved = append(st.Approved, actor)
		if len(st.Approved) < len(st.Waiting) {
			return nil, nil // the others are still to approve
		}
	}
	if action == "reject" {
		if s.OnReject == "" {
			st.Status, st.Waiting, st.Approved, st.DueAt = "rejected", nil, nil, nil
			st.add(Event{At: now, Step: s.ID, StepName: s.Name, Type: "end", Action: "auto", Note: "rejected"})
			return []Effect{{Users: []string{st.StarterID}, Title: p.Name, Body: Render(titleOf(p), st.Values, nil) + " — رد شد: " + comment}}, nil
		}
		st.Current = s.OnReject
	} else {
		st.Current = s.Next
	}
	st.Waiting, st.Approved, st.DueAt = nil, nil, nil
	return Run(p, st, r, now)
}

// Cancel ends a running request (by the person who started it or an administrator).
func Cancel(st *State, by, byName, reason string, now time.Time) error {
	if st.Status != "running" {
		return errors.New("این درخواست دیگر در جریان نیست.")
	}
	st.Status, st.Waiting, st.Approved, st.DueAt = "cancelled", nil, nil, nil
	st.add(Event{At: now, Type: "end", By: by, ByName: byName, Action: "cancel", Comment: reason})
	return nil
}

// Escalate adds the people named in the step's «escalate» to the ones waiting (the time of the step is over).
func Escalate(p *Package, st *State, r Resolver) []string {
	s := p.Step(st.Current)
	if s == nil || len(s.Escalate) == 0 {
		return nil
	}
	more := without(uniq(r.Resolve(s.Escalate, st)), "")
	added := []string{}
	for _, u := range more {
		has := false
		for _, w := range st.Waiting {
			if w == u {
				has = true
			}
		}
		if !has {
			st.Waiting = append(st.Waiting, u)
			added = append(added, u)
		}
	}
	return added
}
