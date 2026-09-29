#!/usr/bin/env bash
# One-shot installer for a fresh Linux server (Debian/Ubuntu/CentOS/etc.).
# Installs Docker if missing, generates secrets, builds and starts the app.
#   curl -fsSL https://raw.githubusercontent.com/RamtinHadian/automation/frontend/install.sh | sudo bash
# or, from an existing checkout:  sudo ./install.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/RamtinHadian/automation.git}"
BRANCH="${BRANCH:-frontend}"
INSTALL_DIR="${INSTALL_DIR:-/opt/automation}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (sudo)." >&2
  exit 1
fi

rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "$1"; }

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker"
  # get.docker.com is unreachable from some networks (403); fall back to the distro packages.
  if ! curl -fsSL https://get.docker.com | sh; then
    echo "==> get.docker.com failed, installing Docker from the distribution repositories"
    apt-get update && apt-get install -y docker.io docker-compose-v2       || { echo "Could not install Docker automatically." >&2; exit 1; }
  fi
fi
systemctl enable --now docker >/dev/null 2>&1 || true

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is missing; install 'docker-compose-plugin' and re-run." >&2
  exit 1
fi

# Use the current checkout if we are inside one, otherwise clone.
if [ -f "./docker-compose.yml" ] && [ -d "./server" ]; then
  INSTALL_DIR="$(pwd)"
else
  if ! command -v git >/dev/null 2>&1; then
    echo "==> Installing git"
    (apt-get update && apt-get install -y git) >/dev/null 2>&1 \
      || yum install -y git >/dev/null 2>&1 \
      || dnf install -y git >/dev/null 2>&1 \
      || { echo "Could not install git automatically." >&2; exit 1; }
  fi
  if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" fetch origin "$BRANCH" && git -C "$INSTALL_DIR" checkout -q "$BRANCH" && git -C "$INSTALL_DIR" pull -q origin "$BRANCH"
  else
    git clone -q -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
fi
cd "$INSTALL_DIR"

if [ ! -f .env ]; then
  ADMIN_PASSWORD="$(rand 16)"
  cat > .env <<EOF
DB_PASSWORD=$(rand 32)
JWT_SECRET=$(rand 64)
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_EMAIL=admin@company.internal
PORT=${PORT:-8080}
EOF
  chmod 600 .env
  FIRST_RUN=1
else
  FIRST_RUN=0
fi

echo "==> Building and starting"
docker compose up -d --build

# Auto-update: check GitHub every minuteutes and redeploy when the branch changed.
# Disable with AUTO_UPDATE=0.
if [ "${AUTO_UPDATE:-1}" = 1 ] && [ -d .git ]; then
  if [ -d /etc/cron.d ] && { command -v cron >/dev/null 2>&1 || command -v crond >/dev/null 2>&1; }; then
    chmod +x auto-update.sh
    echo "* * * * * root BRANCH=$BRANCH flock -n /var/lock/automation-update.lock $INSTALL_DIR/auto-update.sh >> /var/log/automation-update.log 2>&1" > /etc/cron.d/automation-update
    echo "==> Auto-update enabled (every minute, log: /var/log/automation-update.log)"
  else
    echo "==> cron not found; auto-update not enabled (install cron, or run ./auto-update.sh yourself)"
  fi
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
PORT="$(grep -E '^PORT=' .env | cut -d= -f2)"
echo
echo "Done. Open http://${IP:-<server-ip>}$([ "${PORT:-8080}" = 80 ] || echo ":$PORT")"
echo "Admin console: /admin"
if [ "$FIRST_RUN" = 1 ]; then
  echo "Admin login:   admin@company.internal / $ADMIN_PASSWORD   (saved in $INSTALL_DIR/.env)"
fi
