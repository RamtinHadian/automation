package api

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
)

// listenPort is the port this program listens on (set from the configuration when the router is built).
var listenPort = "8080"
var infoDBURL, infoAMIHost, infoAMIPort string

type serverAddr struct {
	Interface string `json:"interface"`
	IP        string `json:"ip"`
	Kind      string `json:"kind"` // private, public, link-local
	IPv6      bool   `json:"ipv6"`
}

type serverService struct {
	Name string `json:"name"`
	Host string `json:"host"`
	Port string `json:"port"`
	Note string `json:"note"`
}

func addrKind(ip net.IP) string {
	switch {
	case ip.IsLinkLocalUnicast():
		return "link-local"
	case ip.IsPrivate():
		return "private"
	default:
		return "public"
	}
}

// serverInfo tells the admin where this server can be reached: the addresses of its network cards, the port the program
// listens on, how this very page was reached, and the other services it talks to.
func serverInfo(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	host, _ := os.Hostname()
	addrs := []serverAddr{}
	if ifs, err := net.Interfaces(); err == nil {
		for _, ifc := range ifs {
			if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
				continue
			}
			as, _ := ifc.Addrs()
			for _, a := range as {
				ipn, ok := a.(*net.IPNet)
				if !ok {
					continue
				}
				addrs = append(addrs, serverAddr{Interface: ifc.Name, IP: ipn.IP.String(), Kind: addrKind(ipn.IP), IPv6: ipn.IP.To4() == nil})
			}
		}
	}
	// the address the server itself uses to reach the outside (its main one)
	main := ""
	if c, err := net.Dial("udp", "1.1.1.1:53"); err == nil {
		if ua, ok := c.LocalAddr().(*net.UDPAddr); ok {
			main = ua.IP.String()
		}
		c.Close()
	}
	_, err := os.Stat("/.dockerenv")
	docker := err == nil

	services := []serverService{{Name: "برنامهٔ سامانه (همین صفحه)", Host: "0.0.0.0", Port: listenPort, Note: "روی همهٔ کارت‌های شبکه گوش می‌دهد"}}
	if u, err := url.Parse(infoDBURL); err == nil && u.Hostname() != "" {
		p := u.Port()
		if p == "" {
			p = "5432"
		}
		services = append(services, serverService{Name: "پایگاه داده (PostgreSQL)", Host: u.Hostname(), Port: p, Note: "فقط برای خود برنامه؛ نباید از بیرون باز باشد"})
	}
	if infoAMIHost != "" {
		services = append(services, serverService{Name: "تلفن (Asterisk AMI)", Host: infoAMIHost, Port: infoAMIPort, Note: "اتصال به مرکز تلفن"})
	}

	proto := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		proto = "https"
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"hostname":  host,
		"port":      listenPort,
		"mainIP":    main,
		"addresses": addrs,
		"docker":    docker,
		"services":  services,
		"request": map[string]any{
			"host":      r.Host,
			"proto":     proto,
			"forwarded": r.Header.Get("X-Forwarded-For"),
			"remote":    r.RemoteAddr,
		},
	})
}
