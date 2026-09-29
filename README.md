# Automation (سامانه اتوماسیون اداری و تبادل فایل)

React frontend + Node/Express API + PostgreSQL.

- **Database:** users, departments, letters/transfers (text, numbers, signatures, referrals), audit log and settings.
- **Files:** never stored on the server. Files and letter attachments stay on the sender's own computer (browser storage) and go **directly to the recipient's browser (WebRTC)** when they download. The server only relays connection setup. The sender must be signed in (browser open) for the recipient to download. For strict corporate NAT/firewalls set `ICE_SERVERS` in `.env` to a JSON list including a TURN server.

## Quick install on a fresh Linux server

```bash
curl -fsSL https://raw.githubusercontent.com/RamtinHadian/automation/frontend/install.sh | sudo bash
```

Installs Docker if needed, generates random secrets, starts everything on port 8080 (override with `PORT=9000 sudo -E bash`) and prints the admin login. (If the repo is private, clone it first and run `sudo ./install.sh` inside.)

## Manual install (Docker)

Requires Docker with the Compose plugin.

```bash
git clone -b frontend https://github.com/RamtinHadian/automation.git
cd automation
cp .env.example .env      # then edit DB_PASSWORD, JWT_SECRET, ADMIN_PASSWORD
docker compose up -d --build
```

Open `http://<server>:8080` (change `PORT` in `.env`). Admin console: `/admin`.
On first start the admin account `ADMIN_EMAIL` / `ADMIN_PASSWORD` is created; add other users from the admin console.

Data lives in the Docker volume `pgdata` (database). Back it up, e.g.:

```bash
docker compose exec db pg_dump -U automation automation > backup.sql
```

Put a reverse proxy (nginx/Caddy) with HTTPS in front for production.

## Development

```bash
cd server && npm install && DATABASE_URL=postgres://... JWT_SECRET=... ADMIN_PASSWORD=... npm start   # API on :8080
npm install && npm run dev                                                                           # UI on :3000
```


## Updates

`install.sh` sets up a cron job (every minute) that runs `auto-update.sh`: it fetches the `frontend` branch and, only if there are new commits, pulls and rebuilds. Push to GitHub and the server follows within ~1 minute. Log: `/var/log/automation-update.log`. Disable with `AUTO_UPDATE=0` at install time or by deleting `/etc/cron.d/automation-update`. Data volumes are never touched by updates.
