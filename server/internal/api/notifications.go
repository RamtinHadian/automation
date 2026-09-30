package api

import (
	"net/http"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/push"
	"automation/server/internal/store"
)

// notifyStream is the live stream of new notifications. A heartbeat every 15 s lets the client notice a dead stream.
func notifyStream(w http.ResponseWriter, r *http.Request) {
	notify.Hub.Serve(w, r, auth.Current(r).ID(), "data: {\"ping\":1}\n\n", 15*time.Second)
}

func listNotifications(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Pool.Query(r.Context(),
		`SELECT data, read FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, auth.Current(r).ID())
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	list := []jsonx.M{}
	for rows.Next() {
		var raw []byte
		var read bool
		if err := rows.Scan(&raw, &read); err != nil {
			internalError(w)
			return
		}
		n := jsonx.Decode(raw)
		n["read"] = read
		list = append(list, n)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"notifications": list})
}

func markNotificationsRead(w http.ResponseWriter, r *http.Request) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	me := auth.Current(r).ID()
	var err error
	if _, given := body["ids"].([]any); given {
		_, err = store.Pool.Exec(r.Context(), `UPDATE notifications SET read = true WHERE user_id = $1 AND id = ANY($2)`, me, jsonx.Strings(body, "ids"))
	} else {
		_, err = store.Pool.Exec(r.Context(), `UPDATE notifications SET read = true WHERE user_id = $1`, me)
	}
	if err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

func clearNotifications(w http.ResponseWriter, r *http.Request) {
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM notifications WHERE user_id = $1`, auth.Current(r).ID()); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// ---------- web push subscriptions ----------

func pushKey(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"publicKey": push.PublicKey()})
}

func pushSubscribe(w http.ResponseWriter, r *http.Request) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	sub := jsonx.Sub(body, "subscription")
	endpoint := jsonx.Str(sub, "endpoint")
	if endpoint == "" || len(jsonx.Sub(sub, "keys")) == 0 {
		httpx.Error(w, http.StatusBadRequest, "bad subscription")
		return
	}
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO push_subscriptions (endpoint, user_id, data) VALUES ($1, $2, $3::jsonb)
		 ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, data = $3::jsonb`,
		endpoint, auth.Current(r).ID(), jsonx.Encode(sub)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

func pushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`,
		jsonx.Str(body, "endpoint"), auth.Current(r).ID()); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}
