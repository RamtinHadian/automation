#!/usr/bin/env bash
#
# Standard Linux installer for the Enterprise Secretariat & CRM Automation system.
# Give it a GitHub repo URL and a server; it clones the app, generates a
# production .env with random secrets, and brings up the whole stack
# (PostgreSQL + the app) with Docker Compose.
#
# Usage:
#   sudo ./install.sh <github-repo-url> [install-dir] [branch]
#
# Remote one-liner (once install.sh is pushed to the repo):
#   curl -fsSL https://raw.githubusercontent.com/<user>/<repo>/main/install.sh | sudo bash -s -- <github-repo-url>
#
# Re-running this script on the same server updates the code (git pull) and
# rebuilds the containers without touching the existing .env or database volume.

set -euo pipefail

REPO_URL="${1:?Usage: install.sh <github-repo-url> [install-dir] [branch]}"
INSTALL_DIR="${2:-/opt/enterprise-automation}"
BRANCH="${3:-main}"

log() { echo -e "\n\033[1;34m==>\033[0m $1"; }
die() { echo "Error: $1" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
    die "this installer needs root privileges (it installs Docker and system packages). Re-run with sudo."
fi

# 1. System prerequisites -----------------------------------------------------
log "Installing prerequisites (git, curl, openssl)..."
if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y git curl openssl ca-certificates
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y git curl openssl ca-certificates
elif command -v yum >/dev/null 2>&1; then
    yum install -y git curl openssl ca-certificates
else
    die "unsupported distro (need apt-get, dnf or yum). Install git, curl, and openssl manually, then re-run."
fi

# 2. Docker Engine + Compose plugin -------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
    log "Docker not found - installing via get.docker.com..."
    curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if ! docker compose version >/dev/null 2>&1; then
    die "docker compose plugin is missing even after installing Docker. Install it manually and re-run."
fi

# 3. Fetch the application ----------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
    log "Existing install found at $INSTALL_DIR - updating to latest $BRANCH..."
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
else
    log "Cloning $REPO_URL (branch: $BRANCH) into $INSTALL_DIR..."
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

[ -f docker-compose.yml ] || die "docker-compose.yml not found in $INSTALL_DIR - is this the right repo/branch?"
[ -f .env.example ] || die ".env.example not found in $INSTALL_DIR - is this the right repo/branch?"

# 4. Environment configuration -------------------------------------------------
if [ ! -f .env ]; then
    log "First install - generating .env with random secrets..."
    cp .env.example .env

    jwt_secret=$(openssl rand -base64 48 | tr -d '\n')
    db_password=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9')
    pgadmin_password=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9')

    sed -i "s|^APP_ENV=.*|APP_ENV=production|" .env
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" .env
    sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=${db_password}|" .env
    sed -i "s|^PGADMIN_PASSWORD=.*|PGADMIN_PASSWORD=${pgadmin_password}|" .env

    log "Generated random JWT_SECRET, DB_PASSWORD and PGADMIN_PASSWORD in $INSTALL_DIR/.env"
    echo "  Back this file up somewhere safe - it holds the production secrets and is never committed to git."
else
    log "$INSTALL_DIR/.env already exists - leaving your existing configuration untouched."
fi

# 5. Build & start -------------------------------------------------------------
log "Building and starting containers..."
docker compose up -d --build

# 6. Wait for the app to come up ------------------------------------------------
port=$(grep -E '^PORT=' .env | cut -d= -f2)
port=${port:-8090}

log "Waiting for the app to become healthy on port ${port}..."
healthy=false
for _ in $(seq 1 30); do
    if curl -fs "http://localhost:${port}/health" >/dev/null 2>&1; then
        healthy=true
        break
    fi
    sleep 2
done

ip_addr=$(hostname -I 2>/dev/null | awk '{print $1}')

log "Done."
if [ "$healthy" = true ]; then
    echo "The app is up and responding."
else
    echo "The app did not respond within the timeout - check logs with:"
    echo "  docker compose -f $INSTALL_DIR/docker-compose.yml logs -f app"
fi
echo
echo "  URL:         http://${ip_addr:-<server-ip>}:${port}/login"
echo "  Install dir: $INSTALL_DIR"
echo "  Env file:    $INSTALL_DIR/.env"
echo "  Logs:        docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
echo "  Optional DB admin UI: cd $INSTALL_DIR && docker compose --profile tools up -d"
