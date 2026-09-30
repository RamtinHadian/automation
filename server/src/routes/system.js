import { Router } from 'express';
import { pool } from '../db.js';
import { wrap } from '../util.js';

const router = Router();

// ICE servers the browsers use for direct file transfer (set ICE_SERVERS in .env to add a TURN server).
router.get('/api/config', (_req, res) => {
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  try {
    if (process.env.ICE_SERVERS) iceServers = JSON.parse(process.env.ICE_SERVERS);
  } catch {
    console.warn('ICE_SERVERS is not valid JSON; using default STUN server');
  }
  res.json({ iceServers });
});

router.get(
  '/api/health',
  wrap(async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  })
);

export default router;
