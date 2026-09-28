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
  curl -fsSL https://get.docker.com | sh
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
PORT=80
EOF
  chmod 600 .env
  FIRST_RUN=1
else
  FIRST_RUN=0
fi

echo "==> Building and starting"
docker compose up -d --build

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
PORT="$(grep -E '^PORT=' .env | cut -d= -f2)"
echo
echo "Done. Open http://${IP:-<server-ip>}$([ "${PORT:-80}" = 80 ] || echo ":$PORT")"
echo "Admin console: /#/admin"
if [ "$FIRST_RUN" = 1 ]; then
  echo "Admin login:   admin@company.internal / $ADMIN_PASSWORD   (saved in $INSTALL_DIR/.env)"
fi
