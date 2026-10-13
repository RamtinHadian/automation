package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// Tools for the people who look after the customer file: finding a customer that was already entered (any salesperson), merging two files
// into one and handing a person's customers over to somebody else (administrators).

func registerCrmTools(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/crm/duplicates", auth.Require(crmDuplicates))
	mux.HandleFunc("POST /api/crm/merge", auth.Require(crmMerge))
	mux.HandleFunc("POST /api/crm/transfer", auth.Require(crmTransfer))
}

func digitsOnly(s string) string {
	return strings.Map(func(c rune) rune {
		switch {
		case c >= '0' && c <= '9':
			return c
		case c >= '۰' && c <= '۹':
			return '0' + (c - '۰')
		}
		return -1
	}, s)
}

// POST /api/crm/duplicates {phones:[..], nationalCode, exceptId}: who already has this number or national code. A salesperson does not see the
// customers of colleagues, so this is the one place that tells them «this customer exists, it belongs to …» (name and owner only).
func crmDuplicates(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if crmDenied(w, me) {
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	except := jsonx.Str(body, "exceptId")
	keys := []string{}
	for _, p := range jsonx.Strings(body, "phones") {
		if d := digitsOnly(p); len(d) >= 7 {
			keys = append(keys, d[len(d)-9:])
		} else if len(d) > 0 {
			continue
		}
	}
	nat := digitsOnly(jsonx.Str(body, "nationalCode"))
	out := []jsonx.M{}
	seen := map[string]bool{}
	add := func(sql string, args ...any) {
		rows, err := store.Pool.Query(r.Context(), sql, args...)
		if err != nil {
			return
		}
		defer rows.Close()
		for rows.Next() {
			var id, name, owner, phones string
			if rows.Scan(&id, &name, &owner, &phones) != nil || id == except || seen[id] {
				continue
			}
			seen[id] = true
			out = append(out, jsonx.M{"id": id, "name": name, "ownerName": owner, "mine": id != "" && crmOwnsCustomer(r, me, id)})
		}
	}
	for _, k := range keys {
		add(`SELECT id, COALESCE(data->>'name', ''), COALESCE(data->>'ownerName', ''), COALESCE(data->>'phones', '') FROM crm_customers WHERE data->>'phones' LIKE $1 LIMIT 5`, "%"+k+"%")
	}
	if len(nat) == 10 {
		add(`SELECT id, COALESCE(data->>'name', ''), COALESCE(data->>'ownerName', ''), '' FROM crm_customers WHERE data->>'nationalCode' = $1 OR data->>'nationalId' = $1 LIMIT 5`, nat)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"matches": out})
}

func isEmptyValue(v any) bool {
	switch t := v.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(t) == ""
	case []any:
		return len(t) == 0
	}
	return false
}

// POST /api/crm/merge {keepId, dropId} (administrators): everything of the second file moves to the first, then the second is removed.
func crmMerge(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	keep, drop := jsonx.Str(body, "keepId"), jsonx.Str(body, "dropId")
	if keep == "" || drop == "" || keep == drop {
		httpx.Error(w, http.StatusBadRequest, "دو مشتری متفاوت انتخاب کنید.")
		return
	}
	ctx := r.Context()
	var keepRaw, dropRaw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM crm_customers WHERE id = $1`, keep).Scan(&keepRaw) != nil || store.Pool.QueryRow(ctx, `SELECT data FROM crm_customers WHERE id = $1`, drop).Scan(&dropRaw) != nil {
		httpx.Error(w, http.StatusNotFound, "مشتری پیدا نشد.")
		return
	}
	k, d := jsonx.Decode(keepRaw), jsonx.Decode(dropRaw)
	merged := jsonx.Copy(k)
	for key, v := range d {
		switch key {
		case "id", "createdAt", "updatedAt", "ownerId", "ownerName":
			continue
		case "phones", "tags":
			have := map[string]bool{}
			list := []any{}
			for _, x := range jsonx.Strings(merged, key) {
				have[x] = true
				list = append(list, x)
			}
			for _, x := range jsonx.Strings(d, key) {
				if !have[x] {
					list = append(list, x)
				}
			}
			merged[key] = list
		case "notes":
			a, b := strings.TrimSpace(jsonx.Str(merged, key)), strings.TrimSpace(jsonx.Str(d, key))
			if b != "" && !strings.Contains(a, b) {
				merged[key] = strings.TrimSpace(a + "\n" + b)
			}
		default:
			if isEmptyValue(merged[key]) {
				merged[key] = v
			}
		}
	}
	merged["updatedAt"] = now()
	name := jsonx.Str(merged, "name")
	dropName := jsonx.Str(d, "name")

	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		internalError(w)
		return
	}
	defer tx.Rollback(ctx)
	steps := []struct {
		sql  string
		args []any
	}{
		{`UPDATE crm_customers SET data = $2::jsonb WHERE id = $1`, []any{keep, jsonx.Encode(merged)}},
		{`UPDATE crm_deals SET customer_id = $1, data = jsonb_set(jsonb_set(data, '{customerId}', to_jsonb($1::text)), '{customerName}', to_jsonb($2::text)) WHERE customer_id = $3`, []any{keep, name, drop}},
		{`UPDATE crm_activities SET customer_id = $1, data = jsonb_set(data, '{customerId}', to_jsonb($1::text)) WHERE customer_id = $3 AND $2::text = $2::text`, []any{keep, name, drop}},
		{`UPDATE warranties SET customer_id = $1, data = jsonb_set(jsonb_set(data, '{customerId}', to_jsonb($1::text)), '{customerName}', to_jsonb($2::text)) WHERE customer_id = $3`, []any{keep, name, drop}},
		{`UPDATE support_subs SET customer_id = $1, data = jsonb_set(jsonb_set(data, '{customerId}', to_jsonb($1::text)), '{customerName}', to_jsonb($2::text)) WHERE customer_id = $3`, []any{keep, name, drop}},
		{`UPDATE voip_calls SET customer_id = $1, customer_name = $2 WHERE customer_id = $3`, []any{keep, name, drop}},
		{`UPDATE wh_docs SET data = jsonb_set(jsonb_set(data, '{customerId}', to_jsonb($1::text)), '{customerName}', to_jsonb($2::text)) WHERE data->>'customerId' = $3`, []any{keep, name, drop}},
		{`UPDATE sepidar_links SET ref = $1 WHERE kind = 'customer' AND ref = $3 AND NOT EXISTS (SELECT 1 FROM sepidar_links WHERE kind = 'customer' AND ref = $1) AND $2::text = $2::text`, []any{keep, name, drop}},
		{`DELETE FROM sepidar_links WHERE kind = 'customer' AND ref = $3 AND $1::text = $1::text AND $2::text = $2::text`, []any{keep, name, drop}},
		{`DELETE FROM crm_customers WHERE id = $1`, []any{drop}},
		{`INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, []any{
			"mg-" + fmt.Sprint(time.Now().UnixNano()), keep, me.ID(),
			jsonx.Encode(jsonx.M{"id": "mg-" + fmt.Sprint(time.Now().UnixNano()), "customerId": keep, "type": "NOTE", "text": "پروندهٔ «" + dropName + "» با این پرونده ادغام شد.", "ownerId": me.ID(), "ownerName": me.Name(), "authorId": me.ID(), "authorName": me.Name(), "createdAt": now()}),
		}},
	}
	for _, s := range steps {
		if _, err := tx.Exec(ctx, s.sql, s.args...); err != nil {
			httpx.Error(w, http.StatusInternalServerError, "ادغام انجام نشد؛ هیچ تغییری ثبت نشد.")
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "WARNING", "ادغام مشتری «"+dropName+"» در «"+name+"»")
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "keepId": keep})
}

// POST /api/crm/transfer {fromId, toId, customers, deals, followups} (administrators): hands one person's work over to another.
func crmTransfer(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	from, to := jsonx.Str(body, "fromId"), jsonx.Str(body, "toId")
	if from == "" || to == "" || from == to {
		httpx.Error(w, http.StatusBadRequest, "دو همکار متفاوت انتخاب کنید.")
		return
	}
	ctx := r.Context()
	var toRaw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM users WHERE id = $1`, to).Scan(&toRaw) != nil {
		httpx.Error(w, http.StatusNotFound, "همکار مقصد پیدا نشد.")
		return
	}
	toUser := jsonx.Decode(toRaw)
	toName := jsonx.Str(toUser, "fullName")
	if !jsonx.Bool(toUser, "canUseCrm") && jsonx.Str(toUser, "role") == "STAFF" {
		httpx.Error(w, http.StatusBadRequest, "این همکار دسترسی منوی مشتریان ندارد.")
		return
	}
	set := `owner_id = $2, data = jsonb_set(jsonb_set(data, '{ownerId}', to_jsonb($2::text)), '{ownerName}', to_jsonb($3::text))`
	res := map[string]int64{}
	if jsonx.Bool(body, "customers") {
		t, err := store.Pool.Exec(ctx, `UPDATE crm_customers SET `+set+` WHERE owner_id = $1`, from, to, toName)
		if err != nil {
			internalError(w)
			return
		}
		res["customers"] = t.RowsAffected()
	}
	if jsonx.Bool(body, "deals") {
		t, err := store.Pool.Exec(ctx, `UPDATE crm_deals SET `+set+` WHERE owner_id = $1 AND COALESCE(data->>'stage', '') NOT IN ('WON', 'LOST')`, from, to, toName)
		if err != nil {
			internalError(w)
			return
		}
		res["deals"] = t.RowsAffected()
	}
	if jsonx.Bool(body, "followups") {
		t, err := store.Pool.Exec(ctx, `UPDATE crm_activities SET `+set+` WHERE owner_id = $1 AND data->>'type' = 'FOLLOWUP' AND COALESCE(data->>'done', 'false') <> 'true'`, from, to, toName)
		if err != nil {
			internalError(w)
			return
		}
		res["followups"] = t.RowsAffected()
	}
	if res["customers"]+res["deals"]+res["followups"] > 0 {
		notify.Notify(ctx, []string{to}, notify.Note{
			Kind: "task", Label: "انتقال مشتری", Title: "مشتری و کارهای یک همکار به شما سپرده شد",
			Body: fmt.Sprintf("%d مشتری، %d فرصت باز، %d پیگیری", res["customers"], res["deals"], res["followups"]), Repeat: true,
		}, me.ID())
	}
	auditLine(r, me, "WARNING", fmt.Sprintf("انتقال کار همکار به «%s»: %d مشتری، %d فرصت، %d پیگیری", toName, res["customers"], res["deals"], res["followups"]))
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "customers": res["customers"], "deals": res["deals"], "followups": res["followups"]})
}
