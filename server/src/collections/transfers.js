import { pool } from '../db.js';
import { isAdmin, forbidden } from '../util.js';
import { notify } from '../services/notify.js';

// Transfers = files and official letters. The sender, the recipients and admins can change a transfer.
export async function put({ me, id, data, res }) {
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
      const pending = data.signatureStatus === 'PENDING_SIGNATURE';
      await notify(
        recipientIds,
        {
          kind: 'letter',
          label: pending ? 'جهت امضا' : 'نامه جدید',
          title: pending ? `نامه جدید جهت امضا از ${me.fullName}` : `نامه جدید از ${me.fullName}`,
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
  res.json({ ok: true });
}

export async function remove({ me, id, res }) {
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
  res.json({ ok: true });
}
