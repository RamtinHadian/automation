// Package jsonx has small helpers for the free-form JSON documents the app stores.
// Numbers are kept exactly as written (json.Number), so a document is never altered by passing through the server.
package jsonx

import (
	"bytes"
	"encoding/json"
)

// M is a JSON object.
type M = map[string]any

// Decode parses a JSON object; anything else gives an empty object.
func Decode(raw []byte) M {
	m := M{}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&m); err != nil || m == nil {
		return M{}
	}
	return m
}

// Encode turns any value into JSON text (for a jsonb parameter).
func Encode(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

// Str returns a string field, or "".
func Str(m M, key string) string {
	s, _ := m[key].(string)
	return s
}

// Bool returns a boolean field, false when missing.
func Bool(m M, key string) bool {
	b, _ := m[key].(bool)
	return b
}

// Sub returns a nested object, or an empty one.
func Sub(m M, key string) M {
	s, _ := m[key].(map[string]any)
	if s == nil {
		return M{}
	}
	return s
}

// Arr returns a list field, or nil.
func Arr(m M, key string) []any {
	a, _ := m[key].([]any)
	return a
}

// Strings returns the string elements of a list field.
func Strings(m M, key string) []string {
	out := []string{}
	for _, v := range Arr(m, key) {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// IDs returns the "id" of every object in a list field.
func IDs(m M, key string) []string {
	out := []string{}
	for _, v := range Arr(m, key) {
		if o, ok := v.(map[string]any); ok {
			if id, ok := o["id"].(string); ok {
				out = append(out, id)
			}
		}
	}
	return out
}

// Int returns a numeric field as int (0 when missing).
func Int(m M, key string) int {
	switch n := m[key].(type) {
	case json.Number:
		i, _ := n.Int64()
		if i == 0 {
			f, _ := n.Float64()
			return int(f)
		}
		return int(i)
	case float64:
		return int(n)
	}
	return 0
}

// Contains reports whether list has value.
func Contains(list []string, value string) bool {
	for _, v := range list {
		if v == value {
			return true
		}
	}
	return false
}

// Copy returns a shallow copy of m.
func Copy(m M) M {
	out := make(M, len(m)+4)
	for k, v := range m {
		out[k] = v
	}
	return out
}
