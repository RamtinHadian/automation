import { pool } from '../db.js';
import { sendPush } from './push.js';

// Every relevant change (new file, letter, task, signature...) creates a stored notification for the
// people concerned and pushes it live over a separate SSE stream, so a browser window in the
// background or minimised still hears it immediately.
const notifyHubs = new Map(); // userId -> Set<response>
const uidn = () => 'n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Registers an open SSE response for the user; returns a function that removes it. */
export function addNotifyConnection(userId, res) {
  if (!notifyHubs.has(userId)) notifyHubs.set(userId, new Set());
  notifyHubs.get(userId).add(res);
  return () => {
    const set = notifyHubs.get(userId);
    set?.delete(res);
    if (set && set.size === 0) notifyHubs.delete(userId);
  };
}

/**
 * Stores and delivers a notification to each user (except `exceptId`, normally the person who caused it).
 * The very same text is never sent to a user twice within two minutes.
 */
export async function notify(userIds, { kind, title, body, ref, label }, exceptId) {
  const targets = [...new Set(userIds)].filter((id) => id && id !== exceptId);
  for (const userId of targets) {
    const n = { id: uidn(), userId, kind, label: label || '', title, body: body || '', ref: ref || null, createdAt: new Date().toISOString(), read: false };
    try {
      const dup = await pool.query(
        `SELECT 1 FROM notifications WHERE user_id = $1 AND data->>'title' = $2 AND data->>'body' = $3
           AND created_at > now() - interval '2 minutes' LIMIT 1`,
        [userId, n.title, n.body]
      );
      if (dup.rows[0]) continue;
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
