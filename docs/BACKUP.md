# Backup of the whole database

Everything the app stores lives in one PostgreSQL database, so one dump is a complete backup.

- A `backup` container (see `backup-loop.sh`) makes a full dump every night at 02:00 (Tehran time) and whenever the admin console asks (Settings -> Backup). Each dump is read back with `pg_restore --list` before it counts.
- Files land in the `backups/` folder next to `docker-compose.yml` (change with `BACKUP_DIR`; hour with `BACKUP_HOUR`; days kept with `BACKUP_KEEP_DAYS`, default 30, never fewer than the 5 newest).
- Only the chief admin (SUPER_ADMIN) can list, request and download copies; downloads are written to the audit log.
- Restore: `./restore.sh backups/<file>.dump` takes a safety copy of the current data (`*.safety`), stops the app, restores, starts the app. Everything entered after that backup is lost.
- A copy on the same disk does not survive a dead disk: download the newest file weekly (Settings -> Backup) or copy `backups/` to another machine.

## Schedule, network folder and restore from the console
- Settings -> Backup: schedule (a time on chosen weekdays, or every N hours; or off), an optional network folder (Windows/NAS share: server address, share name, sub-folder, user, password; copies are sent after every backup, the password stays on the server) with a connection test, and a Restore button per backup.
- Restore always asks "are you sure" (and a tick), takes a safety copy of the current data first, shows a waiting screen, restarts the app by itself and writes a permanent audit line. Everything entered after that backup is lost. If the restore fails the current data stays untouched.
- In the public demo the network-folder settings are blocked; restore works.

- The network folder is chosen with a file-explorer style dialog (drives = shares of the server, then folders); the server asks the backup container to list them with smbclient.
- "Restore from a file on the computer" uploads a .dump into the backups folder (checked for the PGDMP header) and then goes through the same confirmation. Restoring runs the file as SQL, so only use files made by this system. Both are blocked in the public demo.
