import { pool } from '../db.js';
import { isAdmin } from '../util.js';

// There is one settings document ("main"). Deleting it is not allowed.
export async function put({ me, data, res }) {
  const cur = (await pool.query(`SELECT data FROM settings WHERE key = 'main'`)).rows[0]?.data || {};
  // Non-admins (e.g. signers) may only advance the letter numbering counter.
  const merged = isAdmin(me) ? data : { ...cur, letterNumbering: data.letterNumbering ?? cur.letterNumbering };
  await pool.query(`INSERT INTO settings (key, data) VALUES ('main', $1) ON CONFLICT (key) DO UPDATE SET data = $1`, [merged]);
  res.json({ ok: true });
}
