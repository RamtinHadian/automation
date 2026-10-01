package push

import (
	"testing"

	"automation/server/internal/jsonx"
)

func TestPayloadShowsOnlyTheSender(t *testing.T) {
	p := Payload(jsonx.M{"id": "n1", "title": "فایل جدید از علی", "body": "report.pdf", "kind": "file", "from": "علی رضایی", "unread": 3})
	if p["title"] != "از طرف علی رضایی" || p["body"] != "" || p["unread"] != 3 {
		t.Fatalf("unexpected payload: %v", p)
	}
}

func TestPayloadWithoutSenderKeepsText(t *testing.T) {
	p := Payload(jsonx.M{"id": "n2", "title": "تماس ورودی از 502", "body": "داخلی 501", "kind": "call"})
	if p["title"] != "تماس ورودی از 502" || p["body"] != "داخلی 501" {
		t.Fatalf("unexpected payload: %v", p)
	}
}
