// Package store owns the PostgreSQL connection, the schema and the first-start seed.
package store

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"automation/server/internal/config"
	"automation/server/internal/jsonx"
)

// Pool is the shared connection pool.
var Pool *pgxpool.Pool

// Every statement is idempotent, so the same schema runs safely on each start (and on the database the
// previous Node.js server created).
var schema = []string{
	`CREATE TABLE IF NOT EXISTS users (
	  id TEXT PRIMARY KEY,
	  email TEXT NOT NULL,
	  password_hash TEXT NOT NULL,
	  data JSONB NOT NULL,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email))`,
	`CREATE TABLE IF NOT EXISTS departments (
	  id TEXT PRIMARY KEY,
	  data JSONB NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS transfers (
	  id TEXT PRIMARY KEY,
	  sender_id TEXT,
	  recipient_ids TEXT[] NOT NULL DEFAULT '{}',
	  data JSONB NOT NULL,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS transfers_sender_idx ON transfers (sender_id)`,
	`CREATE INDEX IF NOT EXISTS transfers_recipients_idx ON transfers USING GIN (recipient_ids)`,
	// A recipient "deleting" a received item only hides it from their own list.
	`CREATE TABLE IF NOT EXISTS transfer_hidden (
	  transfer_id TEXT NOT NULL,
	  user_id TEXT NOT NULL,
	  PRIMARY KEY (transfer_id, user_id)
	)`,
	`CREATE TABLE IF NOT EXISTS audit_logs (
	  id TEXT PRIMARY KEY,
	  data JSONB NOT NULL,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC)`,
	// one-to-one chat: one tick = sent, two green ticks = read (read_at)
	`CREATE TABLE IF NOT EXISTS chat_messages (
	  id TEXT PRIMARY KEY,
	  sender_id TEXT NOT NULL,
	  recipient_id TEXT NOT NULL,
	  text TEXT NOT NULL,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  read_at TIMESTAMPTZ
	)`,
	`CREATE INDEX IF NOT EXISTS chat_pair_idx ON chat_messages (sender_id, recipient_id, created_at)`,
	`CREATE INDEX IF NOT EXISTS chat_unread_idx ON chat_messages (recipient_id) WHERE read_at IS NULL`,
	// Changes of the CEO («مدیرعامل») are permanent: the database itself refuses to edit or delete those log lines.
	`CREATE OR REPLACE FUNCTION protect_ceo_log() RETURNS trigger AS $$
	BEGIN
	  IF OLD.data->>'action' = 'CEO_CHANGE' THEN RAISE EXCEPTION 'the CEO change log is permanent'; END IF;
	  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	  RETURN NEW;
	END $$ LANGUAGE plpgsql`,
	`DROP TRIGGER IF EXISTS audit_logs_protect ON audit_logs`,
	`CREATE TRIGGER audit_logs_protect BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION protect_ceo_log()`,
	`CREATE TABLE IF NOT EXISTS tasks (
	  id TEXT PRIMARY KEY,
	  creator_id TEXT,
	  assignee_ids TEXT[] NOT NULL DEFAULT '{}',
	  data JSONB NOT NULL,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS tasks_creator_idx ON tasks (creator_id)`,
	`CREATE INDEX IF NOT EXISTS tasks_assignees_idx ON tasks USING GIN (assignee_ids)`,
	`CREATE TABLE IF NOT EXISTS notifications (
	  id TEXT PRIMARY KEY,
	  user_id TEXT NOT NULL,
	  data JSONB NOT NULL,
	  read BOOLEAN NOT NULL DEFAULT false,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC)`,
	`CREATE TABLE IF NOT EXISTS push_subscriptions (
	  endpoint TEXT PRIMARY KEY,
	  user_id TEXT NOT NULL,
	  data JSONB NOT NULL,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id)`,
	`CREATE TABLE IF NOT EXISTS announcements (
	  id TEXT PRIMARY KEY,
	  pinned BOOLEAN NOT NULL DEFAULT false,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  data JSONB NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS warranties (
	  id TEXT PRIMARY KEY,
	  customer_id TEXT NOT NULL DEFAULT '',
	  serial TEXT NOT NULL DEFAULT '',
	  status TEXT NOT NULL DEFAULT 'ACTIVE',
	  year INT NOT NULL DEFAULT 0,
	  seq INT NOT NULL DEFAULT 0,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  data JSONB NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS warranties_customer_idx ON warranties (customer_id)`,
	`CREATE TABLE IF NOT EXISTS warranty_claims (
	  id TEXT PRIMARY KEY,
	  warranty_id TEXT NOT NULL DEFAULT '',
	  status TEXT NOT NULL DEFAULT 'RECEIVED',
	  year INT NOT NULL DEFAULT 0,
	  seq INT NOT NULL DEFAULT 0,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  data JSONB NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS warranty_claims_warranty_idx ON warranty_claims (warranty_id)`,
	`CREATE TABLE IF NOT EXISTS support_plans (
	  id TEXT PRIMARY KEY,
	  sort INT NOT NULL DEFAULT 0,
	  active BOOLEAN NOT NULL DEFAULT true,
	  data JSONB NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS support_subs (
	  id TEXT PRIMARY KEY,
	  customer_id TEXT NOT NULL DEFAULT '',
	  status TEXT NOT NULL DEFAULT 'ACTIVE',
	  year INT NOT NULL DEFAULT 0,
	  seq INT NOT NULL DEFAULT 0,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  data JSONB NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS support_subs_customer_idx ON support_subs (customer_id)`,
	`CREATE TABLE IF NOT EXISTS support_tickets (
	  id TEXT PRIMARY KEY,
	  sub_id TEXT NOT NULL DEFAULT '',
	  status TEXT NOT NULL DEFAULT 'OPEN',
	  year INT NOT NULL DEFAULT 0,
	  seq INT NOT NULL DEFAULT 0,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  data JSONB NOT NULL
	)`,
	`CREATE TABLE IF NOT EXISTS net_events (
	  id BIGSERIAL PRIMARY KEY,
	  at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  kind TEXT NOT NULL,
	  seconds INT NOT NULL DEFAULT 0,
	  version TEXT NOT NULL DEFAULT '',
	  detail TEXT NOT NULL DEFAULT ''
	)`,
	`CREATE TABLE IF NOT EXISTS net_heartbeat (
	  id INT PRIMARY KEY,
	  at TIMESTAMPTZ NOT NULL,
	  version TEXT NOT NULL DEFAULT ''
	)`,
	`CREATE TABLE IF NOT EXISTS leave_requests (
	  id TEXT PRIMARY KEY,
	  user_id TEXT NOT NULL,
	  status TEXT NOT NULL DEFAULT 'PENDING',
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  data JSONB NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS leave_requests_user_idx ON leave_requests (user_id, created_at DESC)`,
	`CREATE TABLE IF NOT EXISTS daily_reports (
	  id TEXT PRIMARY KEY,
	  user_id TEXT NOT NULL,
	  report_date TEXT NOT NULL,
	  recipient_ids TEXT[] NOT NULL DEFAULT '{}',
	  data JSONB NOT NULL,
	  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS daily_reports_user_idx ON daily_reports (user_id, report_date DESC)`,
	`CREATE INDEX IF NOT EXISTS daily_reports_date_idx ON daily_reports (report_date DESC)`,
	`CREATE INDEX IF NOT EXISTS daily_reports_recipients_idx ON daily_reports USING GIN (recipient_ids)`,
	`CREATE TABLE IF NOT EXISTS crm_customers (
	  id TEXT PRIMARY KEY,
	  owner_id TEXT,
	  data JSONB NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS crm_customers_owner_idx ON crm_customers (owner_id)`,
	`CREATE TABLE IF NOT EXISTS crm_deals (
	  id TEXT PRIMARY KEY,
	  customer_id TEXT,
	  owner_id TEXT,
	  data JSONB NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS crm_deals_customer_idx ON crm_deals (customer_id)`,
	`CREATE TABLE IF NOT EXISTS crm_activities (
	  id TEXT PRIMARY KEY,
	  customer_id TEXT,
	  owner_id TEXT,
	  data JSONB NOT NULL,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS crm_activities_customer_idx ON crm_activities (customer_id, created_at DESC)`,
	`CREATE TABLE IF NOT EXISTS sms_log (
	  id TEXT PRIMARY KEY,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  sent_by TEXT NOT NULL DEFAULT '',
	  to_num TEXT NOT NULL DEFAULT '',
	  text TEXT NOT NULL DEFAULT '',
	  status TEXT NOT NULL DEFAULT '',
	  detail TEXT NOT NULL DEFAULT ''
	)`,
	`CREATE INDEX IF NOT EXISTS sms_log_created_idx ON sms_log (created_at DESC)`,
	`CREATE TABLE IF NOT EXISTS msgr_log (
	  id TEXT PRIMARY KEY,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	  sent_by TEXT NOT NULL DEFAULT '',
	  channel TEXT NOT NULL DEFAULT '',
	  chat TEXT NOT NULL DEFAULT '',
	  text TEXT NOT NULL DEFAULT '',
	  status TEXT NOT NULL DEFAULT '',
	  detail TEXT NOT NULL DEFAULT ''
	)`,
	`CREATE TABLE IF NOT EXISTS notify_sounds (
	  id TEXT PRIMARY KEY,
	  name TEXT NOT NULL,
	  mime TEXT NOT NULL,
	  data BYTEA NOT NULL,
	  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS voip_calls (
	  id TEXT PRIMARY KEY,
	  started_at TIMESTAMPTZ NOT NULL,
	  answered_at TIMESTAMPTZ,
	  ended_at TIMESTAMPTZ,
	  direction TEXT NOT NULL,
	  status TEXT NOT NULL,
	  ext TEXT NOT NULL DEFAULT '',
	  exts TEXT[] NOT NULL DEFAULT '{}',
	  user_id TEXT NOT NULL DEFAULT '',
	  other_num TEXT NOT NULL DEFAULT '',
	  other_name TEXT NOT NULL DEFAULT '',
	  customer_id TEXT NOT NULL DEFAULT '',
	  customer_name TEXT NOT NULL DEFAULT '',
	  duration_sec INT NOT NULL DEFAULT 0
	)`,
	`CREATE INDEX IF NOT EXISTS voip_calls_started_idx ON voip_calls (started_at DESC)`,
	`CREATE INDEX IF NOT EXISTS voip_calls_exts_idx ON voip_calls USING GIN (exts)`,
	`CREATE TABLE IF NOT EXISTS settings (
	  key TEXT PRIMARY KEY,
	  data JSONB NOT NULL
	)`,
}

// Init connects (waiting for the database container to be ready), creates the schema and seeds the first admin.
func Init(ctx context.Context, cfg config.Config) error {
	var err error
	Pool, err = pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	for attempt := 1; ; attempt++ {
		if err = Pool.Ping(ctx); err == nil {
			break
		}
		if attempt >= 30 {
			return err
		}
		time.Sleep(2 * time.Second)
	}
	for _, stmt := range schema {
		if _, err := Pool.Exec(ctx, stmt); err != nil {
			return err
		}
	}
	return seed(ctx, cfg)
}

func seed(ctx context.Context, cfg config.Config) error {
	var n int
	if err := Pool.QueryRow(ctx, `SELECT count(*)::int FROM users`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	if cfg.AdminPassword == "" {
		log.Fatal("ADMIN_PASSWORD must be set to create the first admin user")
	}
	dept := jsonx.M{"id": "dept-general", "name": "مدیریت کل", "code": "HQ", "color": "#6E1B1B", "defaultQuotaGB": 100}
	if _, err := Pool.Exec(ctx, `INSERT INTO departments (id, data) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING`, "dept-general", jsonx.Encode(dept)); err != nil {
		return err
	}
	admin := jsonx.M{
		"id": "usr-admin", "fullName": cfg.AdminName, "email": cfg.AdminEmail, "avatarUrl": "", "avatarInitials": "مد",
		"role": "SUPER_ADMIN", "departmentId": "dept-general", "departmentName": "مدیریت کل",
		"storageQuotaGB": 1000, "storageUsedGB": 0, "isActive": true, "lastLogin": "تاکنون وارد نشده",
		"canSendOfficialLetters": true, "canSignOfficialLetters": true,
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), 10)
	if err != nil {
		return err
	}
	if _, err := Pool.Exec(ctx, `INSERT INTO users (id, email, password_hash, data) VALUES ($1, $2, $3, $4::jsonb)`,
		"usr-admin", cfg.AdminEmail, string(hash), jsonx.Encode(admin)); err != nil {
		return err
	}
	log.Printf("Seeded first admin user: %s", cfg.AdminEmail)
	return nil
}

// RawList runs a query whose single column is a JSONB document and returns the documents untouched.
func RawList(ctx context.Context, sql string, args ...any) ([]json.RawMessage, error) {
	rows, err := Pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []json.RawMessage{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		out = append(out, json.RawMessage(raw))
	}
	return out, rows.Err()
}

// BackfillDealCreators fills «who created this opportunity» for the opportunities made before that was recorded, with the
// best information there is: their main owner (marked as a guess, createdByGuess, so the page can say so). Safe to run again.
func BackfillDealCreators(ctx context.Context) {
	tag, err := Pool.Exec(ctx, `UPDATE crm_deals SET data = data || jsonb_build_object(
		  'createdById', COALESCE(NULLIF(data->>'ownerId', ''), owner_id, ''),
		  'createdByName', COALESCE(data->>'ownerName', ''),
		  'createdByGuess', true)
		WHERE COALESCE(data->>'createdById', '') = '' AND COALESCE(NULLIF(data->>'ownerId', ''), owner_id, '') <> ''`)
	if err != nil {
		log.Printf("store: backfill of deal creators: %v", err)
		return
	}
	if n := tag.RowsAffected(); n > 0 {
		log.Printf("store: %d opportunities got their owner as creator", n)
	}
}
