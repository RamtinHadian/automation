#!/bin/sh
# Runs inside the "backup" container. It
#   - makes a full copy of the whole database on the schedule the admin chose (Settings -> Backup, kept in the database),
#   - copies every new backup to a network folder (Windows/NAS share) when one is set up,
#   - makes an extra copy on request, tests the network folder on request,
#   - restores a backup on request (always after taking a safety copy first).
# The admin console talks to this script through small files in the backups folder (.request, .nettest-request, .restore-request).
# Every copy is read back with pg_restore --list before it counts.
BACKUPS=/backups
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
mkdir -p "$BACKUPS"

json() { printf '%s' "$1" | tr -d '\r\n' | tr '"\\' "''" | cut -c1-300; }
q() { psql -tAq -c "$1" 2>/dev/null; }
cfg() { q "SELECT COALESCE(data->>'$1','') FROM settings WHERE key='backup'"; }
strip0() { printf '%s' "$1" | sed 's/^0*\([0-9]\)/\1/'; }

# ---------- network folder (SMB) ----------
net_args() { # prepares $auth and sets $host $share $dir
  host=$(cfg netHost); share=$(cfg netShare); dir=$(cfg netFolder)
  user=$(cfg netUser); pass=$(cfg netPassword); dom=$(cfg netDomain)
  auth=$(mktemp)
  printf 'username = %s\npassword = %s\n' "$user" "$pass" > "$auth"
  [ -n "$dom" ] && printf 'domain = %s\n' "$dom" >> "$auth"
  [ -n "$host" ] && [ -n "$share" ]
}
net_mkdirs() {
  [ -n "$dir" ] || return 0
  acc=""; cmds=""
  oldifs=$IFS; IFS=/
  for seg in $dir; do
    [ -n "$seg" ] || continue
    acc="${acc:+$acc/}$seg"; cmds="$cmds mkdir \"$acc\";"
  done
  IFS=$oldifs
  smbclient "//$host/$share" -A "$auth" -c "$cmds" > /dev/null 2>&1
}
net_send() { # $1 = file; prints a short result; returns 0 ok, 1 error, 2 not enabled
  [ "$(cfg netEnabled)" = "true" ] || return 2
  if ! net_args; then rm -f "$auth"; echo "network folder is not fully set up"; return 1; fi
  net_mkdirs
  name=$(basename "$1")
  out=$(smbclient "//$host/$share" -A "$auth" ${dir:+-D "$dir"} -c "put \"$1\" \"$name\"" 2>&1); rc=$?
  rm -f "$auth"
  case "$out" in *NT_STATUS*|*"failed"*) echo "$out" | tr '\n' ' ' | cut -c1-200; return 1 ;; esac
  [ $rc -eq 0 ] || { echo "$out" | tr '\n' ' ' | cut -c1-200; return 1; }
  echo "copied to //$host/$share/$dir"; return 0
}
net_test() {
  if ! net_args; then rm -f "$auth"; printf '{"result":"error","at":"%s","text":"address or share name is empty"}\n' "$(date -Iseconds)" > "$BACKUPS/.nettest.json"; return; fi
  net_mkdirs
  out=$(smbclient "//$host/$share" -A "$auth" ${dir:+-D "$dir"} -c "ls" 2>&1); rc=$?
  rm -f "$auth"
  case "$out" in *NT_STATUS*) rc=1 ;; esac
  if [ $rc -eq 0 ]; then r=ok; t="connected, the folder is reachable"; else r=error; t="$out"; fi
  printf '{"result":"%s","at":"%s","text":"%s"}\n' "$r" "$(date -Iseconds)" "$(json "$t")" > "$BACKUPS/.nettest.json"
}

# ---------- browse the network (lets the admin pick the share and folder instead of typing them) ----------
browse() {
  f="$BACKUPS/.browse-request"
  id=$(sed -n 1p "$f"); host=$(sed -n 2p "$f"); bpath=$(sed -n 3p "$f"); user=$(sed -n 4p "$f"); dom=$(sed -n 5p "$f"); pass=$(sed -n 6p "$f")
  rm -f "$f"
  auth=$(mktemp)
  printf 'username = %s\npassword = %s\n' "$user" "$pass" > "$auth"
  [ -n "$dom" ] && printf 'domain = %s\n' "$dom" >> "$auth"
  if [ -z "$bpath" ]; then
    raw=$(smbclient -L "//$host" -A "$auth" -g 2>&1); rc=$?
    items=$(printf '%s\n' "$raw" | sed -n 's/^Disk|\([^|]*\)|.*/\1/p' | grep -v '\$$')
  else
    share=${bpath%%/*}; rest=""
    case "$bpath" in */*) rest=${bpath#*/} ;; esac
    raw=$(smbclient "//$host/$share" -A "$auth" ${rest:+-D "$rest"} -c ls 2>&1); rc=$?
    items=$(printf '%s\n' "$raw" | sed -n 's/^  \(.*[^ ]\)  *\([A-Z]*D[A-Z]*\)  *[0-9][0-9]*  [A-Z][a-z][a-z] .*$/\1/p' | grep -v '^\.\.\?$')
  fi
  rm -f "$auth"
  res=ok; text=""
  case "$raw" in *NT_STATUS*|*"Connection to"*) res=error; text="$raw" ;; esac
  [ $rc -ne 0 ] && [ -z "$items" ] && { res=error; [ -n "$text" ] || text="$raw"; }
  list=""
  if [ "$res" = ok ]; then
    list=$(printf '%s\n' "$items" | sed '/^$/d' | while read -r line; do printf '"%s",' "$(json "$line")"; done)
    list=${list%,}
  fi
  printf '{"id":"%s","result":"%s","path":"%s","text":"%s","items":[%s]}\n' "$(json "$id")" "$res" "$(json "$bpath")" "$(json "$text")" "$list" > "$BACKUPS/.browse.json"
}

# ---------- backup ----------
status() { # $1 ok|error, $2 text, $3 net result, $4 net text
  printf '{"result":"%s","at":"%s","text":"%s","net":"%s","netText":"%s"}\n' "$1" "$(date -Iseconds)" "$(json "$2")" "${3:-off}" "$(json "$4")" > "$BACKUPS/.status.json"
}
take() { # $1 = auto | manual | prerestore
  name="hoormand-$(date +%Y%m%d-%H%M%S)-$1.dump"
  tmp="$BACKUPS/.tmp-$name"
  if ! pg_dump -Fc -f "$tmp" 2> "$BACKUPS/.last-error.txt"; then
    rm -f "$tmp"; status error "pg_dump failed: $(cat "$BACKUPS/.last-error.txt")"; return 1
  fi
  if ! pg_restore --list "$tmp" > /dev/null 2> "$BACKUPS/.last-error.txt"; then
    rm -f "$tmp"; status error "the new copy could not be read back"; return 1
  fi
  mv "$tmp" "$BACKUPS/$name"
  nt=$(net_send "$BACKUPS/$name"); nrc=$?
  case $nrc in 0) status ok "$name" ok "$nt" ;; 1) status ok "$name" error "$nt" ;; *) status ok "$name" off "" ;; esac
  # keep the last KEEP_DAYS days, but never fewer than the 5 newest copies
  if [ "$(ls "$BACKUPS"/hoormand-*.dump 2>/dev/null | wc -l)" -gt 5 ]; then
    find "$BACKUPS" -name 'hoormand-*.dump' -mtime +"$KEEP_DAYS" 2>/dev/null | while read -r f; do
      [ "$(ls "$BACKUPS"/hoormand-*.dump | wc -l)" -gt 5 ] && rm -f "$f"
    done
  fi
  return 0
}

# ---------- schedule ----------
due() {
  [ "$(cfg scheduleEnabled)" = "false" ] && return 1
  mode=$(cfg scheduleMode)
  now=$(date +%s)
  if [ "$mode" = interval ]; then
    n=$(cfg scheduleEveryHours); [ -n "$n" ] || n=6
    last=$(cat "$BACKUPS/.last-auto-epoch" 2>/dev/null || echo 0)
    [ $((now - last)) -ge $((n * 3600)) ]
    return $?
  fi
  t=$(cfg scheduleTime); [ -n "$t" ] || t=02:00
  days=$(q "SELECT COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(data->'scheduleDays')),','),'') FROM settings WHERE key='backup'")
  [ -n "$days" ] || days=0,1,2,3,4,5,6
  case ",$days," in *",$(date +%w),"*) ;; *) return 1 ;; esac
  [ "$(cat "$BACKUPS/.last-auto-date" 2>/dev/null)" = "$(date +%Y%m%d)" ] && return 1
  hh=$(strip0 "$(echo "$t" | cut -d: -f1)"); mm=$(strip0 "$(echo "$t" | cut -d: -f2)")
  nh=$(strip0 "$(date +%H)"); nm=$(strip0 "$(date +%M)")
  [ $((nh * 60 + nm)) -ge $((hh * 60 + mm)) ]
}

# ---------- restore ----------
restore() {
  mv "$BACKUPS/.restore-request" "$BACKUPS/.restoring"
  file=$(sed -n 1p "$BACKUPS/.restoring"); by=$(sed -n 2p "$BACKUPS/.restoring"); ip=$(sed -n 3p "$BACKUPS/.restoring"); stamp=$(sed -n 4p "$BACKUPS/.restoring")
  res() { printf '{"result":"%s","at":"%s","text":"%s"}\n' "$1" "$(date -Iseconds)" "$(json "$2")" > "$BACKUPS/.restore.json"; rm -f "$BACKUPS/.restoring"; }
  f="$BACKUPS/$file"
  [ -f "$f" ] || { res error "backup file not found"; return; }
  pg_restore --list "$f" > /dev/null 2>&1 || { res error "the chosen backup is damaged and cannot be read"; return; }
  take prerestore || { res error "could not make the safety copy, nothing was changed"; return; }
  q "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()" > /dev/null
  # one transaction: wipe the old tables and load the backup; if anything fails the current data stays untouched
  if { echo 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'; pg_restore --no-owner -f - "$f"; } | psql -q -1 -v ON_ERROR_STOP=1 > "$BACKUPS/.last-error.txt" 2>&1; then
    id="aud-restore-$(date +%s)"
    psql -q -v id="$id" -v by="$by" -v ip="$ip" -v stamp="$stamp" -v file="$file" > /dev/null 2>&1 <<'SQL'
INSERT INTO audit_logs (id, data) VALUES (:'id', jsonb_build_object('id', :'id', 'timestamp', :'stamp', 'userName', :'by', 'userEmail', '', 'action', 'SECURITY_EVENT', 'severity', 'CRITICAL', 'ipAddress', :'ip', 'details', 'بازگردانی پشتیبان: اطلاعات کل سامانه به نسخهٔ ' || :'file' || ' برگردانده شد.'));
SQL
    res ok "restored $file"
  else
    res error "restore failed, nothing was changed: $(tail -c 200 "$BACKUPS/.last-error.txt")"
  fi
}

echo "backup service started (schedule is read from the admin console settings)"
tick=0
while true; do
  [ -f "$BACKUPS/.restore-request" ] && restore
  [ -f "$BACKUPS/.request" ] && { rm -f "$BACKUPS/.request"; take manual; }
  [ -f "$BACKUPS/.browse-request" ] && browse
  [ -f "$BACKUPS/.nettest-request" ] && { rm -f "$BACKUPS/.nettest-request"; net_test; }
  if [ $((tick % 30)) -eq 0 ] && due; then
    date +%Y%m%d > "$BACKUPS/.last-auto-date"; date +%s > "$BACKUPS/.last-auto-epoch"
    take auto
  fi
  tick=$((tick + 1))
  sleep 1
done
