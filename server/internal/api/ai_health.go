package api

import (
	"context"
	"fmt"
	"strings"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// What went wrong the last time the AI service (togpt.ir) was used. The reason is kept in the support settings (shown to the
// admins in a red box there) and, when it is the kind that only the account owner can fix (no credit, wrong key, no connection),
// every administrator gets a notification once in a while. A successful call clears it.

type aiErr struct{ Kind, Msg string }

func (e *aiErr) Error() string { return e.Msg }

const (
	aiKindCredit     = "credit"
	aiKindKey        = "key"
	aiKindConnection = "connection"
	aiKindService    = "service"
	aiKindRate       = "rate"
)

// classifyAI turns a failed answer of the service into a clear message; nil when it is nothing special (the caller words it).
func classifyAI(status int, body string) *aiErr {
	b := strings.ToLower(body)
	noCredit := status == 402 ||
		strings.Contains(b, "insufficient") || strings.Contains(b, "credit") || strings.Contains(b, "balance") ||
		strings.Contains(b, "quota") || strings.Contains(b, "billing") || strings.Contains(b, "اعتبار") ||
		strings.Contains(b, "شارژ") || strings.Contains(b, "موجودی")
	switch {
	case status == 402 || (noCredit && (status == 429 || status == 400 || status == 403)):
		return &aiErr{aiKindCredit, fmt.Sprintf("شارژ پنل togpt.ir شما تمام شده یا به سقف رسیده است (پاسخ %d). وارد پنل togpt.ir شوید و حساب را شارژ کنید؛ بعد دوباره امتحان کنید.", status)}
	case status == 401 || status == 403:
		return &aiErr{aiKindKey, fmt.Sprintf("togpt.ir کلید API شما را نپذیرفت (پاسخ %d). کلید را از پنل togpt.ir دوباره کپی و در تنظیمات ذخیره کنید؛ اگر همین کلید جای دیگری هم هست، برای این سیستم کلید جدا بسازید.", status)}
	case status == 429:
		return &aiErr{aiKindRate, "togpt.ir می‌گوید درخواست‌ها بیش از حد است (پاسخ ۴۲۹). چند دقیقه بعد دوباره امتحان کنید."}
	case status >= 500:
		return &aiErr{aiKindService, fmt.Sprintf("سرویس togpt.ir الان خطا می‌دهد (پاسخ %d)؛ مشکل از سمت آن‌هاست. کمی بعد دوباره امتحان کنید.", status)}
	}
	return nil
}

func connectionErr(err error) *aiErr {
	reason := "پاسخی نیامد"
	if err != nil {
		reason = err.Error()
		if i := strings.Index(reason, "\": "); i >= 0 {
			reason = reason[i+3:]
		}
	}
	return &aiErr{aiKindConnection, "ارتباط با togpt.ir برقرار نشد (" + reason + "). اینترنت سرور و بازبودن togpt.ir را بررسی کنید؛ اگر مشکل ماند، پنل togpt.ir خودتان را ببینید."}
}

// recordAiHealth keeps the reason of the last failure (nil = the call worked and the reason is cleared).
func recordAiHealth(err error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	e, bad := err.(*aiErr)
	if err == nil {
		_, _ = store.Pool.Exec(ctx, `UPDATE settings SET data = data - 'aiLastError' WHERE key = 'support' AND data ? 'aiLastError'`)
		return
	}
	if !bad || e.Kind == aiKindRate {
		return
	}
	prev := supportSettings(ctx)
	old, _ := prev["aiLastError"].(map[string]any)
	oldKind, _ := old["kind"].(string)
	oldAt, _ := time.Parse(time.RFC3339, jsonx.Str(old, "at"))
	rec := jsonx.M{"kind": e.Kind, "message": e.Msg, "at": time.Now().UTC().Format(time.RFC3339)}
	_, _ = store.Pool.Exec(ctx, `UPDATE settings SET data = jsonb_set(data, '{aiLastError}', $1::jsonb) WHERE key = 'support'`, jsonx.Encode(rec))
	if e.Kind == aiKindService || (oldKind == e.Kind && time.Since(oldAt) < 6*time.Hour) {
		return
	}
	rows, qerr := store.Pool.Query(ctx, `SELECT id FROM users WHERE data->>'role' = 'SUPER_ADMIN' AND COALESCE((data->>'isActive')::boolean, true)`)
	if qerr != nil {
		return
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	notify.Notify(ctx, ids, notify.Note{Kind: "alert", Label: "هوش مصنوعی", Title: "هوش مصنوعی (togpt.ir) کار نمی‌کند", Body: e.Msg, Repeat: true}, "")
}
