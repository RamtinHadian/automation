#!/bin/bash
# Sends new call recordings to the Hoormand server (installed by the Hoormand installer panel)
DIR=/var/spool/asterisk/monitor
URL=http://192.168.2.100:8080/api/voip/recordings
KEY=9a823de0d79c28e9eb3adfb123651af53ea5f96fd022b8cf
DONE=/var/lib/hoormand-rec
mkdir -p "$DONE"
exec 9>/var/lock/hoormand-rec.lock; flock -n 9 || exit 0
find "$DIR" -type f \( -iname '*.wav' -o -iname '*.mp3' -o -iname '*.gsm' -o -iname '*.ogg' \) -mmin +1 -mtime -7 | while read -r f; do
  id=$(basename "$f" | grep -oE '[0-9]{9,11}\.[0-9]+' | head -1)
  [ -n "$id" ] || continue
  [ -e "$DONE/$id" ] && continue
  ext=$(echo "${f##*.}" | tr 'A-Z' 'a-z')
  if curl -sf -m 300 -X PUT -H "X-Recording-Key: $KEY" --data-binary @"$f" "$URL/$id?ext=$ext" >/dev/null; then touch "$DONE/$id"; fi
done
