#!/usr/bin/env bash
# Pulls the deployment branch and rebuilds the stack only when there is something new.
# Installed as a cron job by install.sh; safe to run by hand.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${BRANCH:-frontend}"
cd "$DIR"

git fetch -q origin "$BRANCH"
if [ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$BRANCH")" ]; then
  exit 0
fi

echo "$(date -Is) updating to $(git rev-parse --short "origin/$BRANCH")"
git pull -q --ff-only origin "$BRANCH"
docker compose up -d --build
docker image prune -f >/dev/null 2>&1 || true
echo "$(date -Is) update finished"
