import { pool } from '../db.js';
import { isAdmin, canUseTasks, forbidden } from '../util.js';
import { notify } from '../services/notify.js';

const STATUS_FA = { TODO: 'انجام نشده', IN_PROGRESS: 'در حال انجام', REVIEW: 'در انتظار بررسی', DONE: 'انجام شده' };

export async function put({ me, id, data, res }) {
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
  if (!existing) {
    await notify(assignees, { kind: 'task', label: 'وظیفه جدید', title: `وظیفه جدید از ${me.fullName}`, body: doc.title, ref }, me.id);
  } else {
    const before = existing.data;
    const added = assignees.filter((a) => !existing.assignee_ids.includes(a));
    await notify(added, { kind: 'task', label: 'واگذار شد', title: `وظیفه‌ای به شما واگذار شد (${me.fullName})`, body: doc.title, ref }, me.id);
    if (before.status !== doc.status) {
      await notify(
        involved.filter((u) => !added.includes(u)),
        {
          kind: 'task',
          label: STATUS_FA[doc.status] || 'تغییر وضعیت',
          title: `وضعیت وظیفه تغییر کرد: ${STATUS_FA[doc.status] || doc.status}`,
          body: `${doc.title} — توسط ${me.fullName}`,
          ref,
        },
        me.id
      );
    }
    const newOnes = (doc.comments || []).slice((before.comments || []).length);
    for (const c of newOnes) {
      await notify(involved, { kind: 'task', label: 'نظر جدید', title: `نظر جدید در وظیفه «${doc.title}»`, body: `${c.userName}: ${c.text}`, ref }, me.id);
    }
  }
  res.json({ ok: true });
}

export async function remove({ me, id, res }) {
  const { rows } = await pool.query('SELECT creator_id FROM tasks WHERE id = $1', [id]);
  if (!rows[0]) return res.json({ ok: true });
  if (!isAdmin(me) && rows[0].creator_id !== me.id) return forbidden(res);
  await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
  res.json({ ok: true });
}
