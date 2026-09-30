import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';

// P2P signalling. Files never touch the server: browsers exchange them directly over WebRTC.
// The server only relays the small connection-setup messages (SDP / ICE) between two signed-in users.
const router = Router();
const hubs = new Map(); // userId -> Set<response>

router.get('/api/signal/stream', requireAuth, (req, res) => {
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

router.post('/api/signal/send', requireAuth, (req, res) => {
  const { to, msg } = req.body || {};
  if (typeof to !== 'string' || !msg || typeof msg !== 'object') return res.status(400).json({ error: 'bad request' });
  const payload = JSON.stringify({ ...msg, from: req.user.id });
  if (payload.length > 64 * 1024) return res.status(413).json({ error: 'message too large' });
  const conns = hubs.get(to);
  if (!conns) return res.json({ delivered: 0 });
  for (const c of conns) c.write(`data: ${payload}\n\n`);
  res.json({ delivered: conns.size });
});

export default router;
