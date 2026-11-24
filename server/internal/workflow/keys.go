package workflow

import (
	"crypto/ed25519"
	"encoding/base64"
)

// The public keys of ours that sign workflow packages. The matching private key is a file only we hold (see cmd/wfpack).
// To change the key: add a new id here (keep the old one while old files are still in use) and sign new files with the new one.
var publicKeys = map[string]string{
	"hoormand-1": "XlNrApfXeREGq6LN8SLgFkKqX4KTd2OsTtNrCnAhPjE=",
}

func init() {
	for id, b := range publicKeys {
		if raw, err := base64.StdEncoding.DecodeString(b); err == nil && len(raw) == ed25519.PublicKeySize {
			TrustedKeys[id] = ed25519.PublicKey(raw)
		}
	}
}
