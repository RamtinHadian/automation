// Package api wires every HTTP endpoint of the server.
package api

import (
	"automation/server/internal/version"
	"encoding/json"
	"net/http"

	"automation/server/internal/auth"
	"automation/server/internal/config"
	"automation/server/internal/demo"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
)

func empty() []json.RawMessage { return []json.RawMessage{} }

func jsonRaw(b []byte) json.RawMessage { return json.RawMessage(b) }

// collectionHandler decides who may write or delete what in one stored collection.
// A collection without a delete function (settings, audit) cannot be deleted from.
type collectionHandler struct {
	put    func(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M)
	remove func(w http.ResponseWriter, r *http.Request, me auth.User, id string)
}

var collections = map[string]collectionHandler{
	"staff":       {put: putStaff, remove: removeStaff},
	"departments": {put: putDepartment, remove: removeDepartment},
	"settings":    {put: putSettings},
	"audit":       {put: putAudit},
	"reports":     {put: putReport, remove: removeReport},
	"customers":   {put: putCustomer, remove: removeCustomer},
	"deals":       {put: putDeal, remove: removeDeal},
	"activities":  {put: putActivity, remove: removeActivity},
	"tasks":       {put: putTask, remove: removeTask},
	"transfers":   {put: putTransfer, remove: removeTransfer},
}

// DemoMode limits what may change about users (set from the DEMO environment variable).
var DemoMode bool

// Router returns the HTTP handler for the whole server: the API and the built frontend.
func Router(cfg config.Config) http.Handler {
	DemoMode = cfg.Demo
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/auth/login", auth.Login)
	mux.HandleFunc("POST /api/auth/change-password", auth.Require(auth.ChangePassword))
	mux.HandleFunc("GET /api/state", auth.Require(state))
	mux.HandleFunc("GET /api/stats-data", auth.Require(statsData))
	mux.HandleFunc("GET /api/license/status", licenseStatus)
	mux.HandleFunc("GET /api/version", func(w http.ResponseWriter, _ *http.Request) { httpx.JSON(w, http.StatusOK, version.Current()) })
	mux.HandleFunc("POST /api/license/activate", licenseActivate)
	mux.HandleFunc("POST /api/license/renew", auth.Require(licenseRenew))
	mux.HandleFunc("GET /api/chat/conversations", auth.Require(chatConversations))
	mux.HandleFunc("GET /api/chat/messages", auth.Require(chatMessages))
	mux.HandleFunc("POST /api/chat/messages", auth.Require(chatSend))
	mux.HandleFunc("POST /api/chat/read", auth.Require(chatRead))
	mux.HandleFunc("GET /api/backups", auth.Require(listBackups))
	mux.HandleFunc("POST /api/backups", auth.Require(requestBackup))
	mux.HandleFunc("GET /api/backups/restore-status", restoreStatus)
	mux.HandleFunc("GET /api/backups/settings", auth.Require(backupGetSettings))
	mux.HandleFunc("PUT /api/backups/settings", auth.Require(backupPutSettings))
	mux.HandleFunc("POST /api/backups/net-test", auth.Require(backupNetTest))
	mux.HandleFunc("POST /api/backups/cloud-test", auth.Require(backupCloudTest))
	mux.HandleFunc("POST /api/backups/restore", auth.Require(backupRestore))
	mux.HandleFunc("POST /api/backups/browse", auth.Require(backupBrowse))
	mux.HandleFunc("GET /api/backups/browse", auth.Require(backupBrowseResult))
	mux.HandleFunc("POST /api/backups/upload", auth.Require(uploadBackup))
	mux.HandleFunc("GET /api/backups/{name}", auth.Require(downloadBackup))

	mux.HandleFunc("GET /api/notify/stream", auth.Require(notifyStream))
	mux.HandleFunc("GET /api/notifications", auth.Require(listNotifications))
	mux.HandleFunc("POST /api/notifications/read", auth.Require(markNotificationsRead))
	mux.HandleFunc("DELETE /api/notifications", auth.Require(clearNotifications))
	mux.HandleFunc("GET /api/push/key", auth.Require(pushKey))
	mux.HandleFunc("POST /api/push/subscribe", auth.Require(pushSubscribe))
	mux.HandleFunc("POST /api/push/unsubscribe", auth.Require(pushUnsubscribe))

	mux.HandleFunc("GET /api/signal/stream", auth.Require(signalStream))
	mux.HandleFunc("POST /api/signal/send", auth.Require(signalSend))

	mux.HandleFunc("GET /api/voip/status", auth.Require(voipStatus))
	mux.HandleFunc("GET /api/voip/log", auth.Require(voipLog))
	mux.HandleFunc("POST /api/voip/capture", auth.Require(voipCapture))
	mux.HandleFunc("POST /api/voip/test-popup", auth.Require(voipTestPopup))
	mux.HandleFunc("GET /api/announcements", auth.Require(announcementList))
	mux.HandleFunc("POST /api/announcements", auth.Require(announcementCreate))
	mux.HandleFunc("DELETE /api/announcements/{id}", auth.Require(announcementDelete))
	mux.HandleFunc("POST /api/announcements/{id}/pin", auth.Require(announcementPin))
	mux.HandleFunc("POST /api/leaves", auth.Require(leaveCreate))
	mux.HandleFunc("GET /api/leaves", auth.Require(leaveList))
	mux.HandleFunc("POST /api/leaves/{id}/decide", auth.Require(leaveDecide))
	mux.HandleFunc("DELETE /api/leaves/{id}", auth.Require(leaveCancel))
	mux.HandleFunc("GET /api/voip/calls", auth.Require(voipCalls))
	mux.HandleFunc("GET /api/voip/recording/{id}", auth.Require(voipRecording))
	mux.HandleFunc("GET /api/voip/recording-setup", auth.Require(voipRecordingSetup))
	mux.HandleFunc("PUT /api/voip/recordings/{id}", voipRecordingUpload)
	mux.HandleFunc("POST /api/voip/recordings/{id}", voipRecordingUpload)
	mux.HandleFunc("GET /api/sms/status", auth.Require(smsStatus))
	mux.HandleFunc("GET /api/sms/settings", auth.Require(smsGetSettings))
	mux.HandleFunc("PUT /api/sms/settings", auth.Require(smsPutSettings))
	mux.HandleFunc("GET /api/sms/balance", auth.Require(smsBalance))
	mux.HandleFunc("GET /api/sms/log", auth.Require(smsLog))
	mux.HandleFunc("POST /api/sms/test", auth.Require(smsTest))
	mux.HandleFunc("POST /api/sms/send", auth.Require(smsSend))
	mux.HandleFunc("GET /api/admin/files/info", auth.Require(adminFileInfo))
	mux.HandleFunc("GET /api/admin/netwatch", auth.Require(netWatchInfo))
	mux.HandleFunc("GET /api/warranty", auth.Require(warrantyList))
	mux.HandleFunc("PUT /api/warranty/settings", auth.Require(warrantySaveSettings))
	mux.HandleFunc("PUT /api/warranty/items/{id}", auth.Require(warrantyPut))
	mux.HandleFunc("POST /api/warranty/items/{id}/void", auth.Require(warrantyVoid))
	mux.HandleFunc("POST /api/warranty/claims", auth.Require(claimCreate))
	mux.HandleFunc("POST /api/warranty/claims/{id}/status", auth.Require(claimStatus))
	mux.HandleFunc("POST /api/warranty/claims/{id}/note", auth.Require(claimNote))
	mux.HandleFunc("POST /api/warranty/claims/{id}/assign", auth.Require(claimAssign))
	mux.HandleFunc("GET /api/support", auth.Require(supportList))
	mux.HandleFunc("GET /api/support/settings", auth.Require(supportGetSettings))
	mux.HandleFunc("PUT /api/support/settings", auth.Require(supportSaveSettings))
	mux.HandleFunc("POST /api/support/ai-test", auth.Require(supportAiTest))
	mux.HandleFunc("GET /api/portal/info", portalInfo)
	mux.HandleFunc("POST /api/portal/login", portalLogin)
	mux.HandleFunc("GET /api/portal/me", portalMe)
	mux.HandleFunc("POST /api/portal/tickets", portalTicketCreate)
	mux.HandleFunc("POST /api/portal/tickets/{id}/message", portalTicketMessage)
	mux.HandleFunc("PUT /api/support/plans/{id}", auth.Require(supportPlanPut))
	mux.HandleFunc("PUT /api/support/subs/{id}", auth.Require(supportSubPut))
	mux.HandleFunc("POST /api/support/subs/{id}/cancel", auth.Require(supportSubCancel))
	mux.HandleFunc("POST /api/support/tickets", auth.Require(ticketCreate))
	mux.HandleFunc("POST /api/support/tickets/{id}/status", auth.Require(ticketStatus))
	mux.HandleFunc("POST /api/support/tickets/{id}/note", auth.Require(ticketNote))
	mux.HandleFunc("POST /api/support/tickets/{id}/assign", auth.Require(ticketAssign))
	mux.HandleFunc("POST /api/admin/files/{id}/purge", auth.Require(adminFilePurge))
	mux.HandleFunc("POST /api/admin/files/{id}/keep", auth.Require(adminFileKeep))
	mux.HandleFunc("PUT /api/files/{id}", auth.Require(uploadFile))
	mux.HandleFunc("GET /api/files/{id}", auth.Require(downloadFile))
	mux.HandleFunc("HEAD /api/files/{id}", auth.Require(fileInfo))
	mux.HandleFunc("GET /api/sounds", auth.Require(listSounds))
	mux.HandleFunc("GET /api/sounds/{id}", auth.Require(getSound))
	mux.HandleFunc("POST /api/sounds", auth.Require(uploadSound))
	mux.HandleFunc("DELETE /api/sounds/{id}", auth.Require(deleteSound))
	mux.HandleFunc("POST /api/notify/test", auth.Require(notifyTest))
	mux.HandleFunc("GET /api/msgr/status", auth.Require(msgrStatus))
	mux.HandleFunc("GET /api/msgr/settings", auth.Require(msgrGetSettings))
	mux.HandleFunc("PUT /api/msgr/settings", auth.Require(msgrPutSettings))
	mux.HandleFunc("POST /api/msgr/check", auth.Require(msgrCheck))
	mux.HandleFunc("GET /api/msgr/link", auth.Require(msgrLink))
	mux.HandleFunc("POST /api/msgr/send", auth.Require(msgrSendFile))
	mux.HandleFunc("GET /api/voip/stats", auth.Require(voipStats))
	mux.HandleFunc("POST /api/voip/call", auth.Require(voipCall))

	mux.HandleFunc("GET /api/config", iceConfig(cfg))
	mux.HandleFunc("GET /api/health", health)
	mux.HandleFunc("GET /api/demo/info", demo.Info(cfg.Demo, cfg.DemoResetHours))

	// Generic collection routes: PUT saves a document, DELETE removes it.
	mux.HandleFunc("PUT /api/{collection}/{id}", auth.Require(func(w http.ResponseWriter, r *http.Request) {
		h, ok := collections[r.PathValue("collection")]
		if !ok {
			httpx.Error(w, http.StatusNotFound, "not found")
			return
		}
		body, ok := httpx.ReadBody(w, r)
		if !ok {
			return
		}
		data, isObject := body["data"].(map[string]any)
		if !isObject {
			httpx.Error(w, http.StatusBadRequest, "data required")
			return
		}
		h.put(w, r, auth.Current(r), r.PathValue("id"), data)
	}))
	mux.HandleFunc("DELETE /api/{collection}/{id}", auth.Require(func(w http.ResponseWriter, r *http.Request) {
		h, ok := collections[r.PathValue("collection")]
		if !ok {
			httpx.Error(w, http.StatusNotFound, "not found")
			return
		}
		if h.remove == nil {
			httpx.Forbidden(w)
			return
		}
		h.remove(w, r, auth.Current(r), r.PathValue("id"))
	}))

	mux.Handle("/api/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		httpx.Error(w, http.StatusNotFound, "not found")
	}))
	mux.Handle("/", frontend(cfg.StaticDir))
	if cfg.Demo {
		return restoreGuard(licenseGuard(demo.Guard(mux)))
	}
	return restoreGuard(licenseGuard(mux))
}
