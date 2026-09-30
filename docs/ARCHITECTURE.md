# Project structure

```
automation/
├── web/                     Frontend (React + Vite + Tailwind)
│   ├── src/
│   │   ├── pages/           Whole screens: login, user panel, admin panel
│   │   ├── components/      Screen parts, grouped by feature
│   │   │   ├── admin/       Users, departments, settings, analytics, audit log
│   │   │   ├── letters/     Letter editor, preview/sign, draggable signature and stamp
│   │   │   ├── tasks/       Task board and daily reports
│   │   │   ├── dashboard/   Panel shown after login
│   │   │   ├── common/      Notification bell and pop-ups, desktop display settings
│   │   │   ├── drive/       File sending
│   │   │   ├── transfers/   Sent / received lists
│   │   │   └── layout/      Shared layout pieces
│   │   ├── context/         AppContext: the app's data, server sync and notifications
│   │   └── lib/             Plain helpers (API client, P2P files, dates, digits, PDF, push...)
│   └── public/              Service worker, manifest, icons (copied as-is to the build)
├── server/                  Backend (Node.js + Express + PostgreSQL)
│   ├── index.js             Entry point only
│   └── src/
│       ├── app.js           Builds the Express app (middleware, routes, static frontend)
│       ├── config.js        Environment settings
│       ├── db.js            Database schema and first-start seed
│       ├── util.js          Shared helpers (roles, async wrapper)
│       ├── auth/            Login, password change, session check
│       ├── routes/          HTTP endpoints: state, notifications + push, collections, P2P signalling, health
│       ├── collections/     Rules for each stored collection: who may write or delete what
│       └── services/        Notification delivery and web push
├── desktop/                 Windows app (Electron): always on top, tray, pop-up windows
├── docs/                    Documentation
├── Dockerfile               Builds web/ and server/ into one image
├── docker-compose.yml       App + PostgreSQL
├── install.sh               One-command install on a fresh Ubuntu server
├── auto-update.sh           Pulls the `frontend` branch every minute and rebuilds when there is news
├── https.sh                 Free HTTPS (Let's Encrypt) through Caddy
└── tunnel.sh                HTTPS through a Cloudflare Tunnel (optional)
```

The four scripts stay in the project root on purpose: the server's scheduled job calls `auto-update.sh` by
its path, so moving it would stop automatic updates.

## How data flows

1. The browser loads everything it may see with one request, `GET /api/state`.
2. `AppContext` keeps it in memory. Screens change it through handlers; `lib/useServerSync.ts` compares
   each collection with what the server last confirmed and sends only the differences
   (`PUT` / `DELETE /api/<collection>/<id>`).
3. The server checks permissions in `server/src/collections/<collection>.js`, stores the document in
   PostgreSQL (JSONB) and, where relevant, creates notifications.
4. New notifications travel over a live stream (`/api/notify/stream`), and to closed phones as web push.
   The receiving browser plays the sound, shows a pop-up and refreshes its data immediately.
5. File contents never reach the server: sender and receiver exchange them directly (WebRTC);
   the server only relays the connection set-up messages (`routes/signal.js`).

## Adding a new kind of stored data

1. Table in `server/src/db.js` (`SCHEMA`).
2. A module in `server/src/collections/` exporting `put` (and `remove` when deletion is allowed), registered in
   `server/src/routes/collections.js`; add it to `routes/state.js` if the client should receive it.
3. Type in `web/src/types.ts`, the collection name in `web/src/lib/api.ts` and `useServerSync.ts`, and state in
   `AppContext`.

## Conventions

- Persian (right-to-left) interface; numbers are shown with Persian digits (`web/src/lib/persianDigits.ts`
  converts them automatically, use `toPersianDigits` for values created in code).
- Every screen must work at phone width (about 390 px) without sideways scrolling.
- Type-check before committing: `cd web && npx tsc --noEmit -p .`
