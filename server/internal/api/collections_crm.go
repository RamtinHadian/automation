package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// The CRM keeps three collections: customers, deals (the sales pipeline) and activities (notes, calls, meetings and
// follow-ups on a customer). Everyone with CRM access sees and can change all of them; only the owner (or an admin)
// can delete a customer or a deal, and only the author (or an admin) can delete an activity.

func now() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }

func crmDenied(w http.ResponseWriter, me auth.User) bool {
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return true
	}
	return false
}

// notifyNewOwner tells a person that a customer or deal was given to them by someone else.
func notifyNewOwner(r *http.Request, me auth.User, newOwner, oldOwner, kind, label, title, id string) {
	if newOwner == "" || newOwner == oldOwner || newOwner == me.ID() {
		return
	}
	notify.Notify(r.Context(), []string{newOwner}, notify.Note{
		Kind: "task", Label: label, Title: title + " (" + me.Name() + ")", Body: "", Ref: ref(kind, id), Repeat: true,
	}, me.ID())
}

// ---------- customers ----------

func putCustomer(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M) {
	if crmDenied(w, me) {
		return
	}
	var oldOwner string
	var createdAt string
	var raw []byte
	err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(owner_id, ''), data FROM crm_customers WHERE id = $1`, id).Scan(&oldOwner, &raw)
	exists := err == nil
	if err != nil && err != pgx.ErrNoRows {
		internalError(w)
		return
	}
	if exists {
		createdAt = jsonx.Str(jsonx.Decode(raw), "createdAt")
	}
	doc := jsonx.Copy(data)
	doc["id"] = id
	if jsonx.Str(doc, "ownerId") == "" {
		doc["ownerId"], doc["ownerName"] = me.ID(), me.Name()
	}
	if createdAt == "" {
		createdAt = jsonx.Str(doc, "createdAt")
		if createdAt == "" {
			createdAt = now()
		}
	}
	doc["createdAt"], doc["updatedAt"] = createdAt, now()
	owner := jsonx.Str(doc, "ownerId")
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)
		 ON CONFLICT (id) DO UPDATE SET owner_id = $2, data = $3::jsonb`, id, owner, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	notifyNewOwner(r, me, owner, oldOwner, "customer", "مشتری جدید", "مشتری «"+jsonx.Str(doc, "name")+"» به شما سپرده شد", id)
	httpx.OK(w)
}

func removeCustomer(w http.ResponseWriter, r *http.Request, me auth.User, id string) {
	if crmDenied(w, me) {
		return
	}
	var owner string
	err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(owner_id, '') FROM crm_customers WHERE id = $1`, id).Scan(&owner)
	if err == pgx.ErrNoRows {
		httpx.OK(w)
		return
	}
	if err != nil {
		internalError(w)
		return
	}
	if !me.IsAdmin() && owner != me.ID() {
		httpx.Forbidden(w)
		return
	}
	// The customer's deals and history go with it.
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM crm_activities WHERE customer_id = $1`, id)
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM crm_deals WHERE customer_id = $1`, id)
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM crm_customers WHERE id = $1`, id)
	httpx.OK(w)
}

// ---------- deals ----------

func putDeal(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M) {
	if crmDenied(w, me) {
		return
	}
	var oldOwner string
	var raw []byte
	err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(owner_id, ''), data FROM crm_deals WHERE id = $1`, id).Scan(&oldOwner, &raw)
	exists := err == nil
	if err != nil && err != pgx.ErrNoRows {
		internalError(w)
		return
	}
	before := jsonx.Decode(raw)
	doc := jsonx.Copy(data)
	doc["id"] = id
	if jsonx.Str(doc, "ownerId") == "" {
		doc["ownerId"], doc["ownerName"] = me.ID(), me.Name()
	}
	created := jsonx.Str(before, "createdAt")
	if created == "" {
		created = jsonx.Str(doc, "createdAt")
		if created == "" {
			created = now()
		}
	}
	doc["createdAt"], doc["updatedAt"] = created, now()
	stage := jsonx.Str(doc, "stage")
	if stage == "WON" || stage == "LOST" {
		if jsonx.Str(before, "closedAt") != "" && jsonx.Str(before, "stage") == stage {
			doc["closedAt"] = before["closedAt"]
		} else {
			doc["closedAt"] = now()
		}
	} else {
		delete(doc, "closedAt")
	}
	owner := jsonx.Str(doc, "ownerId")
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO crm_deals (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)
		 ON CONFLICT (id) DO UPDATE SET customer_id = $2, owner_id = $3, data = $4::jsonb`,
		id, jsonx.Str(doc, "customerId"), owner, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	notifyNewOwner(r, me, owner, oldOwner, "deal", "فرصت فروش", "فرصت «"+jsonx.Str(doc, "title")+"» به شما سپرده شد", id)
	// Besides the main owner a deal can have more people in charge («coOwnerIds»): they are told when they are added
	// and follow the deal's changes like the owner does.
	coOwners := []string{}
	prevCo := jsonx.Strings(before, "coOwnerIds")
	for _, u := range jsonx.Strings(doc, "coOwnerIds") {
		if u != "" && u != owner && !jsonx.Contains(coOwners, u) {
			coOwners = append(coOwners, u)
		}
	}
	for _, u := range coOwners {
		if !jsonx.Contains(prevCo, u) {
			notifyNewOwner(r, me, u, "", "deal", "فرصت فروش", "فرصت «"+jsonx.Str(doc, "title")+"» به شما نیز سپرده شد", id)
		}
	}
	watchers := []string{}
	if owner != "" && owner == oldOwner {
		watchers = append(watchers, owner)
	}
	for _, u := range coOwners {
		if jsonx.Contains(prevCo, u) {
			watchers = append(watchers, u)
		}
	}
	filtered := watchers[:0]
	for _, u := range watchers {
		if u != me.ID() {
			filtered = append(filtered, u)
		}
	}
	watchers = filtered
	if exists && len(watchers) > 0 {
		if jsonx.Str(before, "stage") != stage {
			notify.Notify(r.Context(), watchers, notify.Note{
				Kind: "task", Label: "تغییر مرحله", Title: "مرحلهٔ فرصت «" + jsonx.Str(doc, "title") + "» تغییر کرد",
				Body: dealStage(jsonx.Str(before, "stage")) + " ← " + dealStage(stage), Ref: ref("deal", id), Repeat: true,
			}, me.ID())
		}
		if jsonx.Str(before, "proformaNumber") == "" && jsonx.Str(doc, "proformaNumber") != "" {
			notify.Notify(r.Context(), watchers, notify.Note{
				Kind: "task", Label: "پیش‌فاکتور", Title: "برای فرصت «" + jsonx.Str(doc, "title") + "» پیش‌فاکتور صادر شد",
				Body: jsonx.Str(doc, "proformaNumber"), Ref: ref("deal", id), Repeat: true,
			}, me.ID())
		}
	}
	if exists && stage == "WON" && jsonx.Str(before, "stage") != "WON" {
		// Good news goes to the admins.
		rows, err := store.Pool.Query(r.Context(), `SELECT id FROM users WHERE data->>'role' IN ('SUPER_ADMIN','DEPT_ADMIN')`)
		if err == nil {
			var admins []string
			for rows.Next() {
				var uid string
				if rows.Scan(&uid) == nil {
					admins = append(admins, uid)
				}
			}
			rows.Close()
			notify.Notify(r.Context(), admins, notify.Note{
				Kind: "task", Label: "فروش موفق", Title: "فروش موفق: " + jsonx.Str(doc, "title"),
				Body: "مشتری " + jsonx.Str(doc, "customerName") + " — توسط " + me.Name(), Ref: ref("deal", id), Repeat: true,
			}, me.ID())
		}
	}
	httpx.OK(w)
}

func dealStage(s string) string {
	switch s {
	case "NEW":
		return "جدید"
	case "CONTACTED":
		return "تماس گرفته شد"
	case "PROPOSAL":
		return "پیشنهاد ارسال شد"
	case "NEGOTIATION":
		return "مذاکره"
	case "WON":
		return "فروش موفق"
	case "LOST":
		return "از دست رفت"
	}
	return s
}

func removeDeal(w http.ResponseWriter, r *http.Request, me auth.User, id string) {
	if crmDenied(w, me) {
		return
	}
	var owner string
	err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(owner_id, '') FROM crm_deals WHERE id = $1`, id).Scan(&owner)
	if err == pgx.ErrNoRows {
		httpx.OK(w)
		return
	}
	if err != nil {
		internalError(w)
		return
	}
	if !me.IsAdmin() && owner != me.ID() {
		httpx.Forbidden(w)
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM crm_deals WHERE id = $1`, id)
	httpx.OK(w)
}

// ---------- activities (notes, calls, meetings, follow-ups) ----------

func putActivity(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M) {
	if crmDenied(w, me) {
		return
	}
	var author string
	var raw []byte
	err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(owner_id, ''), data FROM crm_activities WHERE id = $1`, id).Scan(&author, &raw)
	exists := err == nil
	if err != nil && err != pgx.ErrNoRows {
		internalError(w)
		return
	}
	var doc jsonx.M
	switch {
	case !exists:
		doc = jsonx.Copy(data)
		doc["id"], doc["authorId"], doc["authorName"] = id, me.ID(), me.Name()
		if jsonx.Str(doc, "ownerId") == "" { // whose follow-up it is
			doc["ownerId"], doc["ownerName"] = me.ID(), me.Name()
		}
		doc["createdAt"] = now()
		author = me.ID()
	case me.IsAdmin() || jsonx.Str(jsonx.Decode(raw), "authorId") == me.ID():
		before := jsonx.Decode(raw)
		doc = jsonx.Copy(data)
		doc["id"], doc["authorId"], doc["authorName"], doc["createdAt"] = id, before["authorId"], before["authorName"], before["createdAt"]
	default:
		// Anyone with CRM access may tick a follow-up as done; nothing else.
		doc = jsonx.Decode(raw)
		if v, ok := data["done"]; ok {
			doc["done"] = v
		}
	}
	if jsonx.Bool(doc, "done") && jsonx.Str(doc, "doneAt") == "" {
		doc["doneAt"] = now()
	}
	if !jsonx.Bool(doc, "done") {
		delete(doc, "doneAt")
	}
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)
		 ON CONFLICT (id) DO UPDATE SET customer_id = $2, owner_id = $3, data = $4::jsonb`,
		id, jsonx.Str(doc, "customerId"), jsonx.Str(doc, "ownerId"), jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	// A note, call or meeting added to a customer that belongs to someone else tells its owner.
	if !exists && jsonx.Str(doc, "type") != "FOLLOWUP" {
		var custOwner, custName string
		_ = store.Pool.QueryRow(r.Context(), `SELECT COALESCE(owner_id, ''), COALESCE(data->>'name', '') FROM crm_customers WHERE id = $1`, jsonx.Str(doc, "customerId")).Scan(&custOwner, &custName)
		if custOwner != "" && custOwner != me.ID() {
			notify.Notify(r.Context(), []string{custOwner}, notify.Note{
				Kind: "task", Label: "سابقهٔ جدید", Title: "سابقهٔ جدید برای مشتری «" + custName + "»",
				Body: strings.TrimSpace(jsonx.Str(doc, "text")), Ref: ref("customer", jsonx.Str(doc, "customerId")), Repeat: true,
			}, me.ID())
		}
	}
	// A follow-up given to someone else tells them right away.
	if !exists && jsonx.Str(doc, "type") == "FOLLOWUP" {
		notifyNewOwner(r, me, jsonx.Str(doc, "ownerId"), "", "customer", "پیگیری جدید", "پیگیری مشتری برای شما ثبت شد: "+strings.TrimSpace(jsonx.Str(doc, "text")), jsonx.Str(doc, "customerId"))
	}
	httpx.OK(w)
}

func removeActivity(w http.ResponseWriter, r *http.Request, me auth.User, id string) {
	if crmDenied(w, me) {
		return
	}
	var raw []byte
	err := store.Pool.QueryRow(r.Context(), `SELECT data FROM crm_activities WHERE id = $1`, id).Scan(&raw)
	if err == pgx.ErrNoRows {
		httpx.OK(w)
		return
	}
	if err != nil {
		internalError(w)
		return
	}
	if !me.IsAdmin() && jsonx.Str(jsonx.Decode(raw), "authorId") != me.ID() {
		httpx.Forbidden(w)
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM crm_activities WHERE id = $1`, id)
	httpx.OK(w)
}
