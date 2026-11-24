package workflow

import (
	"embed"
	"sort"
)

//go:embed examples/*.signed.json
var exampleFS embed.FS

// Examples are three signed packages we keep as models (and the demo shows them): the file name and its text.
func Examples() map[string][]byte {
	out := map[string][]byte{}
	names, _ := exampleFS.ReadDir("examples")
	sort.Slice(names, func(i, j int) bool { return names[i].Name() < names[j].Name() })
	for _, e := range names {
		if b, err := exampleFS.ReadFile("examples/" + e.Name()); err == nil {
			out[e.Name()] = b
		}
	}
	return out
}
