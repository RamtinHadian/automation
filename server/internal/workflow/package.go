// Package workflow is Hoormand's workflow engine: a customer's own workflow comes as a signed «بستهٔ گردشکار» file that we write for them.
//
// The file says who may start the workflow, which form they fill, and the steps (approval, task, condition, notice, end). The server runs the
// steps; this package holds only the pure parts (reading, checking, signing, and moving an instance forward) so they can be tested without a database.
// The file carries our digital signature: anything changed in it by anyone else makes the signature wrong and the server refuses it.
package workflow

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

const Format = "hoormand-workflow/1"

// Ref points at people: who starts, who decides, who is told.
//
//	starter         the person who started the request
//	starterManager  the manager of the starter's unit (the CEO when the unit has none)
//	ceo             the CEO (who may sign official letters)
//	admin           the system administrators
//	user            one person: ref = e-mail, id or full name
//	unit            the manager of a unit: ref = the unit's name
//	unitMembers     everybody of a unit: ref = the unit's name
//	field           the person chosen in a «person» field of the form: ref = the field's key
//	everyone        (only for «start.allow») every signed-in person
type Ref struct {
	Kind string `json:"kind"`
	Ref  string `json:"ref,omitempty"`
}

type Field struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Type     string   `json:"type"` // text textarea number money date select person yesno
	Required bool     `json:"required,omitempty"`
	Options  []string `json:"options,omitempty"`
	Hint     string   `json:"hint,omitempty"`
}

// Cond is a yes/no question about the form: one comparison, or all / any of several.
type Cond struct {
	Field string `json:"field,omitempty"`
	Op    string `json:"op,omitempty"` // == != > >= < <= contains empty notEmpty
	Value any    `json:"value,omitempty"`
	All   []Cond `json:"all,omitempty"`
	Any   []Cond `json:"any,omitempty"`
}

type Step struct {
	ID   string `json:"id"`
	Type string `json:"type"` // approval task condition notify end
	Name string `json:"name,omitempty"`
	// approval / task
	Who      []Ref   `json:"who,omitempty"`
	Mode     string  `json:"mode,omitempty"` // approval only: "any" (default, one of them is enough) or "all"
	Hours    float64 `json:"hours,omitempty"`
	Escalate []Ref   `json:"escalate,omitempty"` // told too (and allowed to act) when the time is over
	Next     string  `json:"next,omitempty"`
	OnReject string  `json:"onReject,omitempty"` // approval: where a «no» goes (default: the request ends as rejected)
	// condition
	If   *Cond  `json:"if,omitempty"`
	Then string `json:"then,omitempty"`
	Else string `json:"else,omitempty"`
	// notify
	To   []Ref  `json:"to,omitempty"`
	Text string `json:"text,omitempty"`
	// end
	Outcome string `json:"outcome,omitempty"` // approved | rejected | done
}

type Start_ struct {
	Allow []Ref  `json:"allow,omitempty"`
	Title string `json:"title,omitempty"`
}

type Signature struct {
	Alg   string `json:"alg"`
	KeyID string `json:"keyId"`
	Value string `json:"value"`
}

type Package struct {
	Format      string     `json:"format"`
	ID          string     `json:"id"`
	Version     int        `json:"version"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Customer    string     `json:"customer,omitempty"`
	Start       Start_     `json:"start"`
	Fields      []Field    `json:"fields,omitempty"`
	Steps       []Step     `json:"steps"`
	Signature   *Signature `json:"signature,omitempty"`
}

var slug = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,48}$`)
var stepID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)

func (p *Package) Step(id string) *Step {
	for i := range p.Steps {
		if p.Steps[i].ID == id {
			return &p.Steps[i]
		}
	}
	return nil
}

func (p *Package) First() string {
	if len(p.Steps) == 0 {
		return ""
	}
	return p.Steps[0].ID
}

var fieldTypes = map[string]bool{"text": true, "textarea": true, "number": true, "money": true, "date": true, "select": true, "person": true, "yesno": true}
var refKinds = map[string]bool{"starter": true, "starterManager": true, "ceo": true, "admin": true, "user": true, "unit": true, "unitMembers": true, "field": true}
var condOps = map[string]bool{"==": true, "!=": true, ">": true, ">=": true, "<": true, "<=": true, "contains": true, "empty": true, "notEmpty": true}

// Parse reads the file and checks it completely; the error says in Persian what is wrong (the administrator sees it when uploading).
func Parse(raw []byte) (*Package, error) {
	var p Package
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&p); err != nil {
		return nil, fmt.Errorf("فایل گردشکار خوانده نشد (%v)", err)
	}
	if err := p.Validate(); err != nil {
		return nil, err
	}
	return &p, nil
}

func (p *Package) refsOK(where string, refs []Ref, allowEveryone bool) error {
	for _, r := range refs {
		if r.Kind == "everyone" && allowEveryone {
			continue
		}
		if !refKinds[r.Kind] {
			return fmt.Errorf("%s: نوع «%s» شناخته‌شده نیست", where, r.Kind)
		}
		need := r.Kind == "user" || r.Kind == "unit" || r.Kind == "unitMembers" || r.Kind == "field"
		if need && strings.TrimSpace(r.Ref) == "" {
			return fmt.Errorf("%s: برای «%s» باید مرجع نوشته شود", where, r.Kind)
		}
		if r.Kind == "field" {
			f := p.field(r.Ref)
			if f == nil || f.Type != "person" {
				return fmt.Errorf("%s: فیلد «%s» وجود ندارد یا از نوع «person» نیست", where, r.Ref)
			}
		}
	}
	return nil
}

func (p *Package) field(key string) *Field {
	for i := range p.Fields {
		if p.Fields[i].Key == key {
			return &p.Fields[i]
		}
	}
	return nil
}

func (p *Package) condOK(where string, c *Cond) error {
	if c == nil {
		return fmt.Errorf("%s: شرط نوشته نشده است", where)
	}
	if len(c.All) > 0 || len(c.Any) > 0 {
		for i := range c.All {
			if err := p.condOK(where, &c.All[i]); err != nil {
				return err
			}
		}
		for i := range c.Any {
			if err := p.condOK(where, &c.Any[i]); err != nil {
				return err
			}
		}
		return nil
	}
	if p.field(c.Field) == nil {
		return fmt.Errorf("%s: فیلد «%s» در فرم وجود ندارد", where, c.Field)
	}
	if !condOps[c.Op] {
		return fmt.Errorf("%s: عملگر «%s» شناخته‌شده نیست", where, c.Op)
	}
	return nil
}

// Validate checks everything that could make an instance get stuck or lost.
func (p *Package) Validate() error {
	if p.Format != Format {
		return fmt.Errorf("قالب فایل باید «%s» باشد", Format)
	}
	if !slug.MatchString(p.ID) {
		return errors.New("شناسهٔ گردشکار (id) باید انگلیسی کوچک، عدد و خط تیره باشد")
	}
	if p.Version < 1 {
		return errors.New("شمارهٔ نسخه (version) باید ۱ یا بیشتر باشد")
	}
	if strings.TrimSpace(p.Name) == "" {
		return errors.New("نام گردشکار (name) نوشته نشده است")
	}
	if len(p.Steps) == 0 || len(p.Steps) > 60 {
		return errors.New("گردشکار باید بین ۱ تا ۶۰ مرحله داشته باشد")
	}
	if len(p.Fields) > 40 {
		return errors.New("فرم بیش از ۴۰ فیلد ندارد")
	}
	keys := map[string]bool{}
	for _, f := range p.Fields {
		if !stepID.MatchString(f.Key) || keys[f.Key] {
			return fmt.Errorf("کلید فیلد «%s» تکراری یا نادرست است", f.Key)
		}
		keys[f.Key] = true
		if !fieldTypes[f.Type] {
			return fmt.Errorf("نوع فیلد «%s» شناخته‌شده نیست", f.Key)
		}
		if f.Type == "select" && len(f.Options) == 0 {
			return fmt.Errorf("فیلد «%s» گزینه ندارد", f.Key)
		}
		if strings.TrimSpace(f.Label) == "" {
			return fmt.Errorf("فیلد «%s» عنوان ندارد", f.Key)
		}
	}
	if err := p.refsOK("شروع", p.Start.Allow, true); err != nil {
		return err
	}
	ids := map[string]bool{}
	for _, s := range p.Steps {
		if !stepID.MatchString(s.ID) || ids[s.ID] {
			return fmt.Errorf("شناسهٔ مرحلهٔ «%s» تکراری یا نادرست است", s.ID)
		}
		ids[s.ID] = true
	}
	target := func(where, id string, required bool) error {
		if id == "" {
			if required {
				return fmt.Errorf("%s: مرحلهٔ بعد نوشته نشده است", where)
			}
			return nil
		}
		if !ids[id] {
			return fmt.Errorf("%s: مرحلهٔ «%s» وجود ندارد", where, id)
		}
		return nil
	}
	ends := 0
	for _, s := range p.Steps {
		w := "مرحلهٔ «" + s.ID + "»"
		switch s.Type {
		case "approval", "task":
			if len(s.Who) == 0 {
				return fmt.Errorf("%s: تأییدکننده/انجام‌دهنده (who) نوشته نشده است", w)
			}
			if err := p.refsOK(w, s.Who, false); err != nil {
				return err
			}
			if err := p.refsOK(w, s.Escalate, false); err != nil {
				return err
			}
			if s.Hours < 0 || s.Hours > 24*365 {
				return fmt.Errorf("%s: مهلت (hours) درست نیست", w)
			}
			if s.Type == "approval" && s.Mode != "" && s.Mode != "any" && s.Mode != "all" {
				return fmt.Errorf("%s: mode باید any یا all باشد", w)
			}
			if s.Mode == "all" && len(s.Escalate) > 0 {
				return fmt.Errorf("%s: وقتی همهٔ تأییدکننده‌ها باید تأیید کنند (mode=all) ارجاع بعد از مهلت (escalate) ممکن نیست", w)
			}
			if err := target(w+" (next)", s.Next, true); err != nil {
				return err
			}
			if err := target(w+" (onReject)", s.OnReject, false); err != nil {
				return err
			}
		case "condition":
			if err := p.condOK(w, s.If); err != nil {
				return err
			}
			if err := target(w+" (then)", s.Then, true); err != nil {
				return err
			}
			if err := target(w+" (else)", s.Else, true); err != nil {
				return err
			}
		case "notify":
			if len(s.To) == 0 || strings.TrimSpace(s.Text) == "" {
				return fmt.Errorf("%s: گیرنده (to) یا متن (text) نوشته نشده است", w)
			}
			if err := p.refsOK(w, s.To, false); err != nil {
				return err
			}
			if err := target(w+" (next)", s.Next, true); err != nil {
				return err
			}
		case "end":
			if s.Outcome != "approved" && s.Outcome != "rejected" && s.Outcome != "done" {
				return fmt.Errorf("%s: نتیجهٔ پایان (outcome) باید approved یا rejected یا done باشد", w)
			}
			ends++
		default:
			return fmt.Errorf("%s: نوع «%s» شناخته‌شده نیست", w, s.Type)
		}
	}
	if ends == 0 {
		return errors.New("گردشکار باید دست‌کم یک مرحلهٔ پایان (end) داشته باشد")
	}
	// every step must be reachable from the first one (a forgotten step is almost always a mistake)
	seen := map[string]bool{}
	var walk func(id string)
	walk = func(id string) {
		if id == "" || seen[id] {
			return
		}
		seen[id] = true
		s := p.Step(id)
		if s == nil {
			return
		}
		walk(s.Next)
		walk(s.OnReject)
		walk(s.Then)
		walk(s.Else)
	}
	walk(p.First())
	for _, s := range p.Steps {
		if !seen[s.ID] {
			return fmt.Errorf("مرحلهٔ «%s» از مرحلهٔ اول به آن راهی نیست", s.ID)
		}
	}
	return nil
}

// ---------- signature ----------

// TrustedKeys are the public keys whose signatures the server accepts (keyId → key). A file signed by anyone else, or changed after signing, is refused.
var TrustedKeys = map[string]ed25519.PublicKey{}

// Canonical is the exact text that is signed: the file without its signature, keys sorted, no extra spaces.
func Canonical(raw []byte) ([]byte, error) {
	var m map[string]any
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&m); err != nil {
		return nil, errors.New("فایل گردشکار خوانده نشد")
	}
	delete(m, "signature")
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(sortKeys(m)); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

// sortKeys: json.Marshal already sorts map keys; this only makes that explicit for nested values.
func sortKeys(v any) any {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out := make(map[string]any, len(t))
		for _, k := range keys {
			out[k] = sortKeys(t[k])
		}
		return out
	case []any:
		for i := range t {
			t[i] = sortKeys(t[i])
		}
	}
	return v
}

// Sign adds the signature to the file (used by our own tool, never by the server).
func Sign(raw []byte, keyID string, priv ed25519.PrivateKey) ([]byte, error) {
	c, err := Canonical(raw)
	if err != nil {
		return nil, err
	}
	sig := ed25519.Sign(priv, c)
	var m map[string]any
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&m); err != nil {
		return nil, err
	}
	m["signature"] = map[string]any{"alg": "ed25519", "keyId": keyID, "value": base64.StdEncoding.EncodeToString(sig)}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(m); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// Verify checks the signature of a file against the trusted keys. It returns the key id that signed it.
func Verify(raw []byte, keys map[string]ed25519.PublicKey) (string, error) {
	var head struct {
		Signature *Signature `json:"signature"`
	}
	if err := json.Unmarshal(raw, &head); err != nil || head.Signature == nil {
		return "", errors.New("این فایل امضا ندارد؛ فقط فایل‌هایی که ما امضا کرده‌ایم پذیرفته می‌شوند")
	}
	s := head.Signature
	key, ok := keys[s.KeyID]
	if !ok || s.Alg != "ed25519" {
		return "", errors.New("امضای فایل از طرف ما نیست")
	}
	sig, err := base64.StdEncoding.DecodeString(s.Value)
	if err != nil {
		return "", errors.New("امضای فایل خراب است")
	}
	c, err := Canonical(raw)
	if err != nil {
		return "", err
	}
	if !ed25519.Verify(key, c, sig) {
		return "", errors.New("فایل بعد از امضا تغییر کرده است؛ امضا درست نیست")
	}
	return s.KeyID, nil
}
