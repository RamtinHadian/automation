import { pool } from '../db.js';

// Audit log: append-only, and the identity comes from the session, not from the client.
export async function put({ req, me, id, data, res }) {
  const entry = { ...data, id, userName: me.fullName, userEmail: me.email, ipAddress: req.ip };
  await pool.query('INSERT INTO audit_logs (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [id, entry]);
  res.json({ ok: true });
}
