import { Router } from 'express';
import { pool } from '../db.js';
import { isAdmin, canUseTasks, wrap } from '../util.js';
import { requireAuth, rowToUser } from '../auth/middleware.js';

const router = Router();
const EMPTY = { rows: [] };

// Everything the signed-in user is allowed to see, in one request. Regular users only get their own
// transfers, tasks and reports; admins get all of them.
router.get(
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
    const audit = admin ? await pool.query('SELECT data FROM audit_logs ORDER BY created_at DESC LIMIT 2000') : EMPTY;
    const tasks = !canUseTasks(me)
      ? EMPTY
      : admin
        ? await pool.query('SELECT data FROM tasks ORDER BY created_at DESC')
        : await pool.query(
            'SELECT data FROM tasks WHERE creator_id = $1 OR $1 = ANY(assignee_ids) ORDER BY created_at DESC',
            [me.id]
          );
    const reports = !canUseTasks(me)
      ? EMPTY
      : admin
        ? await pool.query('SELECT data FROM daily_reports ORDER BY report_date DESC LIMIT 1500')
        : await pool.query(
            'SELECT data FROM daily_reports WHERE user_id = $1 OR $1 = ANY(recipient_ids) ORDER BY report_date DESC LIMIT 600',
            [me.id]
          );
    res.json({
      me,
      tasks: tasks.rows.map((r) => r.data),
      reports: reports.rows.map((r) => r.data),
      staff: users.rows.map(rowToUser),
      departments: depts.rows.map((r) => r.data),
      transfers: transfers.rows.map((r) => r.data),
      auditLogs: audit.rows.map((r) => r.data),
      settings: settings.rows[0]?.data ?? null,
    });
  })
);

export default router;
