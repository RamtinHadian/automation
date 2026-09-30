import { Router } from 'express';
import { wrap, forbidden } from '../util.js';
import { requireAuth } from '../auth/middleware.js';
import * as staff from '../collections/staff.js';
import * as departments from '../collections/departments.js';
import * as settings from '../collections/settings.js';
import * as audit from '../collections/audit.js';
import * as reports from '../collections/reports.js';
import * as tasks from '../collections/tasks.js';
import * as transfers from '../collections/transfers.js';

// The app keeps its data in a few collections. Each collection module decides who may write or delete
// what (see ../collections). A module without `remove` cannot be deleted from (settings, audit).
const collections = { staff, departments, settings, audit, reports, tasks, transfers };
const find = (name) => (Object.hasOwn(collections, name) ? collections[name] : null);

const router = Router();

router.put(
  '/api/:collection/:id',
  requireAuth,
  wrap(async (req, res, next) => {
    const handler = find(req.params.collection);
    if (!handler) return next();
    const data = req.body?.data;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data required' });
    await handler.put({ req, res, me: req.user, id: req.params.id, data });
  })
);

router.delete(
  '/api/:collection/:id',
  requireAuth,
  wrap(async (req, res, next) => {
    const handler = find(req.params.collection);
    if (!handler) return next();
    if (!handler.remove) return forbidden(res);
    await handler.remove({ req, res, me: req.user, id: req.params.id });
  })
);

export default router;
