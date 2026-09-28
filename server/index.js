import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { pool, initDb } from './db.js';

const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET;
const STATIC_DIR = process.env.STATIC_DIR || path.resolve('public');

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error('JWT_SECRET must be set to a random string of at least 16 characters');
  process.exit(1);
}

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '60mb' }));

const isAdmin = (u) => u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN';
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const forbidden = (res) => res.status(403).json({ error: 'forbidden' });

// ---------- auth ----------
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

const rowToUser = (row) => ({ ...row.data, id: row.id, email: row.email });

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const ip = req.ip;
    if (loginBlocked(ip)) {
      return res.status(429).json({ error: 'تلاش‌های ناموفق زیاد است. چند دقیقه بعد دوباره امتحان کنید.' });
    }

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

const requireAuth = wrap(async (req, res, next) => {
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

// ---------- state ----------
app.get(
  '/api/state',
  requireAuth,
  wrap(async (req, res) => {
    const me = req.user;
    const admin = isAdmin(me);
    const [users, depts, settings] = await Promise.all([
      pool.query('SELECT id, email, data FROM users ORDER BY created_at'),
      pool.query('SELECT data FROM departments'),
      pool.query(`SELECT data FROM settings WHERE key = 'main'`),
    ]);
    const transfers = admin
      ? await pool.query('SELECT data FROM transfers ORDER BY created_at DESC')
      : await pool.query(
          'SELECT data FROM transfers WHERE sender_id = $1 OR $1 = ANY(recipient_ids) ORDER BY created_at DESC',
          [me.id]
        );
    const audit = admin
      ? await pool.query('SELECT data FROM audit_logs ORDER BY created_at DESC LIMIT 2000')
      : { rows: [] };
    res.json({
      me,
      staff: users.rows.map(rowToUser),
      departments: depts.rows.map((r) => r.data),
      transfers: transfers.rows.map((r) => r.data),
      auditLogs: audit.rows.map((r) => r.data),
      settings: settings.rows[0]?.data ?? null,
    });
  })
);

// ---------- collection writes ----------
const COLLECTIONS = new Set(['staff', 'departments', 'transfers', 'audit', 'settings']);

app.put(
  '/api/:collection/:id',
  requireAuth,
  wrap(async (req, res, next) => {
    const { collection, id } = req.params;
    if (!COLLECTIONS.has(collection)) return next();
    const me = req.user;
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data required' });

    if (collection === 'staff') {
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
      return res.json({ ok: true });
    }

    if (collection === 'departments') {
      if (!isAdmin(me)) return forbidden(res);
      await pool.query(
        'INSERT INTO departments (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
        [id, { ...data, id }]
      );
      return res.json({ ok: true });
    }

    if (collection === 'settings') {
      const cur = (await pool.query(`SELECT data FROM settings WHERE key = 'main'`)).rows[0]?.data || {};
      // Non-admins (e.g. signers) may only advance the letter numbering counter.
      const merged = isAdmin(me) ? data : { ...cur, letterNumbering: data.letterNumbering ?? cur.letterNumbering };
      await pool.query(
        `INSERT INTO settings (key, data) VALUES ('main', $1) ON CONFLICT (key) DO UPDATE SET data = $1`,
        [merged]
      );
      return res.json({ ok: true });
    }

    if (collection === 'transfers') {
      const { rows } = await pool.query('SELECT sender_id, recipient_ids FROM transfers WHERE id = $1', [id]);
      const existing = rows[0];
      const participant = existing && (existing.sender_id === me.id || existing.recipient_ids.includes(me.id));
      const allowed = existing ? isAdmin(me) || participant : isAdmin(me) || data.sender?.id === me.id;
      if (!allowed) return forbidden(res);
      const senderId = existing ? existing.sender_id : data.sender?.id ?? me.id;
      const recipientIds = (data.recipients || []).map((r) => r.id);
      await pool.query(
        `INSERT INTO transfers (id, sender_id, recipient_ids, data) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET recipient_ids = $3, data = $4, updated_at = now()`,
        [id, senderId, recipientIds, { ...data, id }]
      );
      return res.json({ ok: true });
    }

    // audit: append-only, identity comes from the session, not the client
    const entry = { ...data, id, userName: me.fullName, userEmail: me.email, ipAddress: req.ip };
    await pool.query('INSERT INTO audit_logs (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [id, entry]);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/:collection/:id',
  requireAuth,
  wrap(async (req, res, next) => {
    const { collection, id } = req.params;
    if (!COLLECTIONS.has(collection)) return next();
    const me = req.user;
    if (collection === 'staff') {
      if (!isAdmin(me)) return forbidden(res);
      if (id === me.id) return res.status(400).json({ error: 'cannot delete yourself' });
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return res.json({ ok: true });
    }
    if (collection === 'departments') {
      if (!isAdmin(me)) return forbidden(res);
      await pool.query('DELETE FROM departments WHERE id = $1', [id]);
      return res.json({ ok: true });
    }
    if (collection === 'transfers') {
      const { rows } = await pool.query('SELECT sender_id FROM transfers WHERE id = $1', [id]);
      if (rows[0] && !(isAdmin(me) || rows[0].sender_id === me.id)) return forbidden(res);
      await pool.query('DELETE FROM transfers WHERE id = $1', [id]);
      return res.json({ ok: true });
    }
    return forbidden(res);
  })
);

// ---------- P2P signalling ----------
// Files never touch the server: browsers exchange them directly over WebRTC. The server only
// relays the small connection-setup messages (SDP / ICE) between two signed-in users.
const hubs = new Map(); // userId -> Set<response>

app.get('/api/signal/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  const id = req.user.id;
  if (!hubs.has(id)) hubs.set(id, new Set());
  hubs.get(id).add(res);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(keepAlive);
    const set = hubs.get(id);
    set?.delete(res);
    if (set && set.size === 0) hubs.delete(id);
  });
});

app.post('/api/signal/send', requireAuth, (req, res) => {
  const { to, msg } = req.body || {};
  if (typeof to !== 'string' || !msg || typeof msg !== 'object') return res.status(400).json({ error: 'bad request' });
  const payload = JSON.stringify({ ...msg, from: req.user.id });
  if (payload.length > 64 * 1024) return res.status(413).json({ error: 'message too large' });
  const conns = hubs.get(to);
  if (!conns) return res.json({ delivered: 0 });
  for (const c of conns) c.write(`data: ${payload}\n\n`);
  res.json({ delivered: conns.size });
});

app.get('/api/config', (_req, res) => {
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  try {
    if (process.env.ICE_SERVERS) iceServers = JSON.parse(process.env.ICE_SERVERS);
  } catch {
    console.warn('ICE_SERVERS is not valid JSON; using default STUN server');
  }
  res.json({ iceServers });
});

app.get(
  '/api/health',
  wrap(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  })
);

// ---------- static frontend ----------
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'حجم فایل بیش از حد مجاز است.' });
  res.status(500).json({ error: 'internal error' });
});

await initDb();
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
