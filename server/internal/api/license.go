package api

import (
	"net/http"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/license"
)

// licenseStatus is public: the activation screen needs it before anyone can sign in.
func licenseStatus(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, license.Check())
}

// licenseActivate is public but only works while the installation is not in a valid licence (first install, or after expiry).
func licenseActivate(w http.ResponseWriter, r *http.Request) {
	if license.Check().Mode == "active" {
		httpx.Error(w, http.StatusForbidden, "این سامانه فعال است؛ تمدید را از تنظیمات (پس از ورود مدیر ارشد) انجام دهید.")
		return
	}
	activate(w, r)
}

// licenseRenew replaces the code (for example a longer subscription); only the chief admin.
func licenseRenew(w http.ResponseWriter, r *http.Request) {
	if auth.Current(r).Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	activate(w, r)
}

func activate(w http.ResponseWriter, r *http.Request) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	if err := license.Activate(r.Context(), jsonx.Str(body, "code")); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, license.Check())
}

// licenseGuard locks the whole API when there is no valid licence, and makes it read-only after the licence ran out.
func licenseGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if strings.HasPrefix(p, "/api/") && !strings.HasPrefix(p, "/api/license/") && p != "/api/health" && p != "/api/version" {
			s := license.Check()
			switch {
			case !s.Licensed:
				w.Header().Set("X-License", "none")
				httpx.Error(w, http.StatusForbidden, "این سامانه هنوز فعال نشده است؛ کد فعال‌سازی را وارد کنید.")
				return
			case s.ReadOnly && r.Method != http.MethodGet && r.Method != http.MethodHead && p != "/api/auth/login":
				w.Header().Set("X-License", "expired")
				httpx.Error(w, http.StatusForbidden, "مجوز این سامانه منقضی شده است؛ فعلاً فقط مشاهده ممکن است. برای تمدید با فروشنده تماس بگیرید.")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
