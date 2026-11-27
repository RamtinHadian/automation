package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// How the invoices made in Hoormand are numbered. The administrator chooses in the console (settings row «invoiceNumbering», kept apart from the big settings
// document because the server changes the counters by itself):
//
//	counter  the numbers are Hoormand's own counters that CONTINUE Sepidar's: the administrator says the last number used in Sepidar (e.g. 50) and Hoormand
//	         gives 51, 52… so both are the same as long as the invoices go to Sepidar one after another (each new invoice is sent to Sepidar by itself and
//	         the number Sepidar gives is compared; a difference is announced and the counter is set right)
//	sepidar  the invoice waits for the number Sepidar gives it and takes it
//	year     Hoormand's own FA-1405-0001 / NF-1405-0001 (new every Jalali year)
//
// With nothing chosen yet: «sepidar» when Sepidar is connected (and the old setting did not switch it off), else «year».

var invNumTail = regexp.MustCompile(`(\d+)$`)

func invNumRow(ctx context.Context) jsonx.M {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'invoiceNumbering'`).Scan(&raw)
	return jsonx.Decode(raw)
}

// invoiceMode answers how an invoice of this kind is numbered now.
func invoiceMode(ctx context.Context, kind string) string {
	row := invNumRow(ctx)
	mode := jsonx.Str(row, "mode")
	if mode == "" {
		var raw []byte
		_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
		set := jsonx.Decode(raw)
		if _, has := set["invoiceNumberFromSepidar"]; has && !jsonx.Bool(set, "invoiceNumberFromSepidar") {
			return "year"
		}
		mode = "sepidar"
		row = jsonx.M{"sepidarKinds": jsonx.Str(set, "invoiceSepidarKinds")}
	}
	switch mode {
	case "sepidar":
		if !sepidarEnabled(ctx) || (jsonx.Str(row, "sepidarKinds") == "official" && kind != "OFFICIAL") {
			return "year"
		}
		return "sepidar"
	case "counter":
		if _, set := jsonx.Sub(row, "ALL")["last"]; !set { // no counter given: the yearly numbers
			return "year"
		}
		return "counter"
	}
	return "year"
}

func kindPrefix(kind string) string {
	if kind == "OFFICIAL" {
		return "FA"
	}
	return "NF"
}

// the next number of the yearly kind (FA-1405-0007): one more than the highest of this year
func yearInvoiceNumber(ctx context.Context, kind string) string {
	n := time.Now().In(time.FixedZone("IRST", 3*3600+1800))
	jy, _, _ := jalali.FromGregorian(n.Year(), int(n.Month()), n.Day())
	prefix := fmt.Sprintf("%s-%d-", kindPrefix(kind), jy)
	if f := peekFreed(ctx, func(x string) bool { return strings.HasPrefix(x, prefix) }); f != "" {
		return f
	}
	max := 0
	rows, err := store.Pool.Query(ctx, `SELECT data->'invoice'->>'number' FROM crm_deals WHERE data->'invoice'->>'number' LIKE $1`+notReleased, prefix+"%")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var s string
			if rows.Scan(&s) == nil {
				if v, e := strconv.Atoi(strings.TrimPrefix(s, prefix)); e == nil && v > max {
					max = v
				}
			}
		}
	}
	return fmt.Sprintf("%s%04d", prefix, max+1)
}

// allocateCounter takes the next number of the counter (one statement, so two people never get the same number).
// One counter serves both kinds: Sepidar has one row of invoice numbers.
func allocateCounter(ctx context.Context) (string, error) {
	// a number given back (its invoice was cancelled before it went to Sepidar) is used again before the counter moves on
	for try := 0; try < 6; try++ {
		n := takeFreed(ctx, func(string) bool { return true })
		if n == "" {
			break
		}
		var used int
		_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM crm_deals WHERE data->'invoice'->>'number' = $1`+notReleased, n).Scan(&used)
		if used == 0 {
			return n, nil
		}
	}
	for try := 0; try < 6; try++ {
		var last int64
		var prefix string
		err := store.Pool.QueryRow(ctx, `UPDATE settings SET data = jsonb_set(data, '{ALL,last}', to_jsonb(COALESCE((data->'ALL'->>'last')::bigint, 0) + 1))
			WHERE key = 'invoiceNumbering' RETURNING (data->'ALL'->>'last')::bigint, COALESCE(data->'ALL'->>'prefix', '')`).Scan(&last, &prefix)
		if err != nil {
			return "", err
		}
		num := prefix + strconv.FormatInt(last, 10)
		var same int
		_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM crm_deals WHERE data->'invoice'->>'number' = $1`+notReleased, num).Scan(&same)
		if same == 0 {
			return num, nil
		}
	}
	return "", fmt.Errorf("شمارهٔ فاکتور گرفته نشد؛ دوباره تلاش کنید")
}

const invoiceNumberPending = "\x00"

// assignInvoiceNumber puts the real number on an invoice that was only marked «needs a number» (called right before the deal is saved).
func assignInvoiceNumber(ctx context.Context, doc jsonx.M) error {
	inv := jsonx.Sub(doc, "invoice")
	if jsonx.Str(inv, "number") != invoiceNumberPending {
		return nil
	}
	kind := jsonx.Str(inv, "kind")
	var num string
	var err error
	switch invoiceMode(ctx, kind) {
	case "counter":
		num, err = allocateCounter(ctx)
	default:
		num = yearInvoiceNumber(ctx, kind)
	}
	if err != nil {
		return err
	}
	inv["number"] = num
	doc["invoice"] = inv
	return nil
}

// the highest number used so far under a prefix (a counter may never be set below it: two invoices would get one number)
func usedMax(ctx context.Context, prefix string) int64 {
	var max int64
	rows, err := store.Pool.Query(ctx, `SELECT data->'invoice'->>'number' FROM crm_deals WHERE data->'invoice'->>'number' LIKE $1`+notReleased, prefix+"%")
	if err != nil {
		return 0
	}
	defer rows.Close()
	for rows.Next() {
		var s string
		if rows.Scan(&s) != nil {
			continue
		}
		rest := strings.TrimPrefix(s, prefix)
		if v, e := strconv.ParseInt(rest, 10, 64); e == nil && v > max {
			max = v
		}
	}
	return max
}

// the highest invoice number Sepidar has (from the copy the accounting program sent)
func sepidarLastInvoice(ctx context.Context) int64 {
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM sepidar_cache WHERE key = 'invoices'`).Scan(&raw) != nil {
		return 0
	}
	var list []map[string]any
	_ = json.Unmarshal(raw, &list)
	var max int64
	for _, m := range list {
		if n := int64(jsonx.Num(m["Number"])); n > max {
			max = n
		}
	}
	return max
}

func counterInfo(ctx context.Context, row jsonx.M, kind string) jsonx.M {
	c := jsonx.Sub(row, kind)
	prefix := jsonx.Str(c, "prefix")
	out := jsonx.M{"prefix": prefix, "set": false}
	if _, ok := c["last"]; ok {
		last := int64(jsonx.Num(c["last"]))
		out["set"], out["last"], out["next"] = true, last, prefix+strconv.FormatInt(last+1, 10)
		if f := sortedFreed(freedList(row), func(string) bool { return true }); len(f) > 0 {
			out["next"], out["freed"] = f[0], f
		}
	}
	out["usedMax"] = usedMax(ctx, prefix)
	return out
}

// GET /api/invoice-numbering/info (everybody who works with invoices): how the next invoice of each kind will be numbered.
func invoiceNumberingInfo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	row := invNumRow(ctx)
	out := jsonx.M{}
	for _, k := range []string{"OFFICIAL", "UNOFFICIAL"} {
		mode := invoiceMode(ctx, k)
		next := ""
		switch mode {
		case "counter":
			if c := counterInfo(ctx, row, "ALL"); c["next"] != nil {
				next, _ = c["next"].(string)
			}
		case "year":
			next = yearInvoiceNumber(ctx, k)
		}
		out[k] = jsonx.M{"mode": mode, "next": next}
	}
	httpx.JSON(w, http.StatusOK, out)
}

// GET /api/invoice-numbering (administrators)
func invoiceNumberingGet(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	ctx := r.Context()
	row := invNumRow(ctx)
	mode := jsonx.Str(row, "mode")
	if mode == "" {
		mode = "default"
	}
	httpx.JSON(w, http.StatusOK, jsonx.M{
		"mode": mode, "sepidarKinds": jsonx.Str(row, "sepidarKinds"), "connected": sepidarEnabled(ctx), "sepidarLast": sepidarLastInvoice(ctx),
		"ALL": counterInfo(ctx, row, "ALL"),
	})
}

var prefixOK = regexp.MustCompile(`^[A-Za-z0-9\-_.]{0,12}$`)

// PUT /api/invoice-numbering {mode, sepidarKinds, OFFICIAL:{last,prefix}, UNOFFICIAL:{last,prefix}} (administrators)
func invoiceNumberingPut(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	mode := jsonx.Str(body, "mode")
	if mode != "counter" && mode != "sepidar" && mode != "year" {
		httpx.Error(w, http.StatusBadRequest, "روش شماره‌گذاری درست نیست.")
		return
	}
	row := jsonx.M{"mode": mode}
	if jsonx.Str(body, "sepidarKinds") == "official" {
		row["sepidarKinds"] = "official"
	}
	for _, k := range []string{"ALL"} {
		c := jsonx.Sub(body, k)
		if _, has := c["last"]; !has || c["last"] == nil || fmt.Sprint(c["last"]) == "" {
			continue
		}
		last := int64(jsonx.Num(c["last"]))
		prefix := strings.TrimSpace(jsonx.Str(c, "prefix"))
		if last < 0 || last > 999999999 {
			httpx.Error(w, http.StatusBadRequest, "شمارهٔ آخر درست نیست.")
			return
		}
		if !prefixOK.MatchString(prefix) {
			httpx.Error(w, http.StatusBadRequest, "پیشوند فقط حرف انگلیسی، عدد و خط تیره باشد (تا ۱۲ نویسه).")
			return
		}
		if m := usedMax(ctx, prefix); mode == "counter" && last < m {
			httpx.Error(w, http.StatusConflict, fmt.Sprintf("فاکتوری با شمارهٔ %s%d قبلاً صادر شده است؛ شمارهٔ آخر نباید از آن کمتر باشد.", prefix, m))
			return
		}
		row[k] = jsonx.M{"last": last, "prefix": prefix}
	}
	if mode == "counter" && row["ALL"] == nil {
		httpx.Error(w, http.StatusBadRequest, "برای این روش آخرین شمارهٔ فاکتور در سپیدار را بنویسید (اگر هنوز فاکتوری نیست، صفر).")
		return
	}
	if _, err := store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('invoiceNumbering', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(row)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// POST /api/invoice/issue {dealId, kind, note}: turns the deal's approved proforma into its invoice (the server gives the number).
func invoiceIssue(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	id := strings.TrimSpace(jsonx.Str(body, "dealId"))
	var raw []byte
	if store.Pool.QueryRow(r.Context(), `SELECT data FROM crm_deals WHERE id = $1`, id).Scan(&raw) != nil {
		httpx.Error(w, http.StatusNotFound, "فرصت فروش پیدا نشد.")
		return
	}
	doc := jsonx.Decode(raw)
	kind := "UNOFFICIAL"
	if jsonx.Str(body, "kind") == "OFFICIAL" {
		kind = "OFFICIAL"
	}
	doc["invoice"] = jsonx.M{"kind": kind, "note": strings.TrimSpace(jsonx.Str(body, "note")), "paid": jsonx.Bool(body, "paid")}
	putDeal(w, r, me, id, doc)
}

// checkInvoiceNumberMatch: an invoice numbered by the counter has gone to Sepidar and Sepidar gave it a number; they should be the same. When they are not
// (somebody issued an invoice in Sepidar by hand in between), the difference is announced and the counter is put right so the next ones follow Sepidar.
func checkInvoiceNumberMatch(ctx context.Context, dealID string, sepidarNum int64, by string) {
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM crm_deals WHERE id = $1`, dealID).Scan(&raw) != nil {
		return
	}
	inv := jsonx.Sub(jsonx.Decode(raw), "invoice")
	if jsonx.Str(inv, "status") != "issued" || jsonx.Str(jsonx.Sub(inv, "sepidar"), "mismatch") != "" {
		return
	}
	kind := jsonx.Str(inv, "kind")
	if invoiceMode(ctx, kind) != "counter" {
		return
	}
	m := invNumTail.FindString(jsonx.Str(inv, "number"))
	mine, _ := strconv.ParseInt(m, 10, 64)
	if mine == sepidarNum {
		return
	}
	_, _ = store.Pool.Exec(ctx, `UPDATE crm_deals SET data = jsonb_set(data, '{invoice,sepidar,mismatch}', to_jsonb($2::bigint)) WHERE id = $1 AND data->'invoice' IS NOT NULL`, dealID, sepidarNum)
	_, _ = store.Pool.Exec(ctx, `UPDATE settings SET data = jsonb_set(data, '{ALL,last}', to_jsonb(GREATEST(COALESCE((data->'ALL'->>'last')::bigint, 0), $1::bigint)))
		WHERE key = 'invoiceNumbering' AND data->'ALL' IS NOT NULL`, sepidarNum)
	ids := []string{by}
	rows, err := store.Pool.Query(ctx, `SELECT id FROM users WHERE data->>'role' = 'SUPER_ADMIN'`)
	if err == nil {
		for rows.Next() {
			var u string
			if rows.Scan(&u) == nil {
				ids = append(ids, u)
			}
		}
		rows.Close()
	}
	notify.Notify(ctx, ids, notify.Note{
		Kind: "alert", Label: "سپیدار", Title: "شمارهٔ فاکتور هورمند و سپیدار یکی نشد",
		Body: fmt.Sprintf("فاکتور %s در هورمند، ولی سپیدار شمارهٔ %d داد (احتمالاً در سپیدار فاکتور دیگری هم صادر شده بود). شمارنده با سپیدار هم‌تراز شد تا فاکتورهای بعدی یکی باشند؛ شمارهٔ همین فاکتور را روی برگه با سپیدار تطبیق دهید.", jsonx.Str(inv, "number"), sepidarNum),
		Ref: ref("deal", dealID), Repeat: true,
	}, "")
}
