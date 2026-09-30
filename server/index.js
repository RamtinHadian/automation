// Entry point of the API server. The code lives in ./src (see docs/ARCHITECTURE.md).
import { PORT, assertConfig } from './src/config.js';
import { initDb } from './src/db.js';
import { initPush } from './src/services/push.js';
import { createApp } from './src/app.js';

assertConfig();
await initDb();
await initPush();
createApp().listen(PORT, () => console.log(`Server listening on :${PORT}`));
