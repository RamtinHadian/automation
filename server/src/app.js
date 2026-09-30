import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { STATIC_DIR } from './config.js';
import authRoutes from './auth/routes.js';
import stateRoutes from './routes/state.js';
import notificationRoutes from './routes/notifications.js';
import collectionRoutes from './routes/collections.js';
import signalRoutes from './routes/signal.js';
import systemRoutes from './routes/system.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '60mb' }));

  // API. Order matters: fixed paths first, the generic /api/:collection/:id routes last.
  app.use(authRoutes);
  app.use(stateRoutes);
  app.use(notificationRoutes);
  app.use(collectionRoutes);
  app.use(signalRoutes);
  app.use(systemRoutes);

  // The built frontend (single-page app)
  if (fs.existsSync(STATIC_DIR)) {
    app.use(express.static(STATIC_DIR));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'حجم فایل بیش از حد مجاز است.' });
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
