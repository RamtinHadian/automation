import { Router } from 'express';
import { pool } from '../db.js';
import { wrap } from '../util.js';
import { requireAuth } from '../auth/middleware.js';
import { addNotifyConnection } from '../services/notify.js';
import { getVapidPublicKey } from '../services/push.js';

const router = Router();

// Live stream of new notifications (server-sent events). A heartbeat every 15 s lets the client notice a dead stream.
router.get('/api/notify/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  const remove = addNotifyConnection(req.user.id, res);
  const keepAlive = setInterval(() => res.write('data: {"ping":1}\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    remove();
  });
});

router.get(
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

router.post(
  '/api/notifications/read',
  requireAuth,
  wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
    if (ids) await pool.query('UPDATE notifications SET read = true WHERE user_id = $1 AND id = ANY($2)', [req.user.id, ids]);
    else await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  })
);

router.delete(
  '/api/notifications',
  requireAuth,
  wrap(async (req, res) => {
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  })
);

// Phone / browser push subscriptions
router.get('/api/push/key', requireAuth, (_req, res) => res.json({ publicKey: getVapidPublicKey() }));

router.post(
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

router.post(
  '/api/push/unsubscribe',
  requireAuth,
  wrap(async (req, res) => {
    const endpoint = String(req.body?.endpoint || '');
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id]);
    res.json({ ok: true });
  })
);

export default router;
