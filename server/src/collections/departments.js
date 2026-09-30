import { pool } from '../db.js';
import { isAdmin, forbidden } from '../util.js';

export async function put({ me, id, data, res }) {
  if (!isAdmin(me)) return forbidden(res);
  await pool.query('INSERT INTO departments (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2', [
    id,
    { ...data, id },
  ]);
  res.json({ ok: true });
}

export async function remove({ me, id, res }) {
  if (!isAdmin(me)) return forbidden(res);
  await pool.query('DELETE FROM departments WHERE id = $1', [id]);
  res.json({ ok: true });
}
