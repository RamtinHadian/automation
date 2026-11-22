package auth

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"regexp"
	"runtime"
	"strings"
	"time"

	"automation/server/internal/store"
)

// The diagnostics console of the support access: a FIXED list of read-only checks written in Go. There is no shell and no way to start another program.

type supportCmd struct{ name, usage, help string }

var supportCmds = []supportCmd{
	{"help", "help", "فهرست دستورها"},
	{"all", "all", "همهٔ آزمون‌های اصلی با هم (system, disk, db, network)"},
	{"version", "version", "نسخهٔ برنامه و محیط اجرا"},
	{"system", "system", "زمان روشن‌بودن، بار، حافظه و تعداد پردازش‌های برنامه"},
	{"disk", "disk", "فضای آزاد دیسک (پوشهٔ فایل‌ها و ریشه)"},
	{"db", "db", "اتصال و سرعت پایگاه داده، حجم و تعداد اتصال‌ها"},
	{"network", "network", "آزمون اینترنت سرور: github، docker hub، togpt و ..."},
	{"dns", "dns <host>", "پیدا کردن آدرس یک نام"},
	{"tcp", "tcp <host:port>", "باز بودن یک پورت"},
	{"https", "https <url>", "درخواست HEAD به یک آدرس https و نمایش پاسخ"},
}

func supportHelpList() []map[string]string {
	out := []map[string]string{}
	for _, c := range supportCmds {
		out = append(out, map[string]string{"usage": c.usage, "help": c.help})
	}
	return out
}

var (
	hostRe = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$`)
	portRe = regexp.MustCompile(`^[0-9]{1,5}$`)
)

func supportExec(ctx context.Context, line string) string {
	f := strings.Fields(line)
	if len(f) == 0 {
		return "دستوری وارد نشده. help را بزنید."
	}
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	switch strings.ToLower(f[0]) {
	case "help":
		var b strings.Builder
		for _, c := range supportCmds {
			fmt.Fprintf(&b, "%-18s %s\n", c.usage, c.help)
		}
		return b.String()
	case "all":
		return strings.Join([]string{"## system", supSystem(), "## disk", supDisk(), "## db", supDB(ctx), "## network", supNetwork(ctx)}, "\n")
	case "version":
		v, _ := os.ReadFile("/app/VERSION")
		host, _ := os.Hostname()
		return fmt.Sprintf("app: %s\ngo: %s %s/%s\nhost(container): %s", strings.TrimSpace(string(v)), runtime.Version(), runtime.GOOS, runtime.GOARCH, host)
	case "system":
		return supSystem()
	case "disk":
		return supDisk()
	case "db":
		return supDB(ctx)
	case "network":
		return supNetwork(ctx)
	case "dns":
		if len(f) != 2 || !hostRe.MatchString(f[1]) {
			return "استفاده: dns <host>"
		}
		return supDNS(ctx, f[1])
	case "tcp":
		if len(f) != 2 {
			return "استفاده: tcp <host:port>"
		}
		h, p, err := net.SplitHostPort(f[1])
		if err != nil || !hostRe.MatchString(h) || !portRe.MatchString(p) {
			return "استفاده: tcp <host:port>"
		}
		return supTCP(f[1])
	case "https":
		if len(f) != 2 || !strings.HasPrefix(f[1], "https://") || len(f[1]) > 200 {
			return "استفاده: https https://example.com"
		}
		return supHTTPS(ctx, f[1])
	}
	return "دستور ناشناخته است (برنامهٔ دیگری اجرا نمی‌شود). help را بزنید."
}

func readFirst(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func supSystem() string {
	var b strings.Builder
	if up := strings.Fields(readFirst("/proc/uptime")); len(up) > 0 {
		var sec float64
		fmt.Sscan(up[0], &sec)
		fmt.Fprintf(&b, "uptime (host): %dd %dh %dm\n", int(sec)/86400, int(sec)%86400/3600, int(sec)%3600/60)
	}
	if l := readFirst("/proc/loadavg"); l != "" {
		fmt.Fprintf(&b, "load: %s\n", l)
	}
	fmt.Fprintf(&b, "cpus: %d\n", runtime.NumCPU())
	b.WriteString(supMemory())
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	fmt.Fprintf(&b, "app: goroutines %d, heap %d MB\n", runtime.NumGoroutine(), m.HeapAlloc>>20)
	return b.String()
}

func supMemory() string {
	vals := map[string]int64{}
	for _, ln := range strings.Split(readFirst("/proc/meminfo"), "\n") {
		var k string
		var v int64
		if _, err := fmt.Sscanf(strings.ReplaceAll(ln, ":", " "), "%s %d", &k, &v); err == nil {
			vals[k] = v
		}
	}
	if vals["MemTotal"] == 0 {
		return "memory: unknown\n"
	}
	return fmt.Sprintf("memory (host): total %d MB, available %d MB, swap used %d MB\n", vals["MemTotal"]>>10, vals["MemAvailable"]>>10, (vals["SwapTotal"]-vals["SwapFree"])>>10)
}

func supDB(ctx context.Context) string {
	var b strings.Builder
	t := time.Now()
	if err := store.Pool.Ping(ctx); err != nil {
		return "db: FAILED (" + err.Error() + ")"
	}
	fmt.Fprintf(&b, "db ping: ok, %d ms\n", time.Since(t).Milliseconds())
	var size int64
	var conns int
	_ = store.Pool.QueryRow(ctx, `SELECT pg_database_size(current_database())`).Scan(&size)
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()`).Scan(&conns)
	fmt.Fprintf(&b, "db size: %d MB, connections: %d\n", size>>20, conns)
	var users, customers int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&users)
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM crm_customers`).Scan(&customers)
	fmt.Fprintf(&b, "rows: users %d, customers %d (counts only)\n", users, customers)
	return b.String()
}

func supDNS(ctx context.Context, host string) string {
	t := time.Now()
	ips, err := net.DefaultResolver.LookupHost(ctx, host)
	if err != nil {
		return fmt.Sprintf("dns %s: FAILED (%v)", host, err)
	}
	return fmt.Sprintf("dns %s: %s (%d ms)", host, strings.Join(ips, ", "), time.Since(t).Milliseconds())
}

func supTCP(hostport string) string {
	t := time.Now()
	c, err := net.DialTimeout("tcp", hostport, 8*time.Second)
	if err != nil {
		return fmt.Sprintf("tcp %s: FAILED (%v)", hostport, err)
	}
	_ = c.Close()
	return fmt.Sprintf("tcp %s: open (%d ms)", hostport, time.Since(t).Milliseconds())
}

func supHTTPS(ctx context.Context, u string) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, u, nil)
	if err != nil {
		return "https: invalid address"
	}
	t := time.Now()
	cl := &http.Client{Timeout: 12 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := cl.Do(req)
	if err != nil {
		return fmt.Sprintf("https %s: FAILED (%v)", u, err)
	}
	resp.Body.Close()
	note := ""
	if resp.StatusCode == 403 || resp.StatusCode == 451 {
		note = "  <- the site refuses this server (sanctions / firewall?)"
	}
	return fmt.Sprintf("https %s: %d %s (%d ms)%s", u, resp.StatusCode, http.StatusText(resp.StatusCode), time.Since(t).Milliseconds(), note)
}

func supNetwork(ctx context.Context) string {
	var b strings.Builder
	for _, h := range []string{"github.com", "registry-1.docker.io", "togpt.ir", "www.google.com"} {
		b.WriteString(supDNS(ctx, h) + "\n")
	}
	b.WriteString(supTCP("8.8.8.8:53") + "\n")
	for _, u := range []string{"https://github.com", "https://registry-1.docker.io/v2/", "https://togpt.ir"} {
		b.WriteString(supHTTPS(ctx, u) + "\n")
	}
	return b.String()
}

func supDisk() string {
	var b strings.Builder
	for _, p := range []string{"/", "/files", "/app"} {
		if line := statfs(p); line != "" {
			b.WriteString(line + "\n")
		}
	}
	return b.String()
}
