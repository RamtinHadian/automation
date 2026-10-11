package api

import (
	"encoding/json"
	"context"
	"net/http"
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
var sepidarCaches = map[string]bool{"invoices": true, "banks": true, "bankAccounts": true, "priceNotes": true, "saleTypes": true, "currencies": true, "customerGroups": true, "balances": true, "quotations": true}

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
				if rows.Scan(&key, &data, &at) == nil {
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

func registerSepidar(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sepidar", auth.Require(sepidarState))
	mux.HandleFunc("POST /api/sepidar/jobs", auth.Require(sepidarJobCreate))
	mux.HandleFunc("POST /api/sepidar/jobs/{id}/cancel", auth.Require(sepidarJobCancel))
	mux.HandleFunc("GET /api/ext/v1/sepidar/jobs", extAuth("sepidar.connect", extSepidarJobs))
	mux.HandleFunc("POST /api/ext/v1/sepidar/jobs/{id}/result", extAuth("sepidar.connect", extSepidarResult))
	mux.HandleFunc("POST /api/ext/v1/sepidar/push", extAuth("sepidar.connect", extSepidarPush))
}
