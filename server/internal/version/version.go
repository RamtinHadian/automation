// Package version tells which release of the system is running. The number lives in the VERSION file at the root of the project
// ("1.0.42 2026-10-02"); a git hook raises its last part by one with every commit, and the file is copied into the image.
package version

import (
	"os"
	"strings"
)

type Info struct {
	Version string `json:"version"`
	Date    string `json:"date"`
}

// Current reads the file once per call (it is tiny); without a file the build is a development one.
func Current() Info {
	path := os.Getenv("VERSION_FILE")
	if path == "" {
		path = "/app/VERSION"
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return Info{Version: "dev"}
	}
	f := strings.Fields(string(b))
	switch len(f) {
	case 0:
		return Info{Version: "dev"}
	case 1:
		return Info{Version: f[0]}
	}
	return Info{Version: f[0], Date: f[1]}
}
