import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { JWT_SECRET } from '../config.js';
import { wrap } from '../util.js';

export const rowToUser = (row) => ({ ...row.data, id: row.id, email: row.email });

/** Requires a valid session token and puts the current user on `req.user`. */
export const requireAuth = wrap(async (req, res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'unauthenticated' });
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  if (!rows[0] || !rows[0].data.isActive) return res.status(401).json({ error: 'unauthenticated' });
  req.user = rowToUser(rows[0]);
  next();
});
