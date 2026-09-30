import pg from 'pg';
import bcrypt from 'bcryptjs';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  sender_id TEXT,
  recipient_ids TEXT[] NOT NULL DEFAULT '{}',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transfers_sender_idx ON transfers (sender_id);
CREATE INDEX IF NOT EXISTS transfers_recipients_idx ON transfers USING GIN (recipient_ids);
-- A recipient "deleting" a received item only hides it from their own list.
CREATE TABLE IF NOT EXISTS transfer_hidden (
  transfer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (transfer_id, user_id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  creator_id TEXT,
  assignee_ids TEXT[] NOT NULL DEFAULT '{}',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_creator_idx ON tasks (creator_id);
CREATE INDEX IF NOT EXISTS tasks_assignees_idx ON tasks USING GIN (assignee_ids);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);
CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  recipient_ids TEXT[] NOT NULL DEFAULT '{}',
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_reports_user_idx ON daily_reports (user_id, report_date DESC);
CREATE INDEX IF NOT EXISTS daily_reports_date_idx ON daily_reports (report_date DESC);
CREATE INDEX IF NOT EXISTS daily_reports_recipients_idx ON daily_reports USING GIN (recipient_ids);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL
);
`;

export async function initDb() {
  // Wait for the database to accept connections (compose starts both together).
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await pool.query(SCHEMA);
  await seed();
}

async function seed() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('ADMIN_PASSWORD must be set to create the first admin user');

  const dept = {
    id: 'dept-general',
    name: 'مدیریت کل',
    code: 'HQ',
    color: '#6E1B1B',
    defaultQuotaGB: 100,
  };
  await pool.query('INSERT INTO departments (id, data) VALUES ($1, $2) ON CONFLICT DO NOTHING', [dept.id, dept]);

  const admin = {
    id: 'usr-admin',
    fullName: process.env.ADMIN_FULL_NAME || 'مدیر کل سیستم',
    email: process.env.ADMIN_EMAIL || 'admin@company.internal',
    avatarUrl: '',
    avatarInitials: 'مد',
    role: 'SUPER_ADMIN',
    departmentId: dept.id,
    departmentName: dept.name,
    storageQuotaGB: 1000,
    storageUsedGB: 0,
    isActive: true,
    lastLogin: 'تاکنون وارد نشده',
    canSendOfficialLetters: true,
    canSignOfficialLetters: true,
  };
  const hash = await bcrypt.hash(adminPassword, 10);
  await pool.query('INSERT INTO users (id, email, password_hash, data) VALUES ($1, $2, $3, $4)', [
    admin.id,
    admin.email,
    hash,
    admin,
  ]);
  console.log(`Seeded first admin user: ${admin.email}`);
}
