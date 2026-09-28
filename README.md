# Automation (سامانه اتوماسیون اداری و تبادل فایل)

React frontend + Node/Express API + PostgreSQL. Everything (users, departments, letters/transfers, audit log, settings, uploaded files) is stored in the database and an uploads volume.

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

Open `http://<server>:8080` (change `PORT` in `.env`). Admin console: `/#/admin`.
On first start the admin account `ADMIN_EMAIL` / `ADMIN_PASSWORD` is created; add other users from the admin console.

Data lives in the Docker volumes `pgdata` (database) and `uploads` (files). Back them up, e.g.:

```bash
docker compose exec db pg_dump -U automation automation > backup.sql
```

Put a reverse proxy (nginx/Caddy) with HTTPS in front for production.

## Development

```bash
cd server && npm install && DATABASE_URL=postgres://... JWT_SECRET=... ADMIN_PASSWORD=... npm start   # API on :8080
npm install && npm run dev                                                                           # UI on :3000
```

