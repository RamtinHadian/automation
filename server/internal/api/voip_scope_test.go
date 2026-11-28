package api

import (
	"regexp"
	"strings"
	"testing"
)

func TestVoipOwnCustomersPlaceholders(t *testing.T) {
	s := voipOwnCustomers(3)
	re := regexp.MustCompile(`\$\d+`)
	got := map[string]bool{}
	for _, m := range re.FindAllString(s, -1) {
		got[m] = true
	}
	if !got["$3"] || !got["$4"] || got["$1"] || got["$2"] {
		t.Fatalf("placeholders %v in %s", got, s)
	}
	if !strings.Contains(s, "COALESCE(customer_id, '') = ''") {
		t.Fatal("calls of numbers that are nobody's customer must stay visible")
	}
	s5 := voipOwnCustomers(4)
	if strings.Contains(s5, "$3") || !strings.Contains(s5, "$4") || !strings.Contains(s5, "$5") {
		t.Fatalf("shifted placeholders wrong: %s", s5)
	}
}
