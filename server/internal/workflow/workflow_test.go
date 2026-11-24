package workflow

import (
	"crypto/ed25519"
	"encoding/json"
	"crypto/rand"
	"strings"
	"testing"
	"time"
)

type fake struct{ people map[string][]string }

func (f fake) Resolve(refs []Ref, st *State) []string {
	var out []string
	for _, r := range refs {
		switch r.Kind {
		case "starter":
			out = append(out, st.StarterID)
		case "field":
			if s, ok := st.Values[r.Ref].(string); ok {
				out = append(out, s)
			}
		default:
			out = append(out, f.people[r.Kind+":"+r.Ref]...)
		}
	}
	return out
}

const sample = `{
 "format": "hoormand-workflow/1", "id": "purchase", "version": 1, "name": "خرید تجهیزات",
 "start": {"allow": [{"kind": "everyone"}], "title": "خرید {{item}}"},
 "fields": [
  {"key": "item", "label": "کالا", "type": "text", "required": true},
  {"key": "amount", "label": "مبلغ", "type": "money", "required": true},
  {"key": "buyer", "label": "خریدار", "type": "person"}
 ],
 "steps": [
  {"id": "mgr", "type": "approval", "name": "تأیید مدیر", "who": [{"kind": "user", "ref": "ali"}], "next": "big"},
  {"id": "big", "type": "condition", "if": {"field": "amount", "op": ">", "value": 50000000}, "then": "ceo", "else": "buy"},
  {"id": "ceo", "type": "approval", "name": "تأیید مدیرعامل", "who": [{"kind": "ceo"}], "next": "buy", "onReject": "mgr"},
  {"id": "buy", "type": "task", "name": "خرید", "who": [{"kind": "field", "ref": "buyer"}], "hours": 24, "next": "tell"},
  {"id": "tell", "type": "notify", "to": [{"kind": "starter"}], "text": "{{item}} خریداری شد", "next": "ok"},
  {"id": "ok", "type": "end", "outcome": "done"}
 ]
}`

func people() fake {
	return fake{people: map[string][]string{"user:ali": {"u-ali"}, "ceo:": {"u-ceo"}}}
}

func TestFlowSmallAmountSkipsCEO(t *testing.T) {
	p, err := Parse([]byte(sample))
	if err != nil {
		t.Fatal(err)
	}
	vals, err := p.CheckValues(map[string]any{"item": "لپ‌تاپ", "amount": 20000000.0, "buyer": "u-mahdi"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	st, fx, err := Begin(p, "u-sara", "سارا", vals, people(), now)
	if err != nil || st.Current != "mgr" || len(st.Waiting) != 1 || st.Waiting[0] != "u-ali" || len(fx) != 1 {
		t.Fatalf("begin: %v %+v %+v", err, st, fx)
	}
	if _, err := Act(p, st, "u-other", "x", "approve", "", false, people(), now); err == nil {
		t.Fatal("somebody not waiting must be refused")
	}
	if _, err := Act(p, st, "u-ali", "علی", "approve", "", false, people(), now); err != nil {
		t.Fatal(err)
	}
	if st.Current != "buy" || st.Waiting[0] != "u-mahdi" || st.DueAt == nil {
		t.Fatalf("after mgr: %+v", st)
	}
	fx, err = Act(p, st, "u-mahdi", "مهدی", "complete", "", false, people(), now)
	if err != nil || st.Status != "done" || len(fx) < 2 {
		t.Fatalf("finish: %v %+v %+v", err, st, fx)
	}
	if !strings.Contains(fx[0].Body, "لپ‌تاپ خریداری شد") {
		t.Fatalf("notice text: %q", fx[0].Body)
	}
}

func TestFlowBigAmountGoesToCEOAndRejectLoopsBack(t *testing.T) {
	p, _ := Parse([]byte(sample))
	vals, _ := p.CheckValues(map[string]any{"item": "ماشین", "amount": 90000000.0, "buyer": "u-mahdi"})
	now := time.Now()
	st, _, _ := Begin(p, "u-sara", "سارا", vals, people(), now)
	_, _ = Act(p, st, "u-ali", "علی", "approve", "", false, people(), now)
	if st.Current != "ceo" || st.Waiting[0] != "u-ceo" {
		t.Fatalf("should wait for the CEO: %+v", st)
	}
	if _, err := Act(p, st, "u-ceo", "م", "reject", "", false, people(), now); err == nil {
		t.Fatal("a rejection needs a reason")
	}
	if _, err := Act(p, st, "u-ceo", "م", "reject", "گران است", false, people(), now); err != nil {
		t.Fatal(err)
	}
	if st.Current != "mgr" || st.Status != "running" {
		t.Fatalf("reject must go back to mgr: %+v", st)
	}
}

func TestRejectWithoutOnRejectEnds(t *testing.T) {
	p, _ := Parse([]byte(strings.Replace(sample, `"next": "buy", "onReject": "mgr"`, `"next": "buy"`, 1)))
	vals, _ := p.CheckValues(map[string]any{"item": "ماشین", "amount": 90000000.0})
	now := time.Now()
	st, _, _ := Begin(p, "u-sara", "سارا", vals, people(), now)
	_, _ = Act(p, st, "u-ali", "علی", "approve", "", false, people(), now)
	fx, err := Act(p, st, "u-ceo", "م", "reject", "نه", false, people(), now)
	if err != nil || st.Status != "rejected" || len(fx) != 1 || fx[0].Users[0] != "u-sara" {
		t.Fatalf("%v %+v %+v", err, st, fx)
	}
}

func TestStarterNeverApprovesOwnRequest(t *testing.T) {
	p, _ := Parse([]byte(sample))
	vals, _ := p.CheckValues(map[string]any{"item": "x", "amount": 1.0})
	st, _, err := Begin(p, "u-ali", "علی", vals, people(), time.Now()) // ali starts: his own approval goes to the CEO
	if err != nil || st.Waiting[0] != "u-ceo" {
		t.Fatalf("%v %+v", err, st)
	}
}

func TestNobodyFoundIsAnError(t *testing.T) {
	p, _ := Parse([]byte(sample))
	vals, _ := p.CheckValues(map[string]any{"item": "x", "amount": 1.0})
	if _, _, err := Begin(p, "u-sara", "سارا", vals, fake{}, time.Now()); err == nil {
		t.Fatal("a step nobody can do must not be silently lost")
	}
}

func TestValidationCatchesMistakes(t *testing.T) {
	bad := map[string]string{
		"missing next":  strings.Replace(sample, `"next": "big"`, `"next": "nowhere"`, 1),
		"no end":        strings.Replace(sample, `"type": "end"`, `"type": "notify", "to": [{"kind":"starter"}], "text": "x", "next": "mgr"`, 1),
		"unknown field": strings.Replace(sample, `"field": "amount"`, `"field": "zzz"`, 1),
		"bad kind":      strings.Replace(sample, `"kind": "ceo"`, `"kind": "boss"`, 1),
		"unreachable":   strings.Replace(sample, `"then": "ceo"`, `"then": "buy"`, 1),
		"other format":  strings.Replace(sample, "hoormand-workflow/1", "other/9", 1),
		"extra key":     strings.Replace(sample, `"version": 1,`, `"version": 1, "hack": true,`, 1),
	}
	for name, raw := range bad {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}

func TestValuesAreChecked(t *testing.T) {
	p, _ := Parse([]byte(sample))
	if _, err := p.CheckValues(map[string]any{"amount": 5.0}); err == nil {
		t.Fatal("required item missing")
	}
	if _, err := p.CheckValues(map[string]any{"item": "x", "amount": "abc"}); err == nil {
		t.Fatal("amount must be a number")
	}
	v, err := p.CheckValues(map[string]any{"item": "x", "amount": "1500"})
	if err != nil || v["amount"] != 1500.0 {
		t.Fatalf("%v %v", err, v)
	}
}

func TestSignatureStopsAnyChange(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	keys := map[string]ed25519.PublicKey{"k1": pub}
	signed, err := Sign([]byte(sample), "k1", priv)
	if err != nil {
		t.Fatal(err)
	}
	if id, err := Verify(signed, keys); err != nil || id != "k1" {
		t.Fatalf("a signed file must verify: %v", err)
	}
	if _, err := Parse(signed); err != nil {
		t.Fatalf("a signed file must still parse: %v", err)
	}
	// reformatting does not matter, changing a word does
	changed := strings.Replace(string(signed), `50000000`, `90000000`, 1)
	if changed == string(signed) {
		t.Fatal("test setup: nothing changed")
	}
	if _, err := Verify([]byte(changed), keys); err == nil {
		t.Fatal("a changed file must be refused")
	}
	if _, err := Verify([]byte(sample), keys); err == nil {
		t.Fatal("an unsigned file must be refused")
	}
	otherPub, otherPriv, _ := ed25519.GenerateKey(rand.Reader)
	_ = otherPub
	forged, _ := Sign([]byte(sample), "k1", otherPriv)
	if _, err := Verify(forged, keys); err == nil {
		t.Fatal("a file signed with another key must be refused")
	}
}

func TestJSONNumbersFromTheRequestAreAccepted(t *testing.T) {
	p, _ := Parse([]byte(sample))
	v, err := p.CheckValues(map[string]any{"item": "x", "amount": json.Number("2500000")})
	if err != nil || v["amount"] != 2500000.0 {
		t.Fatalf("%v %v", err, v)
	}
}
