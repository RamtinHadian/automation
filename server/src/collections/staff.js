import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { isAdmin, forbidden } from '../util.js';

export async function put({ me, id, data, res }) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  const existing = rows[0];
  const { password, ...rest } = data;
  let merged;
  if (!isAdmin(me)) {
    // Regular users may only change cosmetic fields on their own record.
    if (!existing || existing.id !== me.id) return forbidden(res);
    merged = {
      ...existing.data,
      themeId: rest.themeId ?? existing.data.themeId,
      letterPrefs: rest.letterPrefs ?? existing.data.letterPrefs,
      avatarUrl: rest.avatarUrl ?? existing.data.avatarUrl,
    };
  } else {
    // Only a super admin may create, edit or promote super admins.
    const touchesSuper = rest.role === 'SUPER_ADMIN' || existing?.data.role === 'SUPER_ADMIN';
    if (touchesSuper && me.role !== 'SUPER_ADMIN') return forbidden(res);
    merged = { ...rest, id };
  }
  if (existing) {
    const hash = password && isAdmin(me) ? await bcrypt.hash(String(password), 10) : existing.password_hash;
    await pool.query('UPDATE users SET email = $2, password_hash = $3, data = $4 WHERE id = $1', [
      id,
      merged.email || existing.email,
      hash,
      merged,
    ]);
  } else {
    if (!password) return res.status(400).json({ error: 'password required for new user' });
    const hash = await bcrypt.hash(String(password), 10);
    try {
      await pool.query('INSERT INTO users (id, email, password_hash, data) VALUES ($1, $2, $3, $4)', [
        id,
        merged.email,
        hash,
        merged,
      ]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'ایمیل تکراری است.' });
      throw err;
    }
  }
  res.json({ ok: true });
}

export async function remove({ me, id, res }) {
  if (!isAdmin(me)) return forbidden(res);
  if (id === me.id) return res.status(400).json({ error: 'cannot delete yourself' });
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  res.json({ ok: true });
}
