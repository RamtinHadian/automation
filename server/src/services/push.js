import webpush from 'web-push';
import { pool } from '../db.js';

// Web push: notifications while the app is closed. VAPID keys are generated once and kept in the database,
// so no configuration is needed.
let vapidPublicKey = '';
export const getVapidPublicKey = () => vapidPublicKey;

export async function initPush() {
  const { rows } = await pool.query(`SELECT data FROM settings WHERE key = 'vapid'`);
  let keys = rows[0]?.data;
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    await pool.query(`INSERT INTO settings (key, data) VALUES ('vapid', $1)`, [keys]);
  }
  vapidPublicKey = keys.publicKey;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@company.internal', keys.publicKey, keys.privateKey);
}

/** Sends one notification to every device the user registered; dead subscriptions are removed. */
export async function sendPush(userId, n) {
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
