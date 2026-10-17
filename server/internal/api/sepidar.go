package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"math/big"
	"encoding/json"
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// The Sepidar bridge. Sepidar's web service answers only on the accounting computer, so the server never calls it: a person asks here
// (a "job"), the small program on the accounting computer (tools/sepidar) picks the job up, does it in Sepidar and reports the result back.
// What the program reads from Sepidar (invoices, bank accounts, price lists, customers' balances…) is kept here as a copy ("cache").
// Who may ask for what is set per person in the console (user.sepidarPerms); administrators may do everything.

// sepidarPerms are the rights a person can be given (the keys are what the console sends).
var sepidarPerms = []struct{ Key, Title string }{
	{"view", "دیدن اطلاعات سپیدار (فاکتورها، قیمت‌ها، مانده مشتری، وضعیت اتصال)"},
	{"customer", "ثبت و بروزرسانی مشتری در سپیدار"},
	{"quotation", "ارسال، بستن و حذف پیش‌فاکتور در سپیدار"},
	{"invoice", "صدور فاکتور فروش از روی پیش‌فاکتور"},
	{"receipt", "ثبت دریافتی (رسید) برای فاکتور"},
}

// the jobs and the right each one needs
var sepidarJobs = map[string]struct{ Perm, Title string }{
	"customer.send":       {"customer", "ثبت یا بروزرسانی مشتری"},
	"quotation.send":      {"quotation", "ارسال پیش‌فاکتور"},
	"quotation.close":     {"quotation", "بستن پیش‌فاکتور"},
	"quotation.unclose":   {"quotation", "بازکردن پیش‌فاکتور"},
	"quotation.delete":    {"quotation", "حذف پیش‌فاکتور"},
	"invoice.fromProforma": {"invoice", "صدور فاکتور"},
	"receipt.add":         {"receipt", "ثبت دریافتی"},
	"refresh":             {"view", "بروزرسانی اطلاعات سپیدار"},
}

// what the program may store as a copy of Sepidar's data
var sepidarCaches = map[string]bool{"sepidarCustomers": true, "invoices": true, "banks": true, "bankAccounts": true, "priceNotes": true, "saleTypes": true, "currencies": true, "customerGroups": true, "balances": true, "quotations": true}

func sepidarCan(me auth.User, perm string) bool {
	if me.IsAdmin() {
		return true
	}
	return jsonx.Contains(jsonx.Strings(me.M, "sepidarPerms"), perm)
}

func sepidarAny(me auth.User) bool { return me.IsAdmin() || len(jsonx.Strings(me.M, "sepidarPerms")) > 0 }

func sepidarConnectorSeen(ctx context.Context) (seen, version string) {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'sepidarConnector'`).Scan(&raw)
	d := jsonx.Decode(raw)
	return jsonx.Str(d, "lastSeenAt"), jsonx.Str(d, "name")
}

// GET /api/sepidar: everything the Sepidar page shows (according to the person's rights)
func sepidarState(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !sepidarAny(me) {
		httpx.Forbidden(w)
		return
	}
	ctx := r.Context()
	// a job that nobody answered for ten minutes is over
	_, _ = store.Pool.Exec(ctx, `UPDATE sepidar_jobs SET status = 'failed', finished_at = now(), result = jsonb_build_object('message', 'برنامهٔ سپیدار جواب نداد (روشن بودن برنامهٔ واسط را بررسی کنید).')
		WHERE (status = 'running' AND started_at < now() - interval '10 minutes') OR (status = 'pending' AND created_at < now() - interval '30 minutes')`)
	perms := []string{}
	for _, p := range sepidarPerms {
		if sepidarCan(me, p.Key) {
			perms = append(perms, p.Key)
		}
	}
	seen, name := sepidarConnectorSeen(ctx)
	out := map[string]any{"perms": perms, "permList": sepidarPerms, "connectorSeenAt": seen, "connectorName": name, "jobKinds": sepidarJobs}
	jobs := []jsonx.M{}
	rows, err := store.Pool.Query(ctx, `SELECT id, kind, data, status, created_by_name, created_at, finished_at, result FROM sepidar_jobs ORDER BY created_at DESC LIMIT 60`)
	if err == nil {
		for rows.Next() {
			var id, kind, status, by string
			var data, res []byte
			var created time.Time
			var fin *time.Time
			if rows.Scan(&id, &kind, &data, &status, &by, &created, &fin, &res) == nil {
				j := jsonx.M{"id": id, "kind": kind, "data": jsonx.Decode(data), "status": status, "by": by, "createdAt": created.Format(time.RFC3339), "result": jsonx.Decode(res)}
				if fin != nil {
					j["finishedAt"] = fin.Format(time.RFC3339)
				}
				jobs = append(jobs, j)
			}
		}
		rows.Close()
	}
	out["jobs"] = jobs
	links := []jsonx.M{}
	rows, err = store.Pool.Query(ctx, `SELECT kind, ref, sepidar_id, number, data, updated_at FROM sepidar_links ORDER BY updated_at DESC LIMIT 2000`)
	if err == nil {
		for rows.Next() {
			var kind, ref string
			var sid int64
			var number *int64
			var data []byte
			var at time.Time
			if rows.Scan(&kind, &ref, &sid, &number, &data, &at) == nil {
				l := jsonx.M{"kind": kind, "ref": ref, "sepidarId": sid, "data": jsonx.Decode(data), "at": at.Format(time.RFC3339)}
				if number != nil {
					l["number"] = *number
				}
				links = append(links, l)
			}
		}
		rows.Close()
	}
	out["links"] = links
	if sepidarCan(me, "view") {
		cache := map[string]any{}
		rows, err = store.Pool.Query(ctx, `SELECT key, data, updated_at FROM sepidar_cache`)
		if err == nil {
			for rows.Next() {
				var key string
				var data []byte
				var at time.Time
				if rows.Scan(&key, &data, &at) == nil && key != "sepidarCustomers" { // the full list is only for the duplicate check
					var v any
					_ = json.Unmarshal(data, &v)
					cache[key] = jsonx.M{"items": v, "at": at.Format(time.RFC3339)}
				}
			}
			rows.Close()
		}
		out["cache"] = cache
	}
	httpx.JSON(w, http.StatusOK, out)
}

// POST /api/sepidar/jobs {kind, dealId | customerId, bankAccountId, amount, date, description}
func sepidarJobCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	kind := jsonx.Str(body, "kind")
	def, known := sepidarJobs[kind]
	if !known {
		httpx.Error(w, http.StatusBadRequest, "نوع درخواست نامعتبر است.")
		return
	}
	if !sepidarCan(me, def.Perm) {
		httpx.Error(w, http.StatusForbidden, "اجازهٔ «"+def.Title+"» برای شما در کنسول مدیریت باز نشده است.")
		return
	}
	ctx := r.Context()
	bad := func(msg string) { httpx.Error(w, http.StatusBadRequest, msg) }
	data := jsonx.M{}
	ref := ""
	hasLink := func(kind, ref string) bool {
		var n int
		_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sepidar_links WHERE kind = $1 AND ref = $2`, kind, ref).Scan(&n)
		return n > 0
	}
	switch kind {
	case "customer.send":
		ref = strings.TrimSpace(jsonx.Str(body, "customerId"))
		var n int
		_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM crm_customers WHERE id = $1`, ref).Scan(&n)
		if n == 0 {
			bad("مشتری پیدا نشد.")
			return
		}
		data["customerId"] = ref
	case "quotation.send", "quotation.close", "quotation.unclose", "quotation.delete", "invoice.fromProforma", "receipt.add":
		ref = strings.TrimSpace(jsonx.Str(body, "dealId"))
		var raw []byte
		if store.Pool.QueryRow(ctx, `SELECT data FROM crm_deals WHERE id = $1`, ref).Scan(&raw) != nil {
			bad("فرصت فروش پیدا نشد.")
			return
		}
		d := jsonx.Decode(raw)
		data["dealId"], data["title"] = ref, jsonx.Str(d, "customerName")
		switch kind {
		case "quotation.send":
			if jsonx.Str(d, "proformaNumber") == "" || len(jsonx.Arr(d, "items")) == 0 {
				bad("این فرصت پیش‌فاکتور شماره‌دار با ردیف کالا ندارد.")
				return
			}
			if hasLink("quotation", ref) {
				bad("پیش‌فاکتور این فرصت قبلاً در سپیدار ثبت شده است.")
				return
			}
		case "quotation.close", "quotation.unclose", "quotation.delete":
			if !hasLink("quotation", ref) {
				bad("پیش‌فاکتور این فرصت هنوز در سپیدار ثبت نشده است.")
				return
			}
			if kind == "quotation.delete" && hasLink("invoice", ref) {
				bad("از این پیش‌فاکتور فاکتور صادر شده و حذفش ممکن نیست.")
				return
			}
		case "invoice.fromProforma":
			if !hasLink("quotation", ref) {
				bad("اول پیش‌فاکتور باید در سپیدار ثبت شود.")
				return
			}
			if hasLink("invoice", ref) {
				bad("فاکتور این پیش‌فاکتور قبلاً صادر شده است.")
				return
			}
		case "receipt.add":
			if !hasLink("invoice", ref) {
				bad("اول فاکتور باید صادر شود.")
				return
			}
			amount, okA := whNum(body, "amount")
			if !okA || amount <= 0 {
				bad("مبلغ دریافتی را درست بنویسید.")
				return
			}
			acc := whCode(jsonx.Str(body, "bankAccountId"))
			if acc == "" {
				bad("حساب بانکی را انتخاب کنید.")
				return
			}
			date := jsonx.Str(body, "date")
			if !whDocDate.MatchString(date) {
				bad("تاریخ دریافت را بنویسید.")
				return
			}
			data["amount"], data["bankAccountId"], data["date"], data["description"] = amount, acc, date, whText(body, "description", 200)
			ref = ref + "#" + randomHex(3)
		}
	case "refresh":
		ref = "refresh"
	}
	// the program needs the number Sepidar gave the record it works on
	linkOf := func(kind, ref string) {
		var sid int64
		if store.Pool.QueryRow(ctx, `SELECT sepidar_id FROM sepidar_links WHERE kind = $1 AND ref = $2`, kind, ref).Scan(&sid) == nil {
			data["sepidarId"] = sid
		}
	}
	switch kind {
	case "quotation.close", "quotation.unclose", "quotation.delete", "invoice.fromProforma":
		linkOf("quotation", jsonx.Str(data, "dealId"))
	case "receipt.add":
		linkOf("invoice", jsonx.Str(data, "dealId"))
	}
	// the same request is not queued twice while the first is still waiting
	var dup int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sepidar_jobs WHERE kind = $1 AND ref = $2 AND status IN ('pending', 'running')`, kind, ref).Scan(&dup)
	if dup > 0 {
		httpx.Error(w, http.StatusConflict, "همین درخواست در صف است؛ چند لحظه صبر کنید.")
		return
	}
	id := "sj-" + randomHex(6)
	if _, err := store.Pool.Exec(ctx, `INSERT INTO sepidar_jobs (id, kind, ref, data, created_by, created_by_name) VALUES ($1, $2, $3, $4::jsonb, $5, $6)`, id, kind, ref, jsonx.Encode(data), me.ID(), me.Name()); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "INFO", "درخواست سپیدار: "+def.Title)
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id})
}

// POST /api/sepidar/jobs/{id}/cancel: only a waiting job, by who asked or an administrator
func sepidarJobCancel(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	tag, err := store.Pool.Exec(r.Context(), `UPDATE sepidar_jobs SET status = 'cancelled', finished_at = now() WHERE id = $1 AND status = 'pending' AND (created_by = $2 OR $3)`, r.PathValue("id"), me.ID(), me.IsAdmin())
	if err != nil {
		internalError(w)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusConflict, "این درخواست دیگر قابل لغو نیست.")
		return
	}
	httpx.OK(w)
}

// ---------- the program on the accounting computer ----------

func sepidarBeat(ctx context.Context, keyName string) {
	d := jsonx.M{"lastSeenAt": now(), "name": keyName}
	_, _ = store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('sepidarConnector', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(d))
}

// GET /api/ext/v1/sepidar/jobs: the waiting jobs (they become «running»); a call also tells Hoormand that the program is alive.
func extSepidarJobs(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	ctx := r.Context()
	sepidarBeat(ctx, k.Name)
	rows, err := store.Pool.Query(ctx, `UPDATE sepidar_jobs SET status = 'running', started_at = now() WHERE id IN (SELECT id FROM sepidar_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED) RETURNING id, kind, data`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var id, kind string
		var data []byte
		if rows.Scan(&id, &kind, &data) == nil {
			out = append(out, jsonx.M{"id": id, "kind": kind, "data": jsonx.Decode(data)})
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"jobs": out})
}

// POST /api/ext/v1/sepidar/jobs/{id}/result {ok, message, sepidarId, number, data}
func extSepidarResult(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	id := r.PathValue("id")
	var kind, ref, by string
	var data []byte
	if store.Pool.QueryRow(ctx, `SELECT kind, ref, data, created_by FROM sepidar_jobs WHERE id = $1 AND status = 'running'`, id).Scan(&kind, &ref, &data, &by) != nil {
		httpx.Error(w, http.StatusNotFound, "این درخواست در حال انجام نیست.")
		return
	}
	success := jsonx.Bool(body, "ok")
	msg := whText(body, "message", 400)
	status := "done"
	if !success {
		status = "failed"
	}
	res := jsonx.M{"message": msg}
	if n, ok := whNum(body, "number"); ok {
		res["number"] = n
	}
	if _, err := store.Pool.Exec(ctx, `UPDATE sepidar_jobs SET status = $2, finished_at = now(), result = $3::jsonb WHERE id = $1`, id, status, jsonx.Encode(res)); err != nil {
		internalError(w)
		return
	}
	d := jsonx.Decode(data)
	if success {
		sid, hasID := whNum(body, "sepidarId")
		number, hasNum := whNum(body, "number")
		save := func(lk, lref string) {
			var num any
			if hasNum {
				num = int64(number)
			}
			_, _ = store.Pool.Exec(ctx, `INSERT INTO sepidar_links (kind, ref, sepidar_id, number, data) VALUES ($1, $2, $3, $4, $5::jsonb)
				ON CONFLICT (kind, ref) DO UPDATE SET sepidar_id = $3, number = $4, data = $5::jsonb, updated_at = now()`, lk, lref, int64(sid), num, jsonx.Encode(jsonx.Sub(body, "data")))
		}
		switch kind {
		case "customer.send":
			if hasID {
				save("customer", jsonx.Str(d, "customerId"))
			}
		case "quotation.send":
			if hasID {
				save("quotation", jsonx.Str(d, "dealId"))
			}
		case "quotation.delete":
			_, _ = store.Pool.Exec(ctx, `DELETE FROM sepidar_links WHERE kind = 'quotation' AND ref = $1`, jsonx.Str(d, "dealId"))
		case "invoice.fromProforma":
			if hasID {
				save("invoice", jsonx.Str(d, "dealId"))
			}
		case "receipt.add":
			if hasID {
				rd := jsonx.Sub(body, "data")
				if rd == nil {
					rd = jsonx.M{}
				}
				rd["amount"], rd["date"], rd["dealId"] = d["amount"], d["date"], d["dealId"]
				body["data"] = rd
				save("receipt", jsonx.Str(d, "dealId")+"#"+id)
			}
		}
	} else if by != "" {
		title := sepidarJobs[kind].Title
		notify.Notify(ctx, []string{by}, notify.Note{Kind: "alert", Label: "سپیدار", Title: title + " انجام نشد", Body: msg, Ref: ref0("sepidar", id)}, "")
	}
	httpx.OK(w)
}

func ref0(kind, id string) jsonx.M { return jsonx.M{"type": kind, "id": id} }

// ---------- the program on the accounting computer updates itself from here ----------
// The server holds a copy of the program's files (the Docker image carries them, so they are updated from Git together with the app);
// the program compares its own files with this list and downloads what differs. Only these names can ever be served.
var sepidarToolFiles = []string{"sepidar-sync.mjs", "sepidar-client.mjs", "console-fa.mjs", "config-help.mjs", "ui.mjs", "updater.mjs", "Vazirmatn-Regular.woff2", "Vazirmatn-Bold.woff2"}

func sepidarToolDir() string {
	if d := os.Getenv("SEPIDAR_TOOL_DIR"); d != "" {
		return d
	}
	return "/app/sepidar-tool"
}

// GET /api/ext/v1/sepidar/tool: {version, files:[{name, sha256, size}]}; version is a short hash of all the files
func extSepidarTool(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	sepidarBeat(r.Context(), k.Name)
	files := []jsonx.M{}
	all := sha256.New()
	for _, name := range sepidarToolFiles {
		b, err := os.ReadFile(filepath.Join(sepidarToolDir(), name))
		if err != nil {
			continue // a file this server does not carry is not offered
		}
		sum := sha256.Sum256(b)
		h := hex.EncodeToString(sum[:])
		all.Write([]byte(name + h))
		files = append(files, jsonx.M{"name": name, "sha256": h, "size": len(b)})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"version": hex.EncodeToString(all.Sum(nil))[:12], "files": files})
}

// GET /api/ext/v1/sepidar/tool/{name}: one file of the program
func extSepidarToolFile(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	name := r.PathValue("name")
	if !jsonx.Contains(sepidarToolFiles, name) {
		httpx.Error(w, http.StatusNotFound, "فایل پیدا نشد.")
		return
	}
	b, err := os.ReadFile(filepath.Join(sepidarToolDir(), name))
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "فایل پیدا نشد.")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(b)
}

// ---------- customers that already exist in Sepidar ----------

func loadSepidarCustomers(ctx context.Context) []map[string]any {
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM sepidar_cache WHERE key = 'sepidarCustomers'`).Scan(&raw) != nil {
		return nil
	}
	var list []map[string]any
	_ = json.Unmarshal(raw, &list)
	return list
}

func sepidarIDOf(c map[string]any) int64 {
	n, _ := whNum(c, "id")
	return int64(n)
}

// sepidarCustomerMatches finds the customers Sepidar already has for the numbers / national codes being typed in the customer form.
// phoneKeys are the last nine digits of each number. linked tells which Sepidar customer this customer (except) is already tied to.
func sepidarCustomerMatches(r *http.Request, phoneKeys []string, nat, nid, except string) ([]jsonx.M, jsonx.M) {
	ctx := r.Context()
	list := loadSepidarCustomers(ctx)
	out := []jsonx.M{}
	var linked jsonx.M
	if len(list) == 0 {
		return out, linked
	}
	var sid int64
	hasLink := except != "" && store.Pool.QueryRow(ctx, `SELECT sepidar_id FROM sepidar_links WHERE kind = 'customer' AND ref = $1`, except).Scan(&sid) == nil
	for _, c := range list {
		id := sepidarIDOf(c)
		name := jsonx.Str(c, "name")
		if hasLink && id == sid {
			linked = jsonx.M{"sepidarId": id, "name": name}
		}
		hit := false
		for _, p := range jsonx.Strings(c, "phones") {
			d := digitsOnly(p)
			if len(d) < 9 {
				continue
			}
			for _, k := range phoneKeys {
				if len(k) >= 9 && strings.HasSuffix(d, k) {
					hit = true
				}
			}
		}
		sn := digitsOnly(jsonx.Str(c, "nationalId"))
		if sn != "" && (sn == nat || sn == nid) {
			hit = true
		}
		if !hit || len(out) >= 5 {
			continue
		}
		m := jsonx.M{"sepidarId": id, "name": name, "code": jsonx.Str(c, "code")}
		var ref string
		if store.Pool.QueryRow(ctx, `SELECT ref FROM sepidar_links WHERE kind = 'customer' AND sepidar_id = $1 LIMIT 1`, id).Scan(&ref) == nil && ref != except {
			m["linkedCustomerId"] = ref
		}
		out = append(out, m)
	}
	return out, linked
}

// POST /api/crm/sepidar-link {customerId, sepidarId}: this customer is the one Sepidar already has under that name (sepidarId 0 removes the tie).
func crmSepidarLink(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if crmDenied(w, me) {
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	cid := jsonx.Str(body, "customerId")
	if cid == "" {
		httpx.Error(w, http.StatusBadRequest, "مشتری مشخص نیست.")
		return
	}
	if !me.IsAdmin() && !sepidarCan(me, "customer") && !crmOwnsCustomer(r, me, cid) {
		httpx.Forbidden(w)
		return
	}
	sid, _ := whNum(body, "sepidarId")
	if sid == 0 {
		_, _ = store.Pool.Exec(ctx, `DELETE FROM sepidar_links WHERE kind = 'customer' AND ref = $1`, cid)
		httpx.OK(w)
		return
	}
	title := ""
	for _, c := range loadSepidarCustomers(ctx) {
		if sepidarIDOf(c) == int64(sid) {
			title = jsonx.Str(c, "name")
		}
	}
	if title == "" {
		httpx.Error(w, http.StatusBadRequest, "این مشتری در فهرست سپیدار پیدا نشد؛ اطلاعات سپیدار را بروز کنید.")
		return
	}
	var other string
	if store.Pool.QueryRow(ctx, `SELECT ref FROM sepidar_links WHERE kind = 'customer' AND sepidar_id = $1 AND ref <> $2 LIMIT 1`, int64(sid), cid).Scan(&other) == nil {
		httpx.Error(w, http.StatusConflict, "این مشتری سپیدار قبلاً به مشتری دیگری در هورمند وصل شده است.")
		return
	}
	if _, err := store.Pool.Exec(ctx, `INSERT INTO sepidar_links (kind, ref, sepidar_id, data) VALUES ('customer', $1, $2, $3::jsonb)
		ON CONFLICT (kind, ref) DO UPDATE SET sepidar_id = $2, data = $3::jsonb, updated_at = now()`, cid, int64(sid), jsonx.Encode(jsonx.M{"title": title})); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "name": title})
}

// GET /api/ext/v1/sepidar/links: the customers tied by hand to a customer that Sepidar already had (the program uses them instead of creating a new one)
func extSepidarLinks(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	rows, err := store.Pool.Query(r.Context(), `SELECT ref, sepidar_id FROM sepidar_links WHERE kind = 'customer'`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var ref string
		var sid int64
		if rows.Scan(&ref, &sid) == nil {
			out = append(out, jsonx.M{"ref": ref, "sepidarId": sid})
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"links": out})
}

// POST /api/ext/v1/sepidar/push {cache: "invoices", items: [...]} or {links: [{kind, ref, sepidarId, number, data}]}
func extSepidarPush(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	sepidarBeat(ctx, k.Name)
	if name := jsonx.Str(body, "cache"); name != "" {
		if !sepidarCaches[name] {
			httpx.Error(w, http.StatusBadRequest, "نوع اطلاعات نامعتبر است.")
			return
		}
		items := jsonx.Arr(body, "items")
		if len(items) > 20000 {
			httpx.Error(w, http.StatusBadRequest, "حجم اطلاعات از حد مجاز بیشتر است.")
			return
		}
		if _, err := store.Pool.Exec(ctx, `INSERT INTO sepidar_cache (key, data) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET data = $2::jsonb, updated_at = now()`, name, jsonx.Encode(items)); err != nil {
			internalError(w)
			return
		}
	}
	for _, x := range jsonx.Arr(body, "links") {
		m, _ := x.(map[string]any)
		kind, ref := jsonx.Str(m, "kind"), whText(m, "ref", 80)
		sid, okS := whNum(m, "sepidarId")
		if !jsonx.Contains([]string{"customer", "quotation", "invoice"}, kind) || ref == "" || !okS {
			continue
		}
		var num any
		if n, okN := whNum(m, "number"); okN {
			num = int64(n)
		}
		_, _ = store.Pool.Exec(ctx, `INSERT INTO sepidar_links (kind, ref, sepidar_id, number, data) VALUES ($1, $2, $3, $4, '{}'::jsonb)
			ON CONFLICT (kind, ref) DO UPDATE SET sepidar_id = $3, number = COALESCE($4, sepidar_links.number), updated_at = now()`, kind, ref, int64(sid), num)
	}
	httpx.OK(w)
}

// ---------- pairing: the program on the accounting computer gets its key by a short one-time code, so nobody copies a long key by hand ----------

const pairAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // no look-alike letters or digits

func pairCode() string {
	out := make([]byte, 8)
	for i := range out {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(pairAlphabet))))
		out[i] = pairAlphabet[n.Int64()]
	}
	return string(out[:4]) + "-" + string(out[4:])
}

func pairNormalize(c string) string {
	return strings.ToUpper(strings.NewReplacer("-", "", " ", "").Replace(strings.TrimSpace(c)))
}

// POST /api/sepidar/pair (administrators): makes a code that is valid for fifteen minutes and can be used once.
func sepidarPairCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if DemoMode {
		httpx.Error(w, http.StatusForbidden, "در نسخهٔ آزمایشی اتصال ساخته نمی‌شود.")
		return
	}
	code := pairCode()
	exp := time.Now().Add(15 * time.Minute)
	d := jsonx.M{"hash": hashKey(pairNormalize(code)), "expiresAt": exp.Format(time.RFC3339), "by": me.ID(), "fails": 0}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO settings (key, data) VALUES ('sepidarPairing', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(d)); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "WARNING", "ساخت کد اتصال برنامهٔ سپیدار")
	httpx.JSON(w, http.StatusOK, map[string]any{"code": code, "expiresAt": exp.Format(time.RFC3339)})
}

// POST /api/ext/v1/pair {code, name}: the program trades the code for its key (once). Eight wrong tries burn the code.
func extPair(w http.ResponseWriter, r *http.Request) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'sepidarPairing'`).Scan(&raw)
	d := jsonx.Decode(raw)
	exp, _ := time.Parse(time.RFC3339, jsonx.Str(d, "expiresAt"))
	wrong := func() {
		fails := jsonx.Int(d, "fails") + 1
		if fails >= 8 {
			_, _ = store.Pool.Exec(ctx, `DELETE FROM settings WHERE key = 'sepidarPairing'`)
		} else if jsonx.Str(d, "hash") != "" {
			d["fails"] = fails
			_, _ = store.Pool.Exec(ctx, `UPDATE settings SET data = $1::jsonb WHERE key = 'sepidarPairing'`, jsonx.Encode(d))
		}
		httpx.Error(w, http.StatusForbidden, "کد اتصال درست نیست یا منقضی شده است؛ در هورمند کد تازه بسازید.")
	}
	if jsonx.Str(d, "hash") == "" || time.Now().After(exp) || hashKey(pairNormalize(jsonx.Str(body, "code"))) != jsonx.Str(d, "hash") {
		wrong()
		return
	}
	actAs := jsonx.Str(d, "by")
	var active string
	if store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'isActive', 'true') FROM users WHERE id = $1`, actAs).Scan(&active) != nil || active == "false" {
		httpx.Error(w, http.StatusConflict, "مدیری که کد را ساخته دیگر فعال نیست.")
		return
	}
	// the code is spent before the key is made, so two programs cannot both get one
	tag, err := store.Pool.Exec(ctx, `DELETE FROM settings WHERE key = 'sepidarPairing' AND data->>'hash' = $1`, jsonx.Str(d, "hash"))
	if err != nil || tag.RowsAffected() == 0 {
		wrong()
		return
	}
	scopes := []string{"customers.read", "deals.read", "warehouse.write", "sepidar.connect"}
	key := "hk_" + randomHex(24)
	id := "ak-" + randomHex(6)
	exp2 := time.Now().Add(3650 * 24 * time.Hour)
	if _, err := store.Pool.Exec(ctx, `INSERT INTO api_keys (id, name, key_hash, prefix, scopes, act_as, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		id, "سپیدار", hashKey(key), key[:8], scopes, actAs, actAs, exp2); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"key": key})
}

func registerSepidar(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/sepidar/pair", auth.Require(sepidarPairCreate))
	mux.HandleFunc("POST /api/ext/v1/pair", extPair)
	mux.HandleFunc("GET /api/sepidar", auth.Require(sepidarState))
	mux.HandleFunc("POST /api/sepidar/jobs", auth.Require(sepidarJobCreate))
	mux.HandleFunc("POST /api/sepidar/jobs/{id}/cancel", auth.Require(sepidarJobCancel))
	mux.HandleFunc("GET /api/ext/v1/sepidar/jobs", extAuth("sepidar.connect", extSepidarJobs))
	mux.HandleFunc("POST /api/ext/v1/sepidar/jobs/{id}/result", extAuth("sepidar.connect", extSepidarResult))
	mux.HandleFunc("POST /api/ext/v1/sepidar/push", extAuth("sepidar.connect", extSepidarPush))
	mux.HandleFunc("GET /api/ext/v1/sepidar/links", extAuth("sepidar.connect", extSepidarLinks))
	mux.HandleFunc("GET /api/ext/v1/sepidar/tool", extAuth("sepidar.connect", extSepidarTool))
	mux.HandleFunc("GET /api/ext/v1/sepidar/tool/{name}", extAuth("sepidar.connect", extSepidarToolFile))
	mux.HandleFunc("POST /api/crm/sepidar-link", auth.Require(crmSepidarLink))
}
