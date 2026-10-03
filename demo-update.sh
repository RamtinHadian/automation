#!/usr/bin/env bash
# Public demo server: pulls the new version from GitHub and rebuilds only when something changed.
# Runs every 30 seconds from a systemd service that this script installs for itself (run it once as root).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${BRANCH:-frontend}"
PROJECT="${PROJECT:-autodemo}"
UNIT=/etc/systemd/system/hoormand-demo-update.service

ensure_loop() {
  [ "$(id -u)" -eq 0 ] && [ -d /run/systemd/system ] && [ ! -f "$UNIT" ] || return 0
  cat > "$UNIT" <<UNITEOF
[Unit]
Description=Hoormand demo: pull the new version from GitHub every 30 seconds
After=network-online.target docker.service

[Service]
Environment=BRANCH=$BRANCH
ExecStart=/bin/bash -c 'while true; do flock -n /var/lock/hoormand-demo.lock "$DIR/demo-update.sh" >> /var/log/hoormand-demo-update.log 2>&1; sleep 30; done'
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNITEOF
  systemctl daemon-reload
  systemctl enable --now hoormand-demo-update.service >/dev/null 2>&1 || return 0
  rm -f /etc/cron.d/hoormand-demo-update
  echo "$(date -Is) switched to the 30-second update service"
}

main() {
  cd "$DIR"
  ensure_loop
  git fetch -q origin "$BRANCH"
  if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ]; then
    return 0
  fi
  echo "$(date -Is) updating to $(git rev-parse --short "origin/$BRANCH")"
  git reset -q --hard "origin/$BRANCH"
  docker compose -p "$PROJECT" --env-file demo.env up -d --build
  docker image prune -f >/dev/null 2>&1 || true
  echo "$(date -Is) update finished"
}

# The whole script is read before it runs: the reset above may replace this very file.
main "$@"
exit $?
