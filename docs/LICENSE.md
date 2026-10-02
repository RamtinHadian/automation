# Licence and activation

The system only runs where the vendor allowed it. An **activation code** is a small signed document (customer, expiry, number of users, and the *install code* of the server it is for). Only the vendor's private key can sign one; the server holds the public key (`server/internal/license/license.go`) and checks the signature.

## What the customer sees
- A fresh installation shows an activation screen: it displays the **install code** (derived from a random id stored in the database plus the host's machine id) and asks for the activation code. Until then the whole API answers 403.
- An installation that already holds real data when it first receives this version gets a **30-day grace period** (banner on top), so it is not locked out.
- When the licence expires the system becomes **read-only** (viewing works, changes are refused) and a red banner shows; entering a new code makes it work again. Winding the clock back does not extend a licence.
- The user limit of the licence is enforced when creating users. Settings -> «مجوز و فعال‌سازی» shows the licence and takes a renewed code.
- The public demo (`DEMO=1`) is exempt.

## Issuing a code (vendor, on your own computer)
```
cd server
go run ./cmd/licensetool issue -key C:/Users/<you>/hoormand-license/hoormand-license-private.key \
    -customer "Company name" -fp XXXX-XXXX-XXXX-XXXX-XXXX -days 365 -users 50
go run ./cmd/licensetool show <code>
```
`-fp` is the install code the customer sends you. `-users 0` means unlimited.

## The private key
Created once with `licensetool keygen`. **Keep it secret and back it up outside the project** (never commit it). If it is lost no new codes can be made: a new key pair would have to be embedded and every customer re-licensed.

## Honest limits
A licence stops copying, casual sharing and expired use. Someone with full control of a server and the skill to patch the program can still remove the check; for that the contract and the update/support subscription are the protection. Deliver the compiled image, not the source.

## The vendor portal (a web page on your own computer)
Double-click `open-license-portal.cmd` (next to the private key; built with `go build -o <dir>/hoormand-license-portal.exe ./cmd/licensetool`). It opens http://127.0.0.1:8765 in the browser: fill the customer name and the install code, pick the duration and the user limit, press the button, copy the code. It lists everything issued (searchable, with a Renew shortcut) and can check a code. The history is kept next to the key (`issued-licenses.json`). It listens on 127.0.0.1 only and refuses other hosts and pages; the private key never leaves the computer.
