package api

import (
	"sort"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// The warehouse module: products, warehouses and documents (receipt, issue, transfer, stock-taking adjustment).
// The stock of a product in a warehouse is the sum of its movements; a document writes its movements once and a voided document
// switches them off (nothing is ever edited or deleted behind a document). One lock keeps two people from taking the same stock.

const whLock = 7001

var (
	whID      = regexp.MustCompile(`^[a-z0-9-]{3,40}$`)
	whKinds   = map[string]string{"receipt": "رسید ورود", "issue": "حواله خروج", "transfer": "انتقال بین انبارها", "adjust": "تعدیل انبارگردانی"}
	whDocDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func canUseWarehouse(me auth.User) bool { return me.IsAdmin() || jsonx.Bool(me.M, "canUseWarehouse") }

// The finer rights of the warehouse menu are the sub-menus the administrator switched off for a person (user.hiddenSub, the table of permissions):
// «warehouse.qty» the numbers of stock, «warehouse.money» prices and costs, «warehouse.docs» the documents and «warehouse.doc.<kind>» one sort of document.
// Administrators have all of them. These are checked here, not only in the page, so a hidden thing is never sent.
func subOff(me auth.User, id string) bool {
	return !me.IsAdmin() && jsonx.Contains(jsonx.Strings(me.M, "hiddenSub"), id)
}

func whQtyAllowed(me auth.User) bool   { return !subOff(me, "warehouse.qty") }
func whMoneyAllowed(me auth.User) bool { return !subOff(me, "warehouse.money") }
func whKindAllowed(me auth.User, kind string) bool {
	return !subOff(me, "warehouse.docs") && !subOff(me, "warehouse.doc."+kind) && whQtyAllowed(me)
}

// the sorts of document this person may see
func whAllowedKinds(me auth.User) []string {
	out := []string{}
	for _, k := range []string{"receipt", "issue", "transfer", "adjust"} {
		if whKindAllowed(me, k) {
			out = append(out, k)
		}
	}
	return out
}

func whDenied(w http.ResponseWriter, me auth.User) bool {
	if !canUseWarehouse(me) {
		httpx.Error(w, http.StatusForbidden, "اجازهٔ انبارداری برای شما فعال نشده است؛ از مدیر بخواهید در کنسول مدیریت به شما اجازه بدهد.")
		return true
	}
	return false
}

// number reads a numeric field (json.Number, number or text) rounded to three decimals.
func whNum(m jsonx.M, key string) (float64, bool) {
	var f float64
	switch v := m[key].(type) {
	case json.Number:
		x, err := v.Float64()
		if err != nil {
			return 0, false
		}
		f = x
	case float64:
		f = v
	case string:
		x, err := strconv.ParseFloat(strings.TrimSpace(faDigits.Replace(v)), 64)
		if err != nil {
			return 0, false
		}
		f = x
	default:
		return 0, false
	}
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 0, false
	}
	return math.Round(f*1000) / 1000, true
}

func whText(m jsonx.M, key string, max int) string {
	s := strings.TrimSpace(jsonx.Str(m, key))
	if r := []rune(s); len(r) > max {
		s = string(r[:max])
	}
	return s
}

// ---------- the picture the page shows ----------

type whBalance map[string]map[string]float64 // product -> warehouse -> quantity

func whBalances(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}) (whBalance, error) {
	rows, err := q.Query(ctx, `SELECT product_id, warehouse_id, SUM(qty)::float8 FROM wh_moves WHERE NOT voided GROUP BY product_id, warehouse_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := whBalance{}
	for rows.Next() {
		var p, wh string
		var n float64
		if rows.Scan(&p, &wh, &n) == nil {
			if out[p] == nil {
				out[p] = map[string]float64{}
			}
			out[p][wh] = math.Round(n*1000) / 1000
		}
	}
	return out, nil
}

func whListDocs(ctx context.Context, where string, args []any, limit, offset int) ([]jsonx.M, error) {
	args = append(args, limit, offset)
	rows, err := store.Pool.Query(ctx, `SELECT data, voided FROM wh_docs `+where+` ORDER BY created_at DESC LIMIT $`+strconv.Itoa(len(args)-1)+` OFFSET $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var raw []byte
		var voided bool
		if rows.Scan(&raw, &voided) == nil {
			d := jsonx.Decode(raw)
			d["voided"] = voided
			out = append(out, d)
		}
	}
	return out, nil
}

// whExtra: the plain values the accounting program keeps about a warehouse or a product (name → text), kept as they are for the page to show.
func whExtra(m jsonx.M) map[string]string {
	raw, _ := m["extra"].(map[string]any)
	out := map[string]string{}
	for k, v := range raw {
		if len(out) >= 40 || len(k) > 60 {
			continue
		}
		switch t := v.(type) {
		case string:
			out[k] = whCut(t, 200)
		case bool, float64, json.Number:
			out[k] = whCut(fmt.Sprint(t), 200)
		}
	}
	return out
}

func whCut(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}

// whNoGroup is how products without a group are named in the lists a person may see.
const whNoGroup = "بدون گروه"

// whGroupOK: a person sees the products of the groups the administrator picked for them (user.whGroups); none picked = every group.
func whGroupOK(me auth.User, group string) bool {
	if me.IsAdmin() {
		return true
	}
	list := jsonx.Strings(me.M, "whGroups")
	if len(list) == 0 {
		return true
	}
	if group == "" {
		group = whNoGroup
	}
	for _, g := range list { // a group also opens its sub-groups («پدر / فرزند»)
		if group == g || strings.HasPrefix(group, g+" / ") {
			return true
		}
	}
	return false
}

// whGroupDocs keeps, in each document, only the lines of the products the person may see (a document with none left is left out).
func whGroupDocs(ctx context.Context, me auth.User, docs []jsonx.M) []jsonx.M {
	if me.IsAdmin() || len(jsonx.Strings(me.M, "whGroups")) == 0 {
		return docs
	}
	ok := map[string]bool{}
	if rows, err := store.Pool.Query(ctx, `SELECT id, COALESCE(data->>'group', '') FROM wh_products`); err == nil {
		for rows.Next() {
			var id, g string
			if rows.Scan(&id, &g) == nil && whGroupOK(me, g) {
				ok[id] = true
			}
		}
		rows.Close()
	}
	out := []jsonx.M{}
	for _, d := range docs {
		lines, _ := d["lines"].([]any)
		if len(lines) == 0 {
			continue
		}
		keep := []any{}
		for _, l := range lines {
			if m, isMap := l.(map[string]any); isMap && ok[jsonx.Str(m, "productId")] {
				keep = append(keep, l)
			}
		}
		if len(keep) > 0 {
			d["lines"] = keep
			out = append(out, d)
		}
	}
	return out
}

// GET /api/warehouse: warehouses, products with their stock, and the latest documents.
func whState(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if whDenied(w, me) {
		return
	}
	ctx := r.Context()
	bal, err := whBalances(ctx, store.Pool)
	if err != nil {
		internalError(w)
		return
	}
	whs := []jsonx.M{}
	rows, err := store.Pool.Query(ctx, `SELECT id, data FROM wh_warehouses ORDER BY created_at`)
	if err != nil {
		internalError(w)
		return
	}
	for rows.Next() {
		var id string
		var raw []byte
		if rows.Scan(&id, &raw) == nil {
			d := jsonx.Decode(raw)
			d["id"] = id
			whs = append(whs, d)
		}
	}
	rows.Close()
	prods := []jsonx.M{}
	rows, err = store.Pool.Query(ctx, `SELECT id, data FROM wh_products ORDER BY (data->>'title')`)
	if err != nil {
		internalError(w)
		return
	}
	for rows.Next() {
		var id string
		var raw []byte
		if rows.Scan(&id, &raw) == nil {
			d := jsonx.Decode(raw)
			d["id"] = id
			if !whGroupOK(me, jsonx.Str(d, "group")) {
				continue
			}
			total := 0.0
			by := map[string]float64{}
			for wh, n := range bal[id] {
				by[wh] = n
				total += n
			}
				d["total"], d["byWarehouse"] = math.Round(total*1000)/1000, by
				if !whQtyAllowed(me) {
					d["total"], d["byWarehouse"] = 0, map[string]float64{}
				}
				delete(d, "cost") // purchase prices are not shown anywhere: only the selling prices
				if !whMoneyAllowed(me) {
					delete(d, "prices")
				}
				prods = append(prods, d)
		}
	}
	rows.Close()
	kinds := whAllowedKinds(me)
	recent := []jsonx.M{}
	if len(kinds) > 0 {
		var err error
		recent, err = whListDocs(ctx, "WHERE kind = ANY($1::text[])", []any{kinds}, 20, 0)
		if err != nil {
			internalError(w)
			return
		}
	}
	recent = whGroupDocs(ctx, me, recent)
	mode, last, source := whModeInfo(ctx)
	httpx.JSON(w, http.StatusOK, map[string]any{"warehouses": whs, "products": prods, "recent": recent, "kinds": whKinds, "mode": mode, "lastSyncAt": last, "source": source,
		"limits": map[string]any{"qty": whQtyAllowed(me), "money": whMoneyAllowed(me), "kinds": kinds}})
}

// GET /api/warehouse/docs?kind=&warehouse=&product=&from=&to=&limit=&offset=
func whDocs(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if whDenied(w, me) {
		return
	}
	kinds := whAllowedKinds(me)
	if len(kinds) == 0 {
		httpx.JSON(w, http.StatusOK, map[string]any{"docs": []jsonx.M{}, "limit": 0, "offset": 0})
		return
	}
	q := r.URL.Query()
	where, args := "WHERE kind = ANY($1::text[])", []any{kinds}
	add := func(cond string, v any) {
		args = append(args, v)
		where += " AND " + strings.ReplaceAll(cond, "?", "$"+strconv.Itoa(len(args)))
	}
	if q.Get("auto") != "1" { // the automatic stock synchronisations of the Sepidar program are not documents anybody wrote: shown only on request
		where += " AND COALESCE(data->>'auto', '') <> 'true'"
	}
	if k := q.Get("kind"); k != "" {
		add("kind = ?", k)
	}
	if v := q.Get("warehouse"); v != "" {
		add("(data->>'warehouseId' = ? OR data->>'toWarehouseId' = ?)", v)
	}
	if v := q.Get("product"); v != "" {
		add("id IN (SELECT doc_id FROM wh_moves WHERE product_id = ?)", v)
	}
	if v := q.Get("from"); whDocDate.MatchString(v) {
		add("data->>'date' >= ?", v)
	}
	if v := q.Get("to"); whDocDate.MatchString(v) {
		add("data->>'date' <= ?", v)
	}
	limit, offset := queryInt(r, "limit", 100, 500), queryInt(r, "offset", 0, 1000000)
	docs, err := whListDocs(r.Context(), where, args, limit, offset)
	if err != nil {
		internalError(w)
		return
	}
	docs = whGroupDocs(r.Context(), me, docs)
	if offset == 0 { // the invoices of Sepidar come first-page only (they are a copy, not a table of their own)
		docs = append(docs, whStockDocs(r.Context(), me, q.Get("kind"), q.Get("warehouse"), q.Get("product"), q.Get("from"), q.Get("to"))...)
		docs = append(docs, whSaleDocs(r.Context(), me, q.Get("kind"), q.Get("warehouse"), q.Get("product"), q.Get("from"), q.Get("to"))...)
		sort.SliceStable(docs, func(i, j int) bool { return jsonx.Str(docs[i], "date") > jsonx.Str(docs[j], "date") })
		if len(docs) > limit {
			docs = docs[:limit]
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"docs": docs, "limit": limit, "offset": offset})
}

// GET /api/warehouse/card?product=&warehouse=: the card of one product (every movement and the running balance).
func whCard(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if whDenied(w, me) {
		return
	}
	if !whQtyAllowed(me) {
		httpx.Error(w, http.StatusForbidden, "دیدن موجودی تعدادی برای شما در جدول مجوزها بسته شده است.")
		return
	}
	pid, wid := r.URL.Query().Get("product"), r.URL.Query().Get("warehouse")
	var praw []byte
	if store.Pool.QueryRow(r.Context(), `SELECT data FROM wh_products WHERE id = $1`, pid).Scan(&praw) != nil {
		httpx.Error(w, http.StatusNotFound, "کالا پیدا نشد.")
		return
	}
if g := jsonx.Str(jsonx.Decode(praw), "group"); !whGroupOK(me, g) {
		httpx.Error(w, http.StatusForbidden, "گروه این کالا برای شما باز نشده است.")
		return
	}
	sql, args := `SELECT m.doc_date::text, m.warehouse_id, m.qty::float8, d.kind, d.number, d.data FROM wh_moves m JOIN wh_docs d ON d.id = m.doc_id WHERE m.product_id = $1 AND NOT m.voided AND d.kind = ANY($2::text[])`, []any{pid, whAllowedKinds(me)}
	if wid != "" {
		args = append(args, wid)
		sql += ` AND m.warehouse_id = $3`
	}
	rows, err := store.Pool.Query(r.Context(), sql+` ORDER BY m.doc_date, m.id`, args...)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	balance := 0.0
	for rows.Next() {
		var date, wh, kind string
		var qty float64
		var number int
		var raw []byte
		if rows.Scan(&date, &wh, &qty, &kind, &number, &raw) != nil {
			continue
		}
		d := jsonx.Decode(raw)
		balance = math.Round((balance+qty)*1000) / 1000
		row := jsonx.M{"date": date, "kind": kind, "number": number, "docId": jsonx.Str(d, "id"), "warehouseId": wh, "party": jsonx.Str(d, "party"), "note": jsonx.Str(d, "note"), "balance": balance}
		if qty >= 0 {
			row["in"], row["out"] = qty, 0
		} else {
			row["in"], row["out"] = 0, -qty
		}
		out = append(out, row)
	}
p := jsonx.Decode(praw)
	p["id"] = pid
	delete(p, "cost") // purchase prices are not shown anywhere: only the selling prices
	if !whMoneyAllowed(me) {
		delete(p, "prices")
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"product": p, "rows": out, "balance": balance})
}

// ---------- products and warehouses ----------

func whSave(table string, w http.ResponseWriter, r *http.Request, build func(body jsonx.M) (jsonx.M, string, string)) {
	me := auth.Current(r)
	if whDenied(w, me) {
		return
	}
	id := r.PathValue("id")
	if !whID.MatchString(id) {
		httpx.Error(w, http.StatusBadRequest, "شناسه نامعتبر است.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, code, bad := build(body)
	if bad != "" {
		httpx.Error(w, http.StatusBadRequest, bad)
		return
	}
	doc["id"] = id
	var err error
	if table == "wh_products" {
		_, err = store.Pool.Exec(r.Context(), `INSERT INTO wh_products (id, code, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET code = $2, data = $3::jsonb`, id, code, jsonx.Encode(doc))
	} else {
		_, err = store.Pool.Exec(r.Context(), `INSERT INTO wh_warehouses (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`, id, jsonx.Encode(doc))
	}
	if err != nil {
		if strings.Contains(err.Error(), "23505") || strings.Contains(err.Error(), "duplicate key") {
			httpx.Error(w, http.StatusConflict, "کالایی با همین کد قبلاً ثبت شده است.")
			return
		}
		internalError(w)
		return
	}
	httpx.OK(w)
}

// PUT /api/warehouse/products/{id}
func whProductPut(w http.ResponseWriter, r *http.Request) {
	if whMode(r.Context()) == "sepidar" {
		whLimitedUpdate("wh_products", []string{"minQty", "note", "prices", "cost"}, w, r)
		return
	}
	whSave("wh_products", w, r, func(b jsonx.M) (jsonx.M, string, string) {
		code := strings.TrimSpace(faDigits.Replace(whText(b, "code", 40)))
		title := whText(b, "title", 120)
		if code == "" || title == "" {
			return nil, "", "کد کالا و نام کالا را بنویسید."
		}
		minQty, _ := whNum(b, "minQty")
		if minQty < 0 {
			return nil, "", "حداقل موجودی نمی‌تواند منفی باشد."
		}
		active := true
		if v, ok := b["active"].(bool); ok {
			active = v
		}
		unit := whText(b, "unit", 20)
		if unit == "" {
			unit = "عدد"
		}
		prices, msg := whPrices(b)
		if msg != "" {
			return nil, "", msg
		}
doc := jsonx.M{"code": code, "title": title, "unit": unit, "group": whText(b, "group", 60), "minQty": minQty, "barcode": whText(b, "barcode", 60), "note": whText(b, "note", 500),"active": active, "prices": prices}
		if jsonx.Str(b, "kind") == "service" { // a service is sold and priced but has no stock and no warehouse documents
			doc["kind"] = "service"
		}
		if !whMoneyAllowed(auth.Current(r)) {
			whKeepMoney(r, doc)
		}
		return doc, code, ""
	})
}

// whKeepMoney: a person who may not see prices and costs saves a product without them; the ones already stored stay as they are.
func whKeepMoney(r *http.Request, doc jsonx.M) {
	var raw []byte
	delete(doc, "prices")
	delete(doc, "cost")
	if store.Pool.QueryRow(r.Context(), `SELECT data FROM wh_products WHERE id = $1`, r.PathValue("id")).Scan(&raw) != nil {
		return
	}
	old := jsonx.Decode(raw)
	if v, ok := old["prices"]; ok {
		doc["prices"] = v
	}
	if v, ok := old["cost"]; ok {
		doc["cost"] = v
	}
}

// whPrices: a product can have several named prices (retail, wholesale, agent…).
func whPrices(b jsonx.M) ([]jsonx.M, string) {
	out := []jsonx.M{}
	raw := jsonx.Arr(b, "prices")
	if len(raw) > 12 {
		return nil, "حداکثر ۱۲ قیمت برای هر کالا ممکن است."
	}
	seen := map[string]bool{}
	for _, x := range raw {
		m, _ := x.(map[string]any)
		title := whText(m, "title", 40)
		amount, ok := whNum(m, "amount")
		if title == "" && !ok {
			continue
		}
		if title == "" || !ok || amount < 0 || amount > 1e13 {
			return nil, "برای هر قیمت، عنوان و مبلغ درست بنویسید."
		}
		if seen[title] {
			return nil, "عنوان قیمت «" + title + "» تکراری است."
		}
		seen[title] = true
		out = append(out, jsonx.M{"title": title, "amount": amount})
	}
	return out, ""
}

// PUT /api/warehouse/warehouses/{id}
func whWarehousePut(w http.ResponseWriter, r *http.Request) {
	if whMode(r.Context()) == "sepidar" {
		whLimitedUpdate("wh_warehouses", []string{"note", "location", "keeperId"}, w, r)
		return
	}
	whSave("wh_warehouses", w, r, func(b jsonx.M) (jsonx.M, string, string) {
		title := whText(b, "title", 80)
		if title == "" {
			return nil, "", "نام انبار را بنویسید."
		}
		active := true
		if v, ok := b["active"].(bool); ok {
			active = v
		}
		return jsonx.M{"title": title, "code": whText(b, "code", 20), "location": whText(b, "location", 200), "keeperId": whText(b, "keeperId", 60), "note": whText(b, "note", 500), "active": active}, "", ""
	})
}

func whDelete(table, col string, w http.ResponseWriter, r *http.Request) {
	if whMode(r.Context()) == "sepidar" {
		httpx.Error(w, http.StatusConflict, whSepidarMsg)
		return
	}
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Error(w, http.StatusForbidden, "حذف فقط با مدیر سیستم است.")
		return
	}
	id := r.PathValue("id")
	// a warehouse (or a product) that still holds stock is never deleted
	var onHand float64
	_ = store.Pool.QueryRow(r.Context(), `SELECT COALESCE(SUM(qty), 0)::float8 FROM wh_moves WHERE `+col+` = $1 AND NOT voided`, id).Scan(&onHand)
	if math.Abs(onHand) > 0.0004 {
		what := "این انبار"
		if col == "product_id" {
			what = "این کالا"
		}
		httpx.Error(w, http.StatusConflict, what+" هنوز موجودی دارد؛ تا موجودی هست حذف نمی‌شود. اول موجودی را منتقل یا با حواله خارج کنید، یا به‌جای حذف آن را غیرفعال کنید.")
		return
	}
	var used int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM wh_moves WHERE `+col+` = $1`, id).Scan(&used)
	if used > 0 {
		httpx.Error(w, http.StatusConflict, "این مورد در اسناد انبار استفاده شده و حذف نمی‌شود؛ به‌جای حذف، آن را غیرفعال کنید.")
		return
	}
	var title string
	if store.Pool.QueryRow(r.Context(), `DELETE FROM `+table+` WHERE id = $1 RETURNING COALESCE(data->>'title', '')`, id).Scan(&title) == nil {
		auditLine(r, me, "WARNING", "حذف از انبارداری: «"+title+"»")
	}
	httpx.OK(w)
}

func whProductDelete(w http.ResponseWriter, r *http.Request) {
	whDelete("wh_products", "product_id", w, r)
}
func whWarehouseDelete(w http.ResponseWriter, r *http.Request) {
	whDelete("wh_warehouses", "warehouse_id", w, r)
}

// ---------- documents ----------

type whLine struct {
	pid    string
	code   string
	title  string
	unit   string
	min    float64
	qty    float64 // as typed (receipt / issue / transfer: the amount; adjust: the counted stock)
	delta  float64 // what the stock changes by
	before float64
}

func whBal(ctx context.Context, tx pgx.Tx, pid, wid string) float64 {
	var n float64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(SUM(qty), 0)::float8 FROM wh_moves WHERE NOT voided AND product_id = $1 AND warehouse_id = $2`, pid, wid).Scan(&n)
	return math.Round(n*1000) / 1000
}

func whWarehouseOf(ctx context.Context, tx pgx.Tx, id string) (string, string) {
	var raw []byte
	if tx.QueryRow(ctx, `SELECT data FROM wh_warehouses WHERE id = $1`, id).Scan(&raw) != nil {
		return "", "انبار پیدا نشد."
	}
	d := jsonx.Decode(raw)
	if v, ok := d["active"].(bool); ok && !v {
		return "", "انبار «" + jsonx.Str(d, "title") + "» غیرفعال است."
	}
	return jsonx.Str(d, "title"), ""
}

// POST /api/warehouse/docs {kind, date, warehouseId, toWarehouseId, party, customerId, note, reason, lines:[{productId, qty}]}
func whCreateDoc(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if whDenied(w, me) {
		return
	}
	if whMode(r.Context()) == "sepidar" {
		httpx.Error(w, http.StatusConflict, whSepidarMsg)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	bad := func(msg string) { httpx.Error(w, http.StatusBadRequest, msg) }
	kind := jsonx.Str(body, "kind")
if _, ok := whKinds[kind]; !ok {
		bad("نوع سند نامعتبر است.")
		return
	}
	if !whKindAllowed(me, kind) {
		httpx.Error(w, http.StatusForbidden, "ثبت و دیدن «"+whKinds[kind]+"» برای شما در جدول مجوزها بسته شده است.")
		return
	}
	date := jsonx.Str(body, "date")
	if !whDocDate.MatchString(date) {
		bad("تاریخ سند را وارد کنید.")
		return
	}
	if t, err := time.Parse("2006-01-02", date); err != nil || t.After(time.Now().Add(48*time.Hour)) {
		bad("تاریخ سند نمی‌تواند در آینده باشد.")
		return
	}
	rawLines := jsonx.Arr(body, "lines")
	if len(rawLines) == 0 || len(rawLines) > 200 {
		bad("حداقل یک ردیف کالا لازم است (و حداکثر ۲۰۰ ردیف).")
		return
	}
	reason := whText(body, "reason", 300)
	if kind == "adjust" && reason == "" {
		bad("برای تعدیل، دلیل (مثلاً انبارگردانی) را بنویسید.")
		return
	}
	ctx := r.Context()
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		internalError(w)
		return
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, whLock); err != nil {
		internalError(w)
		return
	}
	from := jsonx.Str(body, "warehouseId")
	fromName, msg := whWarehouseOf(ctx, tx, from)
	if msg != "" {
		bad(msg)
		return
	}
	to, toName := "", ""
	if kind == "transfer" {
		to = jsonx.Str(body, "toWarehouseId")
		if to == from {
			bad("انبار مبدأ و مقصد نباید یکی باشد.")
			return
		}
		if toName, msg = whWarehouseOf(ctx, tx, to); msg != "" {
			bad(msg)
			return
		}
	}
	seen := map[string]bool{}
	var lines []whLine
	for i, rl := range rawLines {
		m, _ := rl.(map[string]any)
		pid := jsonx.Str(m, "productId")
		var praw []byte
		if pid == "" || tx.QueryRow(ctx, `SELECT data FROM wh_products WHERE id = $1`, pid).Scan(&praw) != nil {
			bad(fmt.Sprintf("کالای ردیف %d پیدا نشد.", i+1))
			return
		}
		p := jsonx.Decode(praw)
		if v, ok := p["active"].(bool); ok && !v {
			bad("کالای «" + jsonx.Str(p, "title") + "» غیرفعال است.")
			return
		}
		if jsonx.Str(p, "kind") == "service" {
			bad("«" + jsonx.Str(p, "title") + "» خدمت است و موجودی ندارد؛ سند انبار برایش ثبت نمی‌شود.")
			return
		}
		if seen[pid] {
			bad("کالای «" + jsonx.Str(p, "title") + "» دو بار آمده است؛ ردیف‌ها را یکی کنید.")
			return
		}
		seen[pid] = true
		qty, okq := whNum(m, "qty")
		if !okq || qty > 1e9 || (kind != "adjust" && qty <= 0) || qty < 0 {
			bad("مقدار کالای «" + jsonx.Str(p, "title") + "» درست نیست.")
			return
		}
		min, _ := whNum(p, "minQty")
		l := whLine{pid: pid, code: jsonx.Str(p, "code"), title: jsonx.Str(p, "title"), unit: jsonx.Str(p, "unit"), min: min, qty: qty}
		l.before = whBal(ctx, tx, pid, from)
		switch kind {
		case "receipt":
			l.delta = qty
		case "issue", "transfer":
			if l.before < qty {
				bad(fmt.Sprintf("موجودی «%s» در انبار «%s» فقط %s %s است.", l.title, fromName, strconv.FormatFloat(l.before, 'f', -1, 64), l.unit))
				return
			}
			l.delta = -qty
		case "adjust":
			l.delta = math.Round((qty-l.before)*1000) / 1000
		}
		lines = append(lines, l)
	}
	var number int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(number), 1000) + 1 FROM wh_docs WHERE kind = $1`, kind).Scan(&number); err != nil {
		internalError(w)
		return
	}
	id := "wd-" + randomHex(6)
	customerID, customerName := whText(body, "customerId", 60), ""
	if customerID != "" {
		_ = tx.QueryRow(ctx, `SELECT COALESCE(data->>'name', '') FROM crm_customers WHERE id = $1`, customerID).Scan(&customerName)
		if customerName == "" {
			customerID = ""
		}
	}
	docLines := []jsonx.M{}
	for _, l := range lines {
		row := jsonx.M{"productId": l.pid, "code": l.code, "title": l.title, "unit": l.unit, "qty": l.qty}
		if kind == "adjust" {
			row["before"], row["delta"] = l.before, l.delta
		}
		docLines = append(docLines, row)
	}
	doc := jsonx.M{"id": id, "kind": kind, "number": number, "date": date, "warehouseId": from, "warehouseName": fromName, "party": whText(body, "party", 120),
		"customerId": customerID, "customerName": customerName, "note": whText(body, "note", 500), "reason": reason, "lines": docLines,
		"createdBy": me.ID(), "createdByName": me.Name(), "createdAt": now()}
	if kind == "transfer" {
		doc["toWarehouseId"], doc["toWarehouseName"] = to, toName
	}
	if _, err := tx.Exec(ctx, `INSERT INTO wh_docs (id, kind, number, data) VALUES ($1, $2, $3, $4::jsonb)`, id, kind, number, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	for _, l := range lines {
		if l.delta != 0 {
			if _, err := tx.Exec(ctx, `INSERT INTO wh_moves (doc_id, product_id, warehouse_id, qty, doc_date) VALUES ($1, $2, $3, $4, $5)`, id, l.pid, from, l.delta, date); err != nil {
				internalError(w)
				return
			}
		}
		if kind == "transfer" {
			if _, err := tx.Exec(ctx, `INSERT INTO wh_moves (doc_id, product_id, warehouse_id, qty, doc_date) VALUES ($1, $2, $3, $4, $5)`, id, l.pid, to, l.qty, date); err != nil {
				internalError(w)
				return
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w)
		return
	}
	go whLowStock(lines, kind, from, me.ID())
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id, "number": number, "kind": kind})
}

// whLowStock tells the warehouse people when a product has just fallen under its minimum (once: while it stays low nothing more is sent).
func whLowStock(lines []whLine, kind, wid, by string) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var users []string
	rows, err := store.Pool.Query(ctx, `SELECT id FROM users WHERE data->>'canUseWarehouse' = 'true' OR data->>'role' IN ('SUPER_ADMIN', 'DEPT_ADMIN')`)
	if err != nil {
		return
	}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			users = append(users, id)
		}
	}
	rows.Close()
	for _, l := range lines {
		if l.min <= 0 || l.delta >= 0 || kind == "transfer" {
			continue
		}
		var total float64
		_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(SUM(qty), 0)::float8 FROM wh_moves WHERE NOT voided AND product_id = $1`, l.pid).Scan(&total)
		after := math.Round(total*1000) / 1000
		if after < l.min && after-l.delta >= l.min {
			notify.Notify(ctx, users, notify.Note{Kind: "alert", Label: "موجودی کم", Title: "موجودی «" + l.title + "» به زیر حداقل رسید",
				Body: fmt.Sprintf("اکنون %s %s (حداقل %s)", strconv.FormatFloat(after, 'f', -1, 64), l.unit, strconv.FormatFloat(l.min, 'f', -1, 64)), Ref: ref("warehouse", l.pid)}, by)
		}
	}
}

// POST /api/warehouse/docs/{id}/void {reason} (admins): switches the document's movements off, when no later stock depends on them.
func whVoidDoc(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Error(w, http.StatusForbidden, "ابطال سند فقط با مدیر سیستم است.")
		return
	}
	if whMode(r.Context()) == "sepidar" {
		httpx.Error(w, http.StatusConflict, whSepidarMsg)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	reason := whText(body, "reason", 300)
	if reason == "" {
		httpx.Error(w, http.StatusBadRequest, "دلیل ابطال را بنویسید.")
		return
	}
	ctx := r.Context()
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		internalError(w)
		return
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, whLock)
	id := r.PathValue("id")
	var raw []byte
	var voided bool
	if tx.QueryRow(ctx, `SELECT data, voided FROM wh_docs WHERE id = $1`, id).Scan(&raw, &voided) != nil {
		httpx.Error(w, http.StatusNotFound, "سند پیدا نشد.")
		return
	}
	if voided {
		httpx.OK(w)
		return
	}
	rows, err := tx.Query(ctx, `SELECT m.product_id, m.warehouse_id, SUM(m.qty)::float8, COALESCE(p.data->>'title', ''), COALESCE(wh.data->>'title', '') FROM wh_moves m
		LEFT JOIN wh_products p ON p.id = m.product_id LEFT JOIN wh_warehouses wh ON wh.id = m.warehouse_id WHERE m.doc_id = $1 AND NOT m.voided GROUP BY m.product_id, m.warehouse_id, p.data->>'title', wh.data->>'title'`, id)
	if err != nil {
		internalError(w)
		return
	}
	type key struct{ p, w, pt, wt string }
	var keys []key
	var sums []float64
	for rows.Next() {
		var k key
		var s float64
		if rows.Scan(&k.p, &k.w, &s, &k.pt, &k.wt) == nil {
			keys, sums = append(keys, k), append(sums, s)
		}
	}
	rows.Close()
	for i, k := range keys {
		if after := whBal(ctx, tx, k.p, k.w) - sums[i]; after < -0.0005 {
			httpx.Error(w, http.StatusConflict, fmt.Sprintf("با ابطال این سند موجودی «%s» در انبار «%s» منفی می‌شود (چون بعداً از آن خارج شده است). اول اسناد بعدی را ابطال کنید.", k.pt, k.wt))
			return
		}
	}
	d := jsonx.Decode(raw)
	d["voidedBy"], d["voidedByName"], d["voidedAt"], d["voidReason"] = me.ID(), me.Name(), now(), reason
	if _, err := tx.Exec(ctx, `UPDATE wh_moves SET voided = true WHERE doc_id = $1`, id); err != nil {
		internalError(w)
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE wh_docs SET voided = true, data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(d)); err != nil {
		internalError(w)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "WARNING", fmt.Sprintf("ابطال سند انبار %s شمارهٔ %d: %s", whKinds[jsonx.Str(d, "kind")], jsonx.Int(d, "number"), reason))
	httpx.OK(w)
}

// GET /api/crm/products: the product list as the sales people need it (name, code, unit, stock, the named prices) when they quote a price;
// people with customer access can read it without the warehouse right (no warehouse details, no documents).
func crmProducts(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() && !canUseWarehouse(me) {
		httpx.Forbidden(w)
		return
	}
	ctx := r.Context()
	bal, err := whBalances(ctx, store.Pool)
	if err != nil {
		internalError(w)
		return
	}
	rows, err := store.Pool.Query(ctx, `SELECT id, data FROM wh_products WHERE COALESCE(data->>'active', 'true') <> 'false' ORDER BY (data->>'title') LIMIT 5000`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var id string
		var raw []byte
		if rows.Scan(&id, &raw) != nil {
			continue
		}
		d := jsonx.Decode(raw)
		total := 0.0
		for _, n := range bal[id] {
			total += n
		}
		out = append(out, jsonx.M{"id": id, "code": jsonx.Str(d, "code"), "title": jsonx.Str(d, "title"), "unit": jsonx.Str(d, "unit"), "group": jsonx.Str(d, "group"), "total": math.Round(total*1000) / 1000, "prices": d["prices"], "cost": costFor(me, d)})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"products": out})
}

func registerWarehouse(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/crm/products", auth.Require(crmProducts))
	mux.HandleFunc("PUT /api/warehouse/mode", auth.Require(whSetMode))
	mux.HandleFunc("GET /api/warehouse", auth.Require(whState))
	mux.HandleFunc("GET /api/warehouse/docs", auth.Require(whDocs))
	mux.HandleFunc("POST /api/warehouse/sepidar-docs", auth.Require(whSepDocsImport))
	mux.HandleFunc("GET /api/warehouse/card", auth.Require(whCard))
	mux.HandleFunc("PUT /api/warehouse/products/{id}", auth.Require(whProductPut))
	mux.HandleFunc("DELETE /api/warehouse/products/{id}", auth.Require(whProductDelete))
	mux.HandleFunc("PUT /api/warehouse/warehouses/{id}", auth.Require(whWarehousePut))
	mux.HandleFunc("DELETE /api/warehouse/warehouses/{id}", auth.Require(whWarehouseDelete))
	mux.HandleFunc("POST /api/warehouse/docs", auth.Require(whCreateDoc))
	mux.HandleFunc("POST /api/warehouse/docs/{id}/void", auth.Require(whVoidDoc))
}

// ---------- who keeps the stock: Hoormand itself («standalone») or the accounting program («sepidar») ----------

const whSepidarMsg = "موجودی انبار از سپیدار می‌آید؛ رسید و حواله و تغییر کالا و انبار را در سپیدار انجام دهید. (برای ثبت در خود هورمند، مدیر باید حالت انبار را «مستقل» کند.)"

func whModeInfo(ctx context.Context) (mode, lastSync, source string) {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'warehouse'`).Scan(&raw)
	d := jsonx.Decode(raw)
	mode = jsonx.Str(d, "mode")
	if mode != "sepidar" || sepidarChoice(ctx) == "no" { // «سپیدار ندارم»: the warehouse is Hoormand's own
		mode = "standalone"
	}
	return mode, jsonx.Str(d, "lastSyncAt"), jsonx.Str(d, "source")
}

func whMode(ctx context.Context) string {
	m, _, _ := whModeInfo(ctx)
	return m
}

func whStoreMode(ctx context.Context, mode, source string, touchSync bool) {
	_, last, src := whModeInfo(ctx)
	if touchSync {
		last, src = now(), source
	}
	d := jsonx.M{"mode": mode, "lastSyncAt": last, "source": src}
	_, _ = store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('warehouse', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(d))
}

// PUT /api/warehouse/mode {mode} (admins)
func whSetMode(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	mode := jsonx.Str(body, "mode")
	if mode != "standalone" && mode != "sepidar" {
		httpx.Error(w, http.StatusBadRequest, "حالت نامعتبر است.")
		return
	}
	if mode == "sepidar" && sepidarChoice(r.Context()) == "no" {
		httpx.Error(w, http.StatusConflict, "سپیدار برای این سامانه خاموش است (کنسول مدیریت ← «سپیدار دارم / ندارم»).")
		return
	}
	whStoreMode(r.Context(), mode, "", false)
	auditLine(r, me, "WARNING", "حالت انبارداری: "+map[string]string{"standalone": "مستقل (موجودی در خود هورمند)", "sepidar": "متصل به سپیدار (موجودی از سپیدار)"}[mode])
	httpx.OK(w)
}

// whLimitedUpdate: while the accounting program owns the stock, the codes, names and units come from it; only a few fields stay Hoormand's own.
func whLimitedUpdate(table string, keep []string, w http.ResponseWriter, r *http.Request) {
	if whDenied(w, auth.Current(r)) {
		return
	}
	id := r.PathValue("id")
	var raw []byte
	if store.Pool.QueryRow(r.Context(), `SELECT data FROM `+table+` WHERE id = $1`, id).Scan(&raw) != nil {
		httpx.Error(w, http.StatusConflict, whSepidarMsg)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	d := jsonx.Decode(raw)
	for _, k := range keep {
		if _, has := body[k]; !has {
			continue
		}
		if k == "prices" {
				prices, msg := whPrices(body)
				if msg != "" {
					httpx.Error(w, http.StatusBadRequest, msg)
					return
				}
				d[k] = prices
				continue
			}
		if k == "minQty" {
			v, ok := whNum(body, k)
			if !ok || v < 0 {
				httpx.Error(w, http.StatusBadRequest, "حداقل موجودی درست نیست.")
				return
			}
			d[k] = v
		} else {
			d[k] = whText(body, k, 500)
		}
	}
	if _, err := store.Pool.Exec(r.Context(), `UPDATE `+table+` SET data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(d)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

func whCodeID(prefix, code string) string {
	h := sha1.Sum([]byte(prefix + ":" + code))
	return prefix + "-" + hex.EncodeToString(h[:])[:14]
}

func whAct(m jsonx.M) bool {
	if v, ok := m["active"].(bool); ok {
		return v
	}
	return true
}

func whCode(s string) string { return strings.TrimSpace(faDigits.Replace(s)) }

// whSync takes the catalogue and the stock of the accounting program: products and warehouses are created or refreshed by code (a product that is
// new there is new here), and the stock of every warehouse is set by one adjustment document that holds only the differences, so the card of each
// product shows what happened.
func whSync(ctx context.Context, by auth.User, keyName string, body jsonx.M) (jsonx.M, error) {
	if sepidarChoice(ctx) == "no" {
		return nil, fmt.Errorf("سپیدار برای این سامانه خاموش است؛ انبار مستقل است.")
	}
	warehouses, products, stock := jsonx.Arr(body, "warehouses"), jsonx.Arr(body, "products"), jsonx.Arr(body, "stock")
	if len(warehouses) > 500 || len(products) > 50000 || len(stock) > 200000 {
		return nil, fmt.Errorf("حجم اطلاعات از حد مجاز بیشتر است.")
	}
	complete := jsonx.Bool(body, "complete")
	if len(stock) == 0 {
		complete = false // a synchronisation without a single stock row must never zero the stock Hoormand holds (an older program could not read it)
	}
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, whLock); err != nil {
		return nil, err
	}
	var whNew, pNew, pUpd, docs, changed int
	whIDs, whNames, prodDocs := map[string]string{}, map[string]string{}, map[string]jsonx.M{}
	for i, x := range warehouses {
		m, _ := x.(map[string]any)
		code, title := whCode(whText(m, "code", 40)), whText(m, "title", 80)
		if code == "" || title == "" {
			return nil, fmt.Errorf("انبار ردیف %d کد یا نام ندارد.", i+1)
		}
		var id string
		var raw []byte
		d := jsonx.M{}
		if tx.QueryRow(ctx, `SELECT id, data FROM wh_warehouses WHERE data->>'code' = $1`, code).Scan(&id, &raw) == nil {
			d = jsonx.Decode(raw)
		} else {
			id = whCodeID("wh", code)
			whNew++
		}
		d["id"], d["code"], d["title"], d["active"] = id, code, title, whAct(m)
		if loc := whText(m, "location", 200); loc != "" {
			d["location"] = loc
		}
		if ex := whExtra(m); len(ex) > 0 {
			d["sepidar"] = ex
		}
		if _, err := tx.Exec(ctx, `INSERT INTO wh_warehouses (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`, id, jsonx.Encode(d)); err != nil {
			return nil, err
		}
		whIDs[code], whNames[code] = id, title
	}
	for i, x := range products {
		m, _ := x.(map[string]any)
		code, title := whCode(whText(m, "code", 40)), whText(m, "title", 120)
		if code == "" || title == "" {
			return nil, fmt.Errorf("کالای ردیف %d کد یا نام ندارد.", i+1)
		}
		var id string
		var raw []byte
		d := jsonx.M{}
		if tx.QueryRow(ctx, `SELECT id, data FROM wh_products WHERE code = $1`, code).Scan(&id, &raw) == nil {
			d = jsonx.Decode(raw)
			pUpd++
		} else {
			id = whCodeID("p", code)
			pNew++
		}
		unit := whText(m, "unit", 20)
		if unit == "" {
			unit = "عدد"
		}
		d["id"], d["code"], d["title"], d["unit"], d["active"] = id, code, title, unit, whAct(m)
		if g := whText(m, "group", 60); g != "" {
			d["group"] = g
		}
		if b := whText(m, "barcode", 60); b != "" {
			d["barcode"] = b
		}
		if jsonx.Str(m, "kind") == "service" {
			d["kind"] = "service"
		} else if _, has := m["kind"]; has {
			delete(d, "kind")
		}
		if ex := whExtra(m); len(ex) > 0 {
			d["sepidar"] = ex
		}
		if _, err := tx.Exec(ctx, `INSERT INTO wh_products (id, code, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (id) DO UPDATE SET code = $2, data = $3::jsonb`, id, code, jsonx.Encode(d)); err != nil {
			return nil, err
		}
		prodDocs[code] = d
	}
	want := map[string]map[string]float64{} // warehouse code -> product code -> quantity
	for i, x := range stock {
		m, _ := x.(map[string]any)
		pc, wc := whCode(jsonx.Str(m, "productCode")), whCode(jsonx.Str(m, "warehouseCode"))
		q, ok := whNum(m, "qty")
		if !ok || q < 0 || q > 1e9 {
			return nil, fmt.Errorf("موجودی ردیف %d درست نیست.", i+1)
		}
		if _, known := whIDs[wc]; !known {
			continue
		}
		if _, known := prodDocs[pc]; !known {
			continue
		}
		if want[wc] == nil {
			want[wc] = map[string]float64{}
		}
		want[wc][pc] += q
	}
	bal, err := whBalances(ctx, tx)
	if err != nil {
		return nil, err
	}
	date := time.Now().In(time.FixedZone("tehran", 3*3600+1800)).Format("2006-01-02")
	pidToCode := map[string]string{}
	for pc, d := range prodDocs {
		pidToCode[jsonx.Str(d, "id")] = pc
	}
	for wc, wid := range whIDs {
		type chg struct {
			pc          string
			qty, before float64
		}
		var changes []chg
		for pc, q := range want[wc] {
			if before := bal[jsonx.Str(prodDocs[pc], "id")][wid]; math.Abs(before-q) > 0.0004 {
				changes = append(changes, chg{pc, q, before})
			}
		}
		if complete { // a product the program does not list in this warehouse has none there (only the products this synchronisation knows)
			for pid, byWh := range bal {
				pc, inSync := pidToCode[pid]
				if _, listed := want[wc][pc]; inSync && !listed && math.Abs(byWh[wid]) > 0.0004 {
					changes = append(changes, chg{pc, 0, byWh[wid]})
				}
			}
		}
		if len(changes) == 0 {
			continue
		}
		var number int
		if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(number), 1000) + 1 FROM wh_docs WHERE kind = 'adjust'`).Scan(&number); err != nil {
			return nil, err
		}
		id := "wd-" + randomHex(6)
		lines := []jsonx.M{}
		for _, c := range changes {
			p := prodDocs[c.pc]
			delta := math.Round((c.qty-c.before)*1000) / 1000
			lines = append(lines, jsonx.M{"productId": jsonx.Str(p, "id"), "code": c.pc, "title": jsonx.Str(p, "title"), "unit": jsonx.Str(p, "unit"), "qty": c.qty, "before": c.before, "delta": delta})
		}
		doc := jsonx.M{"id": id, "kind": "adjust", "number": number, "date": date, "warehouseId": wid, "warehouseName": whNames[wc], "party": keyName, "note": "",
			"reason": "همگام‌سازی خودکار موجودی از " + keyName, "lines": lines, "createdBy": by.ID(), "createdByName": "برنامهٔ " + keyName, "createdAt": now(), "auto": true}
		if _, err := tx.Exec(ctx, `INSERT INTO wh_docs (id, kind, number, data) VALUES ($1, 'adjust', $2, $3::jsonb)`, id, number, jsonx.Encode(doc)); err != nil {
			return nil, err
		}
		for _, l := range lines {
			if _, err := tx.Exec(ctx, `INSERT INTO wh_moves (doc_id, product_id, warehouse_id, qty, doc_date) VALUES ($1, $2, $3, $4, $5)`, id, l["productId"], wid, l["delta"], date); err != nil {
				return nil, err
			}
		}
		docs++
		changed += len(lines)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	whStoreMode(ctx, "sepidar", keyName, true) // a program that sends the stock is the one that keeps it
	return jsonx.M{"warehousesNew": whNew, "productsNew": pNew, "productsUpdated": pUpd, "docs": docs, "changed": changed}, nil
}

// costFor: what a product costs the company is shown only to administrators (the profit report).
func costFor(me auth.User, d jsonx.M) any {
	return nil // no purchase price is sent to anybody; only the selling prices are used
}
