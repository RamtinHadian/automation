package api

import "testing"

func TestSortedFreedSmallestFirst(t *testing.T) {
	got := sortedFreed([]string{"X-120", "X-9", "X-101"}, func(string) bool { return true })
	if len(got) != 3 || got[0] != "X-9" || got[1] != "X-101" || got[2] != "X-120" {
		t.Fatalf("order: %v", got)
	}
	only := sortedFreed([]string{"A-1405-0003", "B-1405-0001"}, func(s string) bool { return s[0] == 'A' })
	if len(only) != 1 || only[0] != "A-1405-0003" {
		t.Fatalf("filter: %v", only)
	}
}
