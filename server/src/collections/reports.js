import { pool } from '../db.js';
import { isAdmin, canUseTasks, forbidden } from '../util.js';
import { notify } from '../services/notify.js';

// Daily reports: one per person per day (id = "<userId>_<yyyy-mm-dd>"), written only by its author.
export async function put({ me, id, data, res }) {
  if (!canUseTasks(me)) return forbidden(res);
  const date = String(data.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad date' });
  if (id !== `${me.id}_${date}`) return forbidden(res);
  const recipients = (Array.isArray(data.recipientIds) ? data.recipientIds : []).map(String).filter((r) => r !== me.id);
  const { rows } = await pool.query('SELECT 1 FROM daily_reports WHERE id = $1', [id]);
  const doc = { ...data, id, userId: me.id, authorName: me.fullName, date, recipientIds: recipients, updatedAt: new Date().toISOString() };
  await pool.query(
    `INSERT INTO daily_reports (id, user_id, report_date, recipient_ids, data) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET recipient_ids = $4, data = $5, updated_at = now()`,
    [id, me.id, date, recipients, doc]
  );
  const summary = String(doc.summary || '').trim().slice(0, 90);
  if (!rows[0]) {
    await notify(
      recipients,
      { kind: 'task', label: 'گزارش روزانه', title: `گزارش روزانه از ${me.fullName}`, body: summary || 'گزارش جدید ثبت شد', ref: { type: 'report', id } },
      me.id
    );
  }
  res.json({ ok: true });
}

export async function remove({ me, id, res }) {
  const { rows } = await pool.query('SELECT user_id FROM daily_reports WHERE id = $1', [id]);
  if (!rows[0]) return res.json({ ok: true });
  if (!isAdmin(me) && rows[0].user_id !== me.id) return forbidden(res);
  await pool.query('DELETE FROM daily_reports WHERE id = $1', [id]);
  res.json({ ok: true });
}
