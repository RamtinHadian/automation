package api

import (
	"net/http"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
)

// Who may use the AI features: each feature is a sub-right «ai.letters», «ai.minutes», «ai.calls», «ai.customer» of the permission table.
// It is allowed by default and switched off per person (hiddenSub); administrators always have it. Answers true when it has already refused.
func aiDenied(w http.ResponseWriter, me auth.User, id string) bool {
	if !subOff(me, id) {
		return false
	}
	httpx.Error(w, http.StatusForbidden, "مدیر سیستم استفاده از هوش مصنوعی را برای شما بسته است.")
	return true
}
