#!/usr/bin/env bash
# Pulls the deployment branch and rebuilds the stack only when there is something new.
# Runs every 30 seconds from a systemd service (it switches itself over from the old
# once-a-minute cron job the first time it runs as root); safe to run by hand.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${BRANCH:-frontend}"
UNIT=/etc/systemd/system/automation-update.service

# Install the 30-second loop once (needs root + systemd) and retire the cron job.
ensure_loop() {
  [ "$(id -u)" -eq 0 ] && [ -d /run/systemd/system ] || return 0
  local want
  want="$(cat <<UNITEOF
[Unit]
Description=Automation: pull the new version from GitHub every 30 seconds
After=network-online.target docker.service

[Service]
Environment=BRANCH=$BRANCH
ExecStart=/bin/bash -c 'while true; do flock -n /var/lock/automation-update.lock bash "$DIR/auto-update.sh" >> /var/log/automation-update.log 2>&1; sleep 30; done'
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNITEOF
)"
  # install the service, and repair it when an older version of this script wrote a different one
  if [ -f "$UNIT" ] && [ "$(cat "$UNIT")" = "$want" ]; then return 0; fi
  echo "$want" > "$UNIT"
  systemctl daemon-reload
  systemctl enable automation-update.service >/dev/null 2>&1 || return 0
  rm -f /etc/cron.d/automation-update; systemctl restart --no-block automation-update.service
  echo "$(date -Is) update service installed/repaired"
}

main() {
  cd "$DIR"
  ensure_loop
  git fetch -q origin "$BRANCH"
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ]; then
    return 0
  fi

  echo "$(date -Is) updating to $(git rev-parse --short "origin/$BRANCH")"
  git pull -q --ff-only origin "$BRANCH"
  docker compose up -d --build
  docker image prune -f >/dev/null 2>&1 || true
  echo "$(date -Is) update finished"
}

# The whole script is read before it runs: the git pull above may replace this very file.
main "$@"
exit $?
