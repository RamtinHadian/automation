import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { JWT_SECRET } from '../config.js';
import { isAdmin, wrap } from '../util.js';
import { requireAuth, rowToUser } from './middleware.js';

const router = Router();

// Too many wrong passwords from one address blocks it for ten minutes.
const failures = new Map(); // ip -> { count, until }
function loginBlocked(ip) {
  const f = failures.get(ip);
  return f && f.count >= 8 && f.until > Date.now();
}
function noteFailure(ip) {
  const f = failures.get(ip);
  if (!f || f.until <= Date.now()) failures.set(ip, { count: 1, until: Date.now() + 10 * 60 * 1000 });
  else f.count++;
}

const TOO_MANY = 'تلاش‌های ناموفق زیاد است. چند دقیقه بعد دوباره امتحان کنید.';

router.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const ip = req.ip;
    if (loginBlocked(ip)) return res.status(429).json({ error: TOO_MANY });

    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const adminOnly = !!req.body?.adminOnly;
    if (!identifier || !password) return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است.' });

    const { rows } = await pool.query(
      `SELECT * FROM users WHERE lower(email) = $1 OR lower(id) = $1 OR lower(data->>'fullName') = $1 LIMIT 1`,
      [identifier]
    );
    const row = rows[0];
    const ok = row && (await bcrypt.compare(password, row.password_hash));
    if (!ok) {
      noteFailure(ip);
      return res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است.' });
    }
    const user = rowToUser(row);
    if (!user.isActive) return res.status(403).json({ error: 'حساب کاربری شما غیرفعال شده است.' });
    if (adminOnly && !isAdmin(user)) return res.status(403).json({ error: 'این حساب دسترسی مدیر ندارد.' });

    failures.delete(ip);
    user.lastLogin = new Date().toLocaleString('fa-IR');
    await pool.query('UPDATE users SET data = $2 WHERE id = $1', [user.id, user]);
    const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user });
  })
);

router.post(
  '/api/auth/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const ip = req.ip;
    if (loginBlocked(ip)) return res.status(429).json({ error: TOO_MANY });
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (newPassword.length < 8) return res.status(400).json({ error: 'کلمه عبور جدید باید حداقل ۸ کاراکتر باشد.' });
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      noteFailure(ip);
      return res.status(403).json({ error: 'کلمه عبور فعلی نادرست است.' });
    }
    await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await bcrypt.hash(newPassword, 10)]);
    res.json({ ok: true });
  })
);

export default router;
