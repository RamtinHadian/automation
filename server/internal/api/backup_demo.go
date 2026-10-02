package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"automation/server/internal/httpx"
)

// In the public demo nothing may reach out to a real network or run someone else's SQL, so the features are shown on a pretend network:
// the folder picker lists a made-up server, the connection test always "succeeds", and only a backup file that was downloaded from
// this same demo can be uploaded again.

var demoTree = map[string][]string{
	"":                       {"Backup", "Archive", "Documents"},
	"Backup":                 {"hoormand", "Daily", "Weekly"},
	"Backup/hoormand":        {"nightly", "manual"},
	"Archive":                {"2025", "2026"},
	"Documents":              {"Contracts", "Invoices"},
}

var (
	demoBrowseMu   sync.Mutex
	demoBrowseLast map[string]any
)

func demoBrowse(w http.ResponseWriter, id, path string) {
	items := demoTree[path]
	if items == nil {
		items = []string{}
	}
	demoBrowseMu.Lock()
	demoBrowseLast = map[string]any{"id": id, "result": "ok", "path": path, "text": "", "items": items}
	demoBrowseMu.Unlock()
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id})
}

func demoBrowseResult() (map[string]any, bool) {
	demoBrowseMu.Lock()
	defer demoBrowseMu.Unlock()
	return demoBrowseLast, demoBrowseLast != nil
}

func demoNetTest() {
	m := map[string]any{"result": "ok", "at": time.Now().Format(time.RFC3339), "text": "نمایشی: اتصال به شبکهٔ فرضی برقرار است"}
	raw, _ := json.Marshal(m)
	_ = os.WriteFile(filepath.Join(backupDir(), ".nettest.json"), raw, 0o644)
}

// demoUploadAllowed accepts the file only if it is byte-for-byte one of the backups this demo has made.
func demoUploadAllowed(tmp string) bool {
	sum := func(p string) string {
		f, err := os.Open(p)
		if err != nil {
			return ""
		}
		defer f.Close()
		h := sha256.New()
		if _, err := io.Copy(h, f); err != nil {
			return ""
		}
		return hex.EncodeToString(h.Sum(nil))
	}
	want := sum(tmp)
	entries, _ := os.ReadDir(backupDir())
	for _, e := range entries {
		if backupName.MatchString(e.Name()) && !strings.HasSuffix(e.Name(), "-uploaded.dump") && sum(filepath.Join(backupDir(), e.Name())) == want {
			return true
		}
	}
	return false
}
