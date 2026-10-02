#!/usr/bin/env bash
# Puts a backup copy back into the database. WARNING: everything entered after that copy was made is lost.
#   ./restore.sh backups/hoormand-20261002-020000-auto.dump
# It first takes a safety copy of the current data, stops the app, restores, then starts the app again.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="${COMPOSE:-docker compose}"
FILE="${1:-}"
[ -n "$FILE" ] && [ -f "$FILE" ] || { echo "usage: ./restore.sh <backup file>   (files are in the backups folder)"; exit 1; }

set -a; [ -f "${ENV_FILE:-.env}" ] && . "${ENV_FILE:-.env}"; set +a
DBU="${DB_USER:-automation}"; DBN="${DB_NAME:-automation}"

echo "Safety copy of the current data ..."
$COMPOSE exec -T db pg_dump -U "$DBU" -d "$DBN" -Fc > "${FILE%.dump}.before-restore-$(date +%H%M%S).dump.safety"
echo "Stopping the app ..."
$COMPOSE stop app
echo "Restoring $FILE ..."
# one transaction: wipe the old tables and load the backup; if anything fails the current data stays untouched
$COMPOSE exec -T db sh -c "{ echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'; pg_restore --no-owner -f - ; } | psql -U $DBU -d $DBN -q -1 -v ON_ERROR_STOP=1" < "$FILE"
echo "Starting the app ..."
$COMPOSE start app
echo "Done. The data is back to the state of that backup."
