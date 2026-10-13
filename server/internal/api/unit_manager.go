package api

import (
	"context"

	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Unit managers. Every organisational unit (department) can have one manager («مدیر واحد», departments.data.managerId). What the people of the
// unit do in the automation comes to that manager: their leave requests are decided by the manager (the CEO only for units without one and for the
// managers themselves), their daily reports are copied to the manager, the manager sees and can edit the tasks of the unit's people, and sees the
// customers, opportunities and follow-ups they look after.

// managedStaff: the people who work in the units this person manages (not the manager).
func managedStaff(ctx context.Context, manager string) []string {
	out := []string{}
	if manager == "" || store.Pool == nil {
		return out
	}
	rows, err := store.Pool.Query(ctx,
		`SELECT u.id FROM users u JOIN departments d ON d.id = u.data->>'departmentId'
		 WHERE d.data->>'managerId' = $1 AND u.id <> $1 AND COALESCE(u.data->>'isActive', 'true') <> 'false'`, manager)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			out = append(out, id)
		}
	}
	return out
}

// unitManagerOf: the manager of the unit this person works in ("" when the unit has none, or when the person is the manager).
func unitManagerOf(ctx context.Context, userID string) string {
	var m string
	_ = store.Pool.QueryRow(ctx,
		`SELECT COALESCE(d.data->>'managerId', '') FROM users u JOIN departments d ON d.id = u.data->>'departmentId' WHERE u.id = $1`, userID).Scan(&m)
	if m == userID {
		return ""
	}
	return m
}

func isManagerOf(managed []string, userIDs ...string) bool {
	for _, u := range userIDs {
		if u != "" && jsonx.Contains(managed, u) {
			return true
		}
	}
	return false
}
