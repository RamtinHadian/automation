// licensetool is the vendor's tool for activation codes. It is NOT part of the server image.
//
//	licensetool keygen  -out <dir>                                   make the signing key pair (do this once, keep the private key safe)
//	licensetool issue   -key <private.key> -customer "<name>" -fp <install code> -days 365 -users 50
//	licensetool serve   -key <private.key>                           open the vendor portal on this computer (a web page to make codes)
//	licensetool show    <code>                                       print what a code says
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"automation/server/internal/license"
)

// asciiDigits turns Persian/Arabic digits (the screen may show the install code that way) into 0-9.
func asciiDigits(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= '۰' && r <= '۹':
			return '0' + (r - '۰')
		case r >= '٠' && r <= '٩':
			return '0' + (r - '٠')
		}
		return r
	}, s)
}

func flagSet(name string) *flag.FlagSet { return flag.NewFlagSet(name, flag.ExitOnError) }

func die(msg string) {
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}

func main() {
	if len(os.Args) < 2 {
		die("usage: licensetool keygen|issue|serve|show")
	}
	switch os.Args[1] {
	case "keygen":
		fs := flag.NewFlagSet("keygen", flag.ExitOnError)
		out := fs.String("out", ".", "folder for the private key")
		_ = fs.Parse(os.Args[2:])
		pub, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			die(err.Error())
		}
		path := filepath.Join(*out, "hoormand-license-private.key")
		if _, err := os.Stat(path); err == nil {
			die("a private key already exists there; refusing to overwrite it")
		}
		if err := os.WriteFile(path, []byte(base64.StdEncoding.EncodeToString(priv)), 0o600); err != nil {
			die(err.Error())
		}
		fmt.Println("private key written to:", path, "(keep it secret, back it up, never put it in the project)")
		fmt.Println("public key (paste into internal/license/license.go):")
		fmt.Println(base64.StdEncoding.EncodeToString(pub))
	case "issue":
		fs := flag.NewFlagSet("issue", flag.ExitOnError)
		key := fs.String("key", "", "private key file")
		customer := fs.String("customer", "", "customer name")
		fp := fs.String("fp", "", "install code shown by the server")
		days := fs.Float64("days", 365, "validity in days")
		users := fs.Int("users", 0, "maximum number of users (0 = unlimited)")
		serial := fs.String("serial", "", "serial (default: from the time)")
		_ = fs.Parse(os.Args[2:])
		raw, err := os.ReadFile(*key)
		if err != nil {
			die("cannot read the private key: " + err.Error())
		}
		b, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(raw)))
		if err != nil || len(b) != ed25519.PrivateKeySize {
			die("the private key file is damaged")
		}
		if *customer == "" || *fp == "" {
			die("-customer and -fp are required")
		}
		now := time.Now()
		if *serial == "" {
			*serial = now.Format("060102-150405")
		}
		l := license.License{Serial: *serial, Customer: *customer, FP: asciiDigits(strings.ToUpper(strings.TrimSpace(*fp))), Issued: now.Unix(), Expires: now.Add(time.Duration(*days * 24 * float64(time.Hour))).Unix(), MaxUsers: *users}
		fmt.Println(license.Encode(ed25519.PrivateKey(b), l))
	case "serve":
		serve(os.Args[2:])
	case "show":
		if len(os.Args) < 3 {
			die("usage: licensetool show <code>")
		}
		l, err := license.Decode(os.Args[2])
		if err != nil {
			die(err.Error())
		}
		fmt.Printf("customer: %s\nserial: %s\ninstall code: %s\nissued: %s\nexpires: %s\nmax users: %d\n", l.Customer, l.Serial, l.FP, time.Unix(l.Issued, 0).Format(time.RFC3339), time.Unix(l.Expires, 0).Format(time.RFC3339), l.MaxUsers)
	default:
		die("usage: licensetool keygen|issue|serve|show")
	}
}
