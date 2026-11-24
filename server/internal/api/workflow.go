package api

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
	"automation/server/internal/workflow"
)

// Workflows («گردشکار»). A customer's own workflow is a signed package file we write for them (see internal/workflow and cmd/wfpack). The administrator
// uploads it in the console, switches it on or off and can remove it; nobody but us can change what is inside (the signature would break). A package that
// is on shows up next to the built-in flows (leave, letters, proforma approval…) which are never touched. Switching a package off only stops NEW
// requests: the ones running finish normally. A package with running requests cannot be removed.

type wfResolver struct{ ctx context.Context }

func (r wfResolver) ids(q string, args ...any) []string {
	rows, err := store.Pool.Query(r.ctx, q, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil && id != "" {
			out = append(out, id)
		}
	}
	return out
}

const wfActive = ` AND COALESCE(u.data->>'isActive', 'true') <> 'false'`

func (r wfResolver) ceo() []string {
	return r.ids(`SELECT u.id FROM users u WHERE u.data->>'canSignOfficialLetters' = 'true'` + wfActive)
}

func (r wfResolver) Resolve(refs []workflow.Ref, st *workflow.State) []string {
	var out []string
	for _, f := range refs {
		switch f.Kind {
		case "starter":
			out = append(out, st.StarterID)
		case "starterManager":
			if m := unitManagerOf(r.ctx, st.StarterID); m != "" {
				out = append(out, m)
			} else {
				out = append(out, r.ceo()...)
			}
		case "ceo":
			out = append(out, r.ceo()...)
		case "admin":
			out = append(out, r.ids(`SELECT u.id FROM users u WHERE u.data->>'role' = 'SUPER_ADMIN'`+wfActive)...)
		case "user":
			out = append(out, r.ids(`SELECT u.id FROM users u WHERE (lower(u.email) = lower($1) OR u.id = $1 OR lower(u.data->>'fullName') = lower($1))`+wfActive+` LIMIT 1`, strings.TrimSpace(f.Ref))...)
		case "unit":
			out = append(out, r.ids(`SELECT COALESCE(d.data->>'managerId', '') FROM departments d WHERE d.data->>'name' = $1`, strings.TrimSpace(f.Ref))...)
		case "unitMembers":
			out = append(out, r.ids(`SELECT u.id FROM users u JOIN departments d ON d.id = u.data->>'departmentId' WHERE d.data->>'name' = $1`+wfActive, strings.TrimSpace(f.Ref))...)
		case "field":
			if s, ok := st.Values[f.Ref].(string); ok && s != "" {
				out = append(out, r.ids(`SELECT u.id FROM users u WHERE u.id = $1`+wfActive, s)...)
			}
		}
	}
	return out
}

// ---------- the packages (administrator) ----------

type wfRow struct {
	ID, Name, KeyID, UploadedBy, Source string
	Version                     int
	Enabled                     bool
	UploadedAt                  time.Time
	Data                        []byte
}

func wfPackageJSON(row wfRow, running int) jsonx.M {
	var p map[string]any
	_ = json.Unmarshal(row.Data, &p)
	delete(p, "signature")
	return jsonx.M{"id": row.ID, "version": row.Version, "name": row.Name, "enabled": row.Enabled, "keyId": row.KeyID, "source": row.Source, "uploadedAt": row.UploadedAt, "uploadedBy": row.UploadedBy, "running": running, "package": p}
}

// GET /api/workflow/packages (administrators)
func wfPackages(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	rows, err := store.Pool.Query(r.Context(), `SELECT p.id, p.version, p.name, p.key_id, p.uploaded_by, p.enabled, p.uploaded_at, p.data, p.source,
		(SELECT count(*) FROM wf_instances i WHERE i.package_id = p.id AND i.package_version = p.version AND i.status = 'running')
		FROM wf_packages p ORDER BY p.uploaded_at DESC`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var x wfRow
		var running int
		if rows.Scan(&x.ID, &x.Version, &x.Name, &x.KeyID, &x.UploadedBy, &x.Enabled, &x.UploadedAt, &x.Data, &x.Source, &running) == nil {
			out = append(out, wfPackageJSON(x, running))
		}
	}
	httpx.JSON(w, http.StatusOK, out)
}

// POST /api/workflow/packages {file: "<the text of the signed file>"}
func wfUpload(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	raw := []byte(jsonx.Str(body, "file"))
	if len(raw) == 0 || len(raw) > 512*1024 {
		httpx.Error(w, http.StatusBadRequest, "فایل گردشکار خالی است یا بیش از حد بزرگ است.")
		return
	}
	keyID, err := workflow.Verify(raw, workflow.TrustedKeys)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	p, err := workflow.Parse(raw)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	var mine int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM wf_packages WHERE id = $1 AND source = 'local'`, p.ID).Scan(&mine)
	if mine > 0 {
		httpx.Error(w, http.StatusConflict, "گردشکاری که خودتان ساخته‌اید همین شناسه را دارد؛ اول آن را حذف کنید یا شناسهٔ دیگری بگیرید.")
		return
	}
	var data any
	_ = json.Unmarshal(raw, &data)
	tag, err := store.Pool.Exec(r.Context(), `INSERT INTO wf_packages (id, version, name, data, key_id, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
		p.ID, p.Version, p.Name, data, keyID, me.Name())
	if err != nil {
		internalError(w)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusConflict, "این نسخه از این گردشکار قبلاً بارگذاری شده است؛ برای تغییر، نسخهٔ جدیدی از ما بگیرید.")
		return
	}
	httpx.JSON(w, http.StatusOK, jsonx.M{"ok": true, "id": p.ID, "version": p.Version, "name": p.Name, "steps": len(p.Steps)})
}

// POST /api/workflow/packages/{id}/{version}/enable {enabled}: one version of a package is on at a time.
func wfEnable(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	on := jsonx.Bool(body, "enabled")
	id, ver := r.PathValue("id"), r.PathValue("version")
	tx, err := store.Pool.Begin(r.Context())
	if err != nil {
		internalError(w)
		return
	}
	defer tx.Rollback(r.Context())
	if on {
		_, err = tx.Exec(r.Context(), `UPDATE wf_packages SET enabled = (version = $2::int) WHERE id = $1`, id, ver)
	} else {
		_, err = tx.Exec(r.Context(), `UPDATE wf_packages SET enabled = false WHERE id = $1 AND version = $2::int`, id, ver)
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// DELETE /api/workflow/packages/{id}/{version}
func wfRemove(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	id, ver := r.PathValue("id"), r.PathValue("version")
	var running int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM wf_instances WHERE package_id = $1 AND package_version = $2::int AND status = 'running'`, id, ver).Scan(&running)
	if running > 0 {
		httpx.Error(w, http.StatusConflict, "این گردشکار درخواست در جریان دارد. اول آن را خاموش کنید تا درخواست تازه نگیرد، و بعد از تمام شدن درخواست‌ها حذفش کنید.")
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM wf_packages WHERE id = $1 AND version = $2::int`, id, ver)
	httpx.OK(w)
}

// ---------- starting and working ----------

func wfLoadPackage(ctx context.Context, id string, version int) (*workflow.Package, bool, error) {
	var raw []byte
	var enabled bool
	err := store.Pool.QueryRow(ctx, `SELECT data, enabled FROM wf_packages WHERE id = $1 AND version = $2`, id, version).Scan(&raw, &enabled)
	if err != nil {
		return nil, false, err
	}
	p, err := workflow.Parse(raw)
	return p, enabled, err
}

// may this person start this package (the «start.allow» of the file)?
func wfMayStart(ctx context.Context, p *workflow.Package, me auth.User) bool {
	if len(p.Start.Allow) == 0 {
		return true
	}
	st := &workflow.State{StarterID: me.ID(), Values: map[string]any{}}
	res := wfResolver{ctx}
	for _, a := range p.Start.Allow {
		if a.Kind == "everyone" {
			return true
		}
		if jsonx.Contains(res.Resolve([]workflow.Ref{a}, st), me.ID()) {
			return true
		}
		if a.Kind == "unit" { // «unit» in the list of who may start means the people of the unit too
			if jsonx.Contains(res.Resolve([]workflow.Ref{{Kind: "unitMembers", Ref: a.Ref}}, st), me.ID()) {
				return true
			}
		}
	}
	return false
}

// GET /api/workflow/startable: the packages that are on and this person may start, with their forms.
func wfStartable(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	rows, err := store.Pool.Query(r.Context(), `SELECT data FROM wf_packages WHERE enabled ORDER BY name`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var raw []byte
		if rows.Scan(&raw) != nil {
			continue
		}
		p, err := workflow.Parse(raw)
		if err != nil || !wfMayStart(r.Context(), p, me) {
			continue
		}
		out = append(out, jsonx.M{"id": p.ID, "version": p.Version, "name": p.Name, "description": p.Description, "fields": p.Fields})
	}
	httpx.JSON(w, http.StatusOK, out)
}

type wfInst struct {
	ID, PackageID, PackageName, Title, StartedBy, Status string
	Version                                              int
	StartedAt                                            time.Time
	State                                                workflow.State
	FinishedAt                                           *time.Time
}

const wfCols = `id, package_id, package_version, package_name, title, started_by, started_at, status, state, finished_at`

func wfScan(row pgx.Row) (*wfInst, error) {
	var i wfInst
	var raw []byte
	if err := row.Scan(&i.ID, &i.PackageID, &i.Version, &i.PackageName, &i.Title, &i.StartedBy, &i.StartedAt, &i.Status, &raw, &i.FinishedAt); err != nil {
		return nil, err
	}
	_ = json.Unmarshal(raw, &i.State)
	return &i, nil
}

func wfNames(ctx context.Context, ids ...string) map[string]string {
	out := map[string]string{}
	for _, id := range ids {
		if id == "" || out[id] != "" {
			continue
		}
		var n string
		_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'fullName', '') FROM users WHERE id = $1`, id).Scan(&n)
		out[id] = n
	}
	return out
}

// the saved copy of an instance: its row columns follow the state
func wfWrite(ctx context.Context, i *wfInst, resetReminder bool) error {
	raw, _ := json.Marshal(i.State)
	waiting := i.State.Waiting
	if waiting == nil {
		waiting = []string{}
	}
	var fin any
	if i.State.Status != "running" {
		now := time.Now()
		fin = now
	}
	reminded := ""
	if resetReminder {
		reminded = ", reminded = false"
	}
	_, err := store.Pool.Exec(ctx, `UPDATE wf_instances SET status = $2, state = $3, waiting = $4, due_at = $5, finished_at = $6`+reminded+` WHERE id = $1`,
		i.ID, i.State.Status, raw, waiting, i.State.DueAt, fin)
	return err
}

func wfNotify(ctx context.Context, instID string, fx []workflow.Effect, except string) {
	for _, e := range fx {
		notify.Notify(ctx, e.Users, notify.Note{Kind: "task", Label: "گردشکار", Title: e.Title, Body: e.Body, Ref: ref("workflow", instID), Repeat: true}, except)
	}
}

// POST /api/workflow/start {id, values}
func wfStart(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	var raw []byte
	err := store.Pool.QueryRow(r.Context(), `SELECT data FROM wf_packages WHERE id = $1 AND enabled`, jsonx.Str(body, "id")).Scan(&raw)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "این گردشکار فعال نیست.")
		return
	}
	p, err := workflow.Parse(raw)
	if err != nil {
		internalError(w)
		return
	}
	if !wfMayStart(r.Context(), p, me) {
		httpx.Error(w, http.StatusForbidden, "شروع این گردشکار به شما اجازه داده نشده است.")
		return
	}
	in, _ := body["values"].(map[string]any)
	values, err := p.CheckValues(in)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	names := map[string]string{}
	for _, f := range p.Fields {
		if f.Type != "person" {
			continue
		}
		if id, _ := values[f.Key].(string); id != "" {
			n := wfNames(r.Context(), id)[id]
			if n == "" {
				httpx.Error(w, http.StatusBadRequest, "«"+f.Label+"»: این فرد پیدا نشد.")
				return
			}
			names[f.Key] = n
		}
	}
	now := time.Now()
	st, fx, err := workflow.Begin(p, me.ID(), me.Name(), values, wfResolver{r.Context()}, now)
	if err != nil {
		httpx.Error(w, http.StatusUnprocessableEntity, err.Error())
		return
	}
	id := "wf-" + randHex(6)
	title := workflow.Title(p, values, names)
	stRaw, _ := json.Marshal(st)
	if st.Waiting == nil {
		st.Waiting = []string{}
	}
	_, err = store.Pool.Exec(r.Context(), `INSERT INTO wf_instances (id, package_id, package_version, package_name, title, started_by, status, state, waiting, due_at, finished_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		id, p.ID, p.Version, p.Name, title, me.ID(), st.Status, stRaw, st.Waiting, st.DueAt, wfFinished(st))
	if err != nil {
		internalError(w)
		return
	}
	wfNotify(r.Context(), id, fx, me.ID())
	httpx.JSON(w, http.StatusOK, jsonx.M{"ok": true, "id": id})
}

func wfFinished(st *workflow.State) any {
	if st.Status == "running" {
		return nil
	}
	return time.Now()
}

// the view of one instance for the browser
func wfView(ctx context.Context, i *wfInst, me auth.User) jsonx.M {
	var p *workflow.Package
	if pk, _, err := wfLoadPackage(ctx, i.PackageID, i.Version); err == nil {
		p = pk
	}
	ids := append([]string{i.StartedBy}, i.State.Waiting...)
	for _, e := range i.State.History {
		ids = append(ids, e.By)
	}
	names := wfNames(ctx, ids...)
	hist := []jsonx.M{}
	for _, e := range i.State.History {
		by := e.ByName
		if by == "" {
			by = names[e.By]
		}
		hist = append(hist, jsonx.M{"at": e.At, "step": e.Step, "stepName": e.StepName, "type": e.Type, "action": e.Action, "by": by, "comment": e.Comment, "note": e.Note})
	}
	waiting := []jsonx.M{}
	for _, u := range i.State.Waiting {
		waiting = append(waiting, jsonx.M{"id": u, "name": names[u]})
	}
	fields := []jsonx.M{}
	stepName, stepType := "", ""
	var steps []jsonx.M
	if p != nil {
		for _, f := range p.Fields {
			v, ok := i.State.Values[f.Key]
			if !ok {
				continue
			}
			shown := workflow.Render("{{"+f.Key+"}}", i.State.Values, nil)
			if f.Type == "person" {
				if id, _ := v.(string); id != "" {
					shown = wfNames(ctx, id)[id]
				}
			}
			fields = append(fields, jsonx.M{"label": f.Label, "value": shown, "type": f.Type})
		}
		if s := p.Step(i.State.Current); s != nil && i.State.Status == "running" {
			stepName, stepType = s.Name, s.Type
			if stepName == "" {
				stepName = s.ID
			}
		}
		for _, s := range p.Steps {
			steps = append(steps, jsonx.M{"id": s.ID, "name": s.Name, "type": s.Type})
		}
	}
	mineNow := i.State.Status == "running" && jsonx.Contains(i.State.Waiting, me.ID())
	actions := []string{}
	if mineNow || (i.State.Status == "running" && me.IsAdmin() && stepType != "") {
		if stepType == "approval" {
			actions = []string{"approve", "reject"}
		} else if stepType == "task" {
			actions = []string{"complete"}
		}
	}
	return jsonx.M{
		"id": i.ID, "packageId": i.PackageID, "packageName": i.PackageName, "title": i.Title, "status": i.State.Status, "startedBy": i.StartedBy, "startedByName": names[i.StartedBy],
		"startedAt": i.StartedAt, "finishedAt": i.FinishedAt, "step": i.State.Current, "stepName": stepName, "stepType": stepType, "waiting": waiting, "dueAt": i.State.DueAt,
		"fields": fields, "history": hist, "steps": steps, "mine": mineNow, "actions": actions, "canCancel": i.State.Status == "running" && (i.StartedBy == me.ID() || me.IsAdmin()),
	}
}

func wfList(w http.ResponseWriter, r *http.Request, where string, args ...any) {
	me := auth.Current(r)
	rows, err := store.Pool.Query(r.Context(), `SELECT `+wfCols+` FROM wf_instances WHERE `+where+` ORDER BY started_at DESC LIMIT 300`, args...)
	if err != nil {
		internalError(w)
		return
	}
	var list []*wfInst
	for rows.Next() {
		if i, err := wfScan(rows); err == nil {
			list = append(list, i)
		}
	}
	rows.Close()
	out := []jsonx.M{}
	for _, i := range list {
		out = append(out, wfView(r.Context(), i, me))
	}
	httpx.JSON(w, http.StatusOK, out)
}

// GET /api/workflow/inbox: what waits for me
func wfInbox(w http.ResponseWriter, r *http.Request) {
	wfList(w, r, `status = 'running' AND $1 = ANY(waiting)`, auth.Current(r).ID())
}

// GET /api/workflow/mine: what I started
func wfMine(w http.ResponseWriter, r *http.Request) {
	wfList(w, r, `started_by = $1`, auth.Current(r).ID())
}

// GET /api/workflow/all (administrators)
func wfAll(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	wfList(w, r, `true`)
}

// POST /api/workflow/instances/{id}/act {action, comment}
func wfAct(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	tx, err := store.Pool.Begin(r.Context())
	if err != nil {
		internalError(w)
		return
	}
	defer tx.Rollback(r.Context())
	i, err := wfScan(tx.QueryRow(r.Context(), `SELECT `+wfCols+` FROM wf_instances WHERE id = $1 FOR UPDATE`, id))
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "درخواست پیدا نشد.")
		return
	}
	p, _, err := wfLoadPackage(r.Context(), i.PackageID, i.Version)
	if err != nil {
		httpx.Error(w, http.StatusConflict, "فایل این گردشکار دیگر در سامانه نیست.")
		return
	}
	waiting := jsonx.Contains(i.State.Waiting, me.ID())
	fx, err := workflow.Act(p, &i.State, me.ID(), me.Name(), jsonx.Str(body, "action"), jsonx.Str(body, "comment"), me.IsAdmin() && !waiting, wfResolver{r.Context()}, time.Now())
	if err != nil {
		code := http.StatusBadRequest
		if strings.Contains(err.Error(), "نوبت") {
			code = http.StatusForbidden
		}
		httpx.Error(w, code, err.Error())
		return
	}
	raw, _ := json.Marshal(i.State)
	wl := i.State.Waiting
	if wl == nil {
		wl = []string{}
	}
	if _, err := tx.Exec(r.Context(), `UPDATE wf_instances SET status = $2, state = $3, waiting = $4, due_at = $5, finished_at = $6, reminded = false WHERE id = $1`,
		id, i.State.Status, raw, wl, i.State.DueAt, wfFinished(&i.State)); err != nil || tx.Commit(r.Context()) != nil {
		internalError(w)
		return
	}
	wfNotify(r.Context(), id, fx, me.ID())
	httpx.JSON(w, http.StatusOK, wfView(r.Context(), i, me))
}

// POST /api/workflow/instances/{id}/cancel {reason}
func wfCancel(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	i, err := wfScan(store.Pool.QueryRow(r.Context(), `SELECT `+wfCols+` FROM wf_instances WHERE id = $1`, r.PathValue("id")))
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "درخواست پیدا نشد.")
		return
	}
	if i.StartedBy != me.ID() && !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	waitingBefore := append([]string{}, i.State.Waiting...)
	if err := workflow.Cancel(&i.State, me.ID(), me.Name(), strings.TrimSpace(jsonx.Str(body, "reason")), time.Now()); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := wfWrite(r.Context(), i, true); err != nil {
		internalError(w)
		return
	}
	wfNotify(r.Context(), i.ID, []workflow.Effect{{Users: waitingBefore, Title: i.PackageName, Body: i.Title + " — لغو شد"}}, me.ID())
	httpx.OK(w)
}

// RunWorkflowReminders: every ten minutes, the steps whose time is over are announced (once) to the people waiting and to the starter,
// and the people named in the step's «escalate» are told too and may act.
func RunWorkflowReminders(ctx context.Context) {
	tick := time.NewTicker(10 * time.Minute)
	defer tick.Stop()
	for {
		wfRemind(ctx)
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func wfRemind(ctx context.Context) {
	if store.Pool == nil {
		return
	}
	rows, err := store.Pool.Query(ctx, `SELECT `+wfCols+` FROM wf_instances WHERE status = 'running' AND NOT reminded AND due_at IS NOT NULL AND due_at < now()`)
	if err != nil {
		return
	}
	var list []*wfInst
	for rows.Next() {
		if i, err := wfScan(rows); err == nil {
			list = append(list, i)
		}
	}
	rows.Close()
	for _, i := range list {
		p, _, err := wfLoadPackage(ctx, i.PackageID, i.Version)
		if err != nil {
			continue
		}
		added := workflow.Escalate(p, &i.State, wfResolver{ctx})
		name := i.State.Current
		if s := p.Step(i.State.Current); s != nil && s.Name != "" {
			name = s.Name
		}
		i.State.History = append(i.State.History, workflow.Event{At: time.Now(), Step: i.State.Current, StepName: name, Type: "reminder", Action: "auto", Note: "مهلت مرحله گذشت"})
		if err := wfWrite(ctx, i, false); err != nil {
			continue
		}
		_, _ = store.Pool.Exec(ctx, `UPDATE wf_instances SET reminded = true WHERE id = $1`, i.ID)
		who := append(append([]string{}, i.State.Waiting...), i.StartedBy)
		_ = added
		wfNotify(ctx, i.ID, []workflow.Effect{{Users: who, Title: i.PackageName + " — مهلت گذشت", Body: i.Title + " — مرحلهٔ «" + name + "» هنوز تمام نشده است"}}, "")
	}
}

// ---------- built inside Hoormand ----------

// The administrator of a company can build a workflow in the app (no signature: it is «ساختهٔ مدیر سامانه»); we can build and sign one on our own server,
// which is the only place that holds the signing key (environment WORKFLOW_SIGNING_KEY). A customer's server has no key, so it can never sign.
func wfSigningKey() ed25519.PrivateKey {
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(os.Getenv("WORKFLOW_SIGNING_KEY")))
	if err != nil || len(raw) != ed25519.PrivateKeySize {
		return nil
	}
	return ed25519.PrivateKey(raw)
}

// GET /api/workflow/studio: what the builder may do here.
func wfStudioInfo(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	httpx.JSON(w, http.StatusOK, jsonx.M{"canSign": wfSigningKey() != nil})
}

// POST /api/workflow/check {package}: is it complete and right? (the builder asks while the person works)
func wfCheck(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	raw, _ := json.Marshal(body["package"])
	p, err := workflow.Parse(raw)
	if err != nil {
		httpx.JSON(w, http.StatusOK, jsonx.M{"ok": false, "error": err.Error()})
		return
	}
	httpx.JSON(w, http.StatusOK, jsonx.M{"ok": true, "steps": len(p.Steps)})
}

// POST /api/workflow/local {package, enable}: saves a workflow built here. Every save is a new version (the requests running on the old one finish on it).
func wfLocalSave(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	pkg, _ := body["package"].(map[string]any)
	if pkg == nil {
		httpx.Error(w, http.StatusBadRequest, "گردشکار خالی است.")
		return
	}
	delete(pkg, "signature")
	id, _ := pkg["id"].(string)
	var signedHere int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM wf_packages WHERE id = $1 AND source = 'signed'`, id).Scan(&signedHere)
	if signedHere > 0 {
		httpx.Error(w, http.StatusConflict, "این شناسه برای یک گردشکار امضاشدهٔ هورمند است و عوض نمی‌شود؛ شناسهٔ دیگری بگذارید.")
		return
	}
	var last int
	var wasOn bool
	_ = store.Pool.QueryRow(r.Context(), `SELECT COALESCE(max(version), 0) FROM wf_packages WHERE id = $1`, id).Scan(&last)
	_ = store.Pool.QueryRow(r.Context(), `SELECT COALESCE(bool_or(enabled), false) FROM wf_packages WHERE id = $1`, id).Scan(&wasOn)
	pkg["version"] = last + 1
	raw, _ := json.Marshal(pkg)
	p, err := workflow.Parse(raw)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	on := wasOn || jsonx.Bool(body, "enable")
	tx, err := store.Pool.Begin(r.Context())
	if err != nil {
		internalError(w)
		return
	}
	defer tx.Rollback(r.Context())
	if on {
		_, _ = tx.Exec(r.Context(), `UPDATE wf_packages SET enabled = false WHERE id = $1`, p.ID)
	}
	if _, err := tx.Exec(r.Context(), `INSERT INTO wf_packages (id, version, name, data, enabled, key_id, uploaded_by, source) VALUES ($1, $2, $3, $4, $5, '', $6, 'local')`,
		p.ID, p.Version, p.Name, pkg, on, me.Name()); err != nil {
		internalError(w)
		return
	}
	// the older versions nobody is using any more go away, so the list does not fill up
	_, _ = tx.Exec(r.Context(), `DELETE FROM wf_packages p WHERE p.id = $1 AND p.version < $2 AND p.source = 'local'
		AND NOT EXISTS (SELECT 1 FROM wf_instances i WHERE i.package_id = p.id AND i.package_version = p.version AND i.status = 'running')`, p.ID, p.Version)
	if tx.Commit(r.Context()) != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, jsonx.M{"ok": true, "id": p.ID, "version": p.Version, "enabled": on})
}

// POST /api/workflow/sign {package}: only on our own server (the one with the key). Returns the signed file's text.
func wfSign(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	key := wfSigningKey()
	if key == nil {
		httpx.Error(w, http.StatusForbidden, "امضا فقط روی سرور هورمند ممکن است. برای دریافت فایل امضاشده با ما تماس بگیرید.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	raw, _ := json.Marshal(body["package"])
	if _, err := workflow.Parse(raw); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	signed, err := workflow.Sign(raw, "hoormand-1", key)
	if err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, jsonx.M{"ok": true, "file": string(signed)})
}
