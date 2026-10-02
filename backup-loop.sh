#!/bin/sh
# Runs inside the "backup" container: takes a full copy of the whole database every night and whenever
# the admin console asks for one (it drops a ".request" file into the backups folder).
# Every copy is checked after it is made (pg_restore must be able to read it) before it counts.
BACKUPS=/backups
HOUR="${BACKUP_HOUR:-2}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
mkdir -p "$BACKUPS"

status() { # $1 = ok|error, $2 = text
  printf '{"result":"%s","at":"%s","text":"%s"}\n' "$1" "$(date -Iseconds)" "$2" > "$BACKUPS/.status.json"
}

take() { # $1 = auto|manual
  name="hoormand-$(date +%Y%m%d-%H%M%S)-$1.dump"
  tmp="$BACKUPS/.tmp-$name"
  if ! pg_dump -Fc -f "$tmp" 2> "$BACKUPS/.last-error.txt"; then
    rm -f "$tmp"; status error "pg_dump failed: $(tr '\n"' '  ' < "$BACKUPS/.last-error.txt" | cut -c1-200)"; return 1
  fi
  if ! pg_restore --list "$tmp" > /dev/null 2> "$BACKUPS/.last-error.txt"; then
    rm -f "$tmp"; status error "the new copy could not be read back"; return 1
  fi
  mv "$tmp" "$BACKUPS/$name" && status ok "$name"
  # keep the last KEEP_DAYS days, but never fewer than the 5 newest copies
  total=$(ls "$BACKUPS"/hoormand-*.dump 2>/dev/null | wc -l)
  if [ "$total" -gt 5 ]; then
    find "$BACKUPS" -name 'hoormand-*.dump' -mtime +"$KEEP_DAYS" 2>/dev/null | while read -r f; do
      left=$(ls "$BACKUPS"/hoormand-*.dump | wc -l)
      [ "$left" -gt 5 ] && rm -f "$f"
    done
  fi
}

echo "backup service started: nightly at ${HOUR}:00, keeping ${KEEP_DAYS} days"
last_auto=""
while true; do
  if [ -f "$BACKUPS/.request" ]; then
    rm -f "$BACKUPS/.request"
    take manual
  fi
  today=$(date +%Y%m%d)
  now_h=$(date +%H | sed 's/^0//')
  if [ "$now_h" = "$HOUR" ] && [ "$last_auto" != "$today" ]; then
    last_auto="$today"
    take auto
  fi
  sleep 5
done
