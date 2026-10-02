# Backup of the whole database

Everything the app stores lives in one PostgreSQL database, so one dump is a complete backup.

- A `backup` container (see `backup-loop.sh`) makes a full dump every night at 02:00 (Tehran time) and whenever the admin console asks (Settings -> Backup). Each dump is read back with `pg_restore --list` before it counts.
- Files land in the `backups/` folder next to `docker-compose.yml` (change with `BACKUP_DIR`; hour with `BACKUP_HOUR`; days kept with `BACKUP_KEEP_DAYS`, default 30, never fewer than the 5 newest).
- Only the chief admin (SUPER_ADMIN) can list, request and download copies; downloads are written to the audit log.
- Restore: `./restore.sh backups/<file>.dump` takes a safety copy of the current data (`*.safety`), stops the app, restores, starts the app. Everything entered after that backup is lost.
- A copy on the same disk does not survive a dead disk: download the newest file weekly (Settings -> Backup) or copy `backups/` to another machine.
