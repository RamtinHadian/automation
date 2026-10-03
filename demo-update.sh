#!/usr/bin/env bash
# Public demo server: pulls the new version from GitHub and rebuilds only when something changed.
# Runs every 30 seconds from a systemd service that this script installs for itself (run it once as root).
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${BRANCH:-frontend}"
PROJECT="${PROJECT:-autodemo}"
UNIT=/etc/systemd/system/hoormand-demo-update.service

ensure_loop() {
  [ "$(id -u)" -eq 0 ] && [ -d /run/systemd/system ] || return 0
  local want
  want="$(cat <<UNITEOF
[Unit]
Description=Hoormand demo: pull the new version from GitHub every 30 seconds
After=network-online.target docker.service

[Service]
Environment=BRANCH=$BRANCH
ExecStart=/bin/bash -c 'while true; do flock -n /var/lock/hoormand-demo.lock bash "$DIR/demo-update.sh" >> /var/log/hoormand-demo-update.log 2>&1; sleep 30; done'
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
  systemctl enable hoormand-demo-update.service >/dev/null 2>&1 || return 0
  rm -f /etc/cron.d/hoormand-demo-update; systemctl restart --no-block hoormand-demo-update.service
  echo "$(date -Is) update service installed/repaired"
}

main() {
  cd "$DIR"
  ensure_loop
  git fetch -q origin "$BRANCH"
  local want built
  want="$(git rev-parse "origin/$BRANCH")"
  built="$(cat "$DIR/.built-commit" 2>/dev/null || true)"
  # compare with the last commit that was really built (a manual git pull must not make us skip the build)
  if [ "$want" = "$built" ]; then
    return 0
  fi
  echo "$(date -Is) updating to $(git rev-parse --short "origin/$BRANCH")"
  git reset -q --hard "origin/$BRANCH"
  docker compose -p "$PROJECT" --env-file demo.env up -d --build
  echo "$want" > "$DIR/.built-commit"
  docker image prune -f >/dev/null 2>&1 || true
  echo "$(date -Is) update finished"
}

# The whole script is read before it runs: the reset above may replace this very file.
main "$@"
exit $?
