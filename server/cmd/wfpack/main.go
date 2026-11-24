// wfpack: our tool for workflow packages («بستهٔ گردشکار»). Customers never get it.
//
//	wfpack keygen [-key <file>]            makes our signing key (once); prints the public key to put in server/internal/workflow/keys.go
//	wfpack check  <file.json>              checks the file completely (steps, people, targets) without signing
//	wfpack sign   <file.json> [-key <f>] [-out <f>]   checks, signs and writes the file the customer uploads (default: <name>.signed.json)
//	wfpack verify <file.signed.json>       checks that the signature is ours and the file is untouched
//	wfpack studio [-port 8099] [-dir <folder>] [-demo http://localhost:8095]   «ساز گردشکار»: builds, signs and (on the demo) uploads a workflow with forms
//
// The private key is a file on our own computer (default %USERPROFILE%\.hoormand\workflow-signing.key). It must never be committed or sent to a customer;
// keep a backup, because without it no new package can be signed (the server would then need a new public key).
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

	"automation/server/internal/workflow"
)

const keyID = "hoormand-1"

func defaultKey() string {
	h, _ := os.UserHomeDir()
	return filepath.Join(h, ".hoormand", "workflow-signing.key")
}

func die(format string, a ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", a...)
	os.Exit(1)
}

func loadKey(path string) ed25519.PrivateKey {
	b, err := os.ReadFile(path)
	if err != nil {
		die("کلید امضا خوانده نشد (%s): %v", path, err)
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(b)))
	if err != nil || len(raw) != ed25519.PrivateKeySize {
		die("فایل کلید خراب است")
	}
	return ed25519.PrivateKey(raw)
}

func main() {
	if len(os.Args) < 2 {
		die("usage: wfpack keygen|check|sign|verify")
	}
	cmd, args := os.Args[1], os.Args[2:]
	if cmd == "studio" {
		studio(args)
		return
	}
	fs := flag.NewFlagSet(cmd, flag.ExitOnError)
	keyPath := fs.String("key", defaultKey(), "signing key file")
	out := fs.String("out", "", "output file")
	// the file name may come before the flags
	var file string
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		file, args = args[0], args[1:]
	}
	_ = fs.Parse(args)
	switch cmd {
	case "keygen":
		if _, err := os.Stat(*keyPath); err == nil {
			die("این کلید از قبل هست (%s)؛ برای جلوگیری از از دست رفتن آن، روی آن نمی‌نویسم.", *keyPath)
		}
		pub, priv, _ := ed25519.GenerateKey(rand.Reader)
		_ = os.MkdirAll(filepath.Dir(*keyPath), 0o700)
		if err := os.WriteFile(*keyPath, []byte(base64.StdEncoding.EncodeToString(priv)+"\n"), 0o600); err != nil {
			die("%v", err)
		}
		fmt.Println("کلید امضا ساخته شد:", *keyPath)
		fmt.Println("از آن یک نسخهٔ پشتیبان بگیرید و هرگز آن را کامیت نکنید.")
		fmt.Println("کلید عمومی (در server/internal/workflow/keys.go می‌رود):")
		fmt.Println(base64.StdEncoding.EncodeToString(pub))
	case "check", "sign", "verify":
		if file == "" {
			die("نام فایل را بنویسید")
		}
		raw, err := os.ReadFile(file)
		if err != nil {
			die("%v", err)
		}
		switch cmd {
		case "check":
			p, err := workflow.Parse(raw)
			if err != nil {
				die("خطا: %v", err)
			}
			fmt.Printf("درست است: «%s» نسخهٔ %d، %d مرحله، %d فیلد\n", p.Name, p.Version, len(p.Steps), len(p.Fields))
		case "sign":
			if _, err := workflow.Parse(raw); err != nil {
				die("خطا: %v", err)
			}
			signed, err := workflow.Sign(raw, keyID, loadKey(*keyPath))
			if err != nil {
				die("%v", err)
			}
			dst := *out
			if dst == "" {
				dst = strings.TrimSuffix(file, ".json") + ".signed.json"
			}
			if err := os.WriteFile(dst, signed, 0o644); err != nil {
				die("%v", err)
			}
			fmt.Println("امضا شد:", dst)
		case "verify":
			id, err := workflow.Verify(raw, workflow.TrustedKeys)
			if err != nil {
				die("خطا: %v", err)
			}
			if _, err := workflow.Parse(raw); err != nil {
				die("خطا: %v", err)
			}
			fmt.Println("امضا درست است (کلید", id+")")
		}
	default:
		die("دستور ناشناخته: %s", cmd)
	}
}
