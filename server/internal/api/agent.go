package api

import (
	"context"

	"automation/server/internal/auth"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// A sales representative («نماینده فروش», user.isAgent) is an independent user: he sees himself, the people the administrator named for him
// (user.agentContactIds) and the managing director (the holder of the signature right), nobody else.

func agentAllowed(me auth.User, u jsonx.M) bool {
	id := jsonx.Str(u, "id")
	if id == me.ID() || jsonx.Bool(u, "canSignOfficialLetters") {
		return true
	}
	if jsonx.Str(u, "agentOwnerId") == me.ID() { // the agent's own employees (his subordinates)
		return true
	}
	if owner := me.AgentOwnerID(); owner != "" && (id == owner || jsonx.Str(u, "agentOwnerId") == owner) { // an employee sees his agent and the agent's other employees
		return true
	}
	for _, c := range me.AgentContactIDs() {
		if c == id {
			return true
		}
	}
	return false
}

// agentVisibleStaff keeps in the list of people only those a representative may see.
func agentVisibleStaff(me auth.User, staff []jsonx.M) []jsonx.M {
	out := make([]jsonx.M, 0, len(staff))
	for _, u := range staff {
		if agentAllowed(me, u) {
			out = append(out, u)
		}
	}
	return out
}

// agentMayReach: may this representative talk to that person?
func agentMayReach(ctx context.Context, me auth.User, id string) bool {
	var raw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM users WHERE id = $1`, id).Scan(&raw); err != nil {
		return false
	}
	u := jsonx.Decode(raw)
	u["id"] = id
	return agentAllowed(me, u)
}
