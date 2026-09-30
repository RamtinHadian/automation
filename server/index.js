import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import webpush from 'web-push';
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

app.post(
  '/api/auth/change-password',
  requireAuth,
  wrap(async (req, res) => {
    const ip = req.ip;
    if (loginBlocked(ip)) {
      return res.status(429).json({ error: 'تلاش‌های ناموفق زیاد است. چند دقیقه بعد دوباره امتحان کنید.' });
    }
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
          `SELECT data FROM transfers t
           WHERE (t.sender_id = $1 OR $1 = ANY(t.recipient_ids))
             AND NOT EXISTS (SELECT 1 FROM transfer_hidden h WHERE h.transfer_id = t.id AND h.user_id = $1)
           ORDER BY t.created_at DESC`,
          [me.id]
        );
    const audit = admin
      ? await pool.query('SELECT data FROM audit_logs ORDER BY created_at DESC LIMIT 2000')
      : { rows: [] };
    const tasks = !canUseTasks(me)
      ? { rows: [] }
      : admin
        ? await pool.query('SELECT data FROM tasks ORDER BY created_at DESC')
        : await pool.query(
            'SELECT data FROM tasks WHERE creator_id = $1 OR $1 = ANY(assignee_ids) ORDER BY created_at DESC',
            [me.id]
          );
    res.json({
      me,
      tasks: tasks.rows.map((r) => r.data),
      staff: users.rows.map(rowToUser),
      departments: depts.rows.map((r) => r.data),
      transfers: transfers.rows.map((r) => r.data),
      auditLogs: audit.rows.map((r) => r.data),
      settings: settings.rows[0]?.data ?? null,
    });
  })
);

// ---------- notifications ----------
// Every relevant change (new file, letter, task, signature...) creates a stored notification for the
// people concerned and pushes it live over a separate SSE stream, so a browser window in the
// background or minimised still hears it immediately.
const notifyHubs = new Map(); // userId -> Set<response>
const uidn = () => 'n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- web push (notifications while the app is closed) ----------
// VAPID keys are generated once and kept in the database, so no configuration is needed.
let vapidPublicKey = '';
async function initPush() {
  const { rows } = await pool.query(`SELECT data FROM settings WHERE key = 'vapid'`);
  let keys = rows[0]?.data;
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    await pool.query(`INSERT INTO settings (key, data) VALUES ('vapid', $1)`, [keys]);
  }
  vapidPublicKey = keys.publicKey;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@company.internal', keys.publicKey, keys.privateKey);
}

async function sendPush(userId, n) {
  let subs;
  try {
    subs = (await pool.query('SELECT endpoint, data FROM push_subscriptions WHERE user_id = $1', [userId])).rows;
  } catch {
    return;
  }
  const payload = JSON.stringify({ id: n.id, title: n.title, body: n.body, kind: n.kind, ref: n.ref });
  await Promise.all(
    subs.map((s) =>
      webpush.sendNotification(s.data, payload, { TTL: 86400, urgency: 'high' }).catch(async (err) => {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [s.endpoint]).catch(() => {});
        }
      })
    )
  );
}

async function notify(userIds, { kind, title, body, ref, label }, exceptId) {
  const targets = [...new Set(userIds)].filter((id) => id && id !== exceptId);
  for (const userId of targets) {
    const n = { id: uidn(), userId, kind, label: label || '', title, body: body || '', ref: ref || null, createdAt: new Date().toISOString(), read: false };
    try {
      await pool.query('INSERT INTO notifications (id, user_id, data) VALUES ($1, $2, $3)', [n.id, userId, n]);
      await pool.query(
        `DELETE FROM notifications WHERE user_id = $1 AND id NOT IN
           (SELECT id FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200)`,
        [userId]
      );
    } catch (e) {
      console.error('notify failed', e);
      continue;
    }
    for (const c of notifyHubs.get(userId) || []) c.write(`data: ${JSON.stringify(n)}\n\n`);
    void sendPush(userId, n);
  }
}

app.get('/api/notify/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  const id = req.user.id;
  if (!notifyHubs.has(id)) notifyHubs.set(id, new Set());
  notifyHubs.get(id).add(res);
  const keepAlive = setInterval(() => res.write('data: {"ping":1}\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    const set = notifyHubs.get(id);
    set?.delete(res);
    if (set && set.size === 0) notifyHubs.delete(id);
  });
});

app.get('/api/push/key', requireAuth, (_req, res) => res.json({ publicKey: vapidPublicKey }));

app.post(
  '/api/push/subscribe',
  requireAuth,
  wrap(async (req, res) => {
    const sub = req.body?.subscription;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) return res.status(400).json({ error: 'bad subscription' });
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, user_id, data) VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, data = $3`,
      [sub.endpoint, req.user.id, sub]
    );
    res.json({ ok: true });
  })
);

app.post(
  '/api/push/unsubscribe',
  requireAuth,
  wrap(async (req, res) => {
    const endpoint = String(req.body?.endpoint || '');
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id]);
    res.json({ ok: true });
  })
);

app.get(
  '/api/notifications',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT data, read FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    res.json({ notifications: rows.map((r) => ({ ...r.data, read: r.read })) });
  })
);

app.post(
  '/api/notifications/read',
  requireAuth,
  wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
    if (ids) await pool.query('UPDATE notifications SET read = true WHERE user_id = $1 AND id = ANY($2)', [req.user.id, ids]);
    else await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  })
);

app.delete(
  '/api/notifications',
  requireAuth,
  wrap(async (req, res) => {
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  })
);

// ---------- collection writes ----------
const COLLECTIONS = new Set(['staff', 'departments', 'transfers', 'audit', 'settings', 'tasks']);
const canUseTasks = (u) => isAdmin(u) || u.canUseTasks === true;

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

    if (collection === 'tasks') {
      if (!canUseTasks(me)) return forbidden(res);
      const { rows } = await pool.query('SELECT creator_id, assignee_ids, data FROM tasks WHERE id = $1', [id]);
      const existing = rows[0];
      let doc;
      if (!existing) {
        doc = { ...data, id, creatorId: me.id, creatorName: me.fullName };
      } else if (isAdmin(me) || existing.creator_id === me.id) {
        doc = { ...data, id, creatorId: existing.creator_id, creatorName: existing.data.creatorName };
      } else if (existing.assignee_ids.includes(me.id)) {
        // Assignees may move the task along, tick the checklist and comment; nothing else.
        doc = {
          ...existing.data,
          status: data.status ?? existing.data.status,
          checklist: data.checklist ?? existing.data.checklist,
          comments: data.comments ?? existing.data.comments,
          completedAt: data.completedAt,
          updatedAt: data.updatedAt ?? existing.data.updatedAt,
        };
      } else {
        return forbidden(res);
      }
      const assignees = Array.isArray(doc.assigneeIds) ? doc.assigneeIds.map(String) : [];
      await pool.query(
        `INSERT INTO tasks (id, creator_id, assignee_ids, data) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET assignee_ids = $3, data = $4`,
        [id, doc.creatorId, assignees, doc]
      );
      const ref = { type: 'task', id };
      const involved = [doc.creatorId, ...assignees];
      const STATUS_FA = { TODO: 'انجام نشده', IN_PROGRESS: 'در حال انجام', REVIEW: 'در انتظار بررسی', DONE: 'انجام شده' };
      if (!existing) {
        await notify(assignees, { kind: 'task', label: 'وظیفه جدید', title: `وظیفه جدید از ${me.fullName}`, body: doc.title, ref }, me.id);
      } else {
        const before = existing.data;
        const added = assignees.filter((a) => !existing.assignee_ids.includes(a));
        await notify(added, { kind: 'task', label: 'واگذار شد', title: `وظیفه‌ای به شما واگذار شد (${me.fullName})`, body: doc.title, ref }, me.id);
        if (before.status !== doc.status) {
          await notify(
            involved.filter((u) => !added.includes(u)),
            { kind: 'task', label: STATUS_FA[doc.status] || 'تغییر وضعیت', title: `وضعیت وظیفه تغییر کرد: ${STATUS_FA[doc.status] || doc.status}`, body: `${doc.title} — توسط ${me.fullName}`, ref },
            me.id
          );
        }
        const newOnes = (doc.comments || []).slice((before.comments || []).length);
        for (const c of newOnes) {
          await notify(involved, { kind: 'task', label: 'نظر جدید', title: `نظر جدید در وظیفه «${doc.title}»`, body: `${c.userName}: ${c.text}`, ref }, me.id);
        }
      }
      return res.json({ ok: true });
    }

    if (collection === 'transfers') {
      const { rows } = await pool.query('SELECT sender_id, recipient_ids, data FROM transfers WHERE id = $1', [id]);
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
      const ref = { type: data.isOfficialLetter ? 'letter' : 'file', id };
      const name = data.fileName || 'بدون عنوان';
      if (!existing) {
        if (data.isOfficialLetter) {
          await notify(
            recipientIds,
            {
              kind: 'letter',
              label: data.signatureStatus === 'PENDING_SIGNATURE' ? 'جهت امضا' : 'نامه جدید',
              title: data.signatureStatus === 'PENDING_SIGNATURE' ? `نامه جدید جهت امضا از ${me.fullName}` : `نامه جدید از ${me.fullName}`,
              body: name,
              ref,
            },
            me.id
          );
        } else {
          await notify(recipientIds, { kind: 'file', label: 'فایل جدید', title: `فایل جدید از ${me.fullName}`, body: name, ref }, me.id);
        }
      } else {
        const before = existing.data;
        if (data.signatureStatus !== before.signatureStatus) {
          if (data.signatureStatus === 'SIGNED') {
            await notify([existing.sender_id, ...recipientIds], { kind: 'letter', label: 'امضا شد', title: 'نامه امضا شد', body: `${name} — توسط ${me.fullName}`, ref }, me.id);
          } else if (data.signatureStatus === 'REJECTED') {
            await notify([existing.sender_id], { kind: 'alert', label: 'رد شد', title: 'نامه رد شد', body: `${name} — توسط ${me.fullName}`, ref }, me.id);
          }
        }
        const added = recipientIds.filter((r) => !existing.recipient_ids.includes(r));
        if (added.length) {
          const last = (data.referrals || []).slice(-1)[0];
          await notify(added, { kind: 'letter', label: 'ارجاع', title: `ارجاع نامه از ${me.fullName}`, body: last?.comment ? `${name} — ${last.comment}` : name, ref }, me.id);
        }
        if ((data.downloadsCount || 0) > (before.downloadsCount || 0) && me.id !== existing.sender_id) {
          await notify([existing.sender_id], { kind: 'file', label: 'دریافت شد', title: `${me.fullName} فایل را دریافت کرد`, body: name, ref }, me.id);
        }
      }
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
    if (collection === 'tasks') {
      const { rows } = await pool.query('SELECT creator_id FROM tasks WHERE id = $1', [id]);
      if (!rows[0]) return res.json({ ok: true });
      if (!isAdmin(me) && rows[0].creator_id !== me.id) return forbidden(res);
      await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return res.json({ ok: true });
    }
    if (collection === 'transfers') {
      const { rows } = await pool.query('SELECT sender_id, recipient_ids FROM transfers WHERE id = $1', [id]);
      const row = rows[0];
      if (!row) return res.json({ ok: true });
      if (isAdmin(me) || row.sender_id === me.id) {
        await pool.query('DELETE FROM transfers WHERE id = $1', [id]);
        await pool.query('DELETE FROM transfer_hidden WHERE transfer_id = $1', [id]);
        return res.json({ ok: true });
      }
      if (!row.recipient_ids.includes(me.id)) return forbidden(res);
      // A recipient removing a received item only hides it from their own list.
      await pool.query('INSERT INTO transfer_hidden (transfer_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, me.id]);
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
await initPush();
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
