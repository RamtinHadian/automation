// Small helpers shared by every route module.

export const isAdmin = (u) => u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN';
export const canUseTasks = (u) => isAdmin(u) || u.canUseTasks === true;

/** Lets route handlers be async: a thrown error reaches the Express error handler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const forbidden = (res) => res.status(403).json({ error: 'forbidden' });
