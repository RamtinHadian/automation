#!/usr/bin/env bash
# One-shot setup of the PUBLIC DEMO on a fresh/spare Linux server (Debian/Ubuntu). Run it over ssh:
#
#   curl -fsSL https://raw.githubusercontent.com/RamtinHadian/automation/frontend/demo-server.sh | sudo bash
#   curl -fsSL https://raw.githubusercontent.com/RamtinHadian/automation/frontend/demo-server.sh | sudo CF_TOKEN=<tunnel token> bash
#
# What it does: installs Docker if missing, downloads the project to /opt/hoormand-demo, starts the demo (separate database, sample data,
# reset every 48 hours) listening ONLY on 127.0.0.1:8095 (not reachable from the internet directly), optionally connects a Cloudflare Tunnel
# (HTTPS, no open ports, nothing is touched on ports 80/443 so it can live next to V2Ray), and updates itself every night.
# NEVER use this on a server that holds real company data.
set -euo pipefail

DIR="${DEMO_DIR:-/opt/hoormand-demo}"
REPO_URL="${REPO_URL:-https://github.com/RamtinHadian/automation.git}"
BRANCH="${BRANCH:-frontend}"
PORT="${DEMO_PORT:-8095}"
PROJECT=autodemo

say() { printf '\n==> %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Run as root:  ... | sudo bash" >&2; exit 1; }

say "Checking tools"
export DEBIAN_FRONTEND=noninteractive
need_apt=""
for c in git curl openssl; do command -v "$c" >/dev/null 2>&1 || need_apt="$need_apt $c"; done
if [ -n "$need_apt" ]; then
  command -v apt-get >/dev/null 2>&1 || { echo "Please install:$need_apt" >&2; exit 1; }
  apt-get update -qq && apt-get install -y -qq $need_apt
fi
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || { echo "Docker Compose plugin is missing (install docker-compose-plugin)." >&2; exit 1; }

say "Downloading the project to $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO_URL" "$DIR"
fi
cd "$DIR"

say "Writing the demo settings (random secrets, saved once)"
if [ ! -f demo.env ]; then
  {
    echo "DB_PASSWORD=$(openssl rand -hex 16)"
    echo "JWT_SECRET=$(openssl rand -hex 32)"
    echo "ADMIN_PASSWORD=$(openssl rand -hex 12)"
    echo "PORT=$PORT"
    echo "BIND_ADDR=127.0.0.1"
    echo "DEMO=1"
    echo "DEMO_RESET_HOURS=48"
    echo "BACKUP_DIR=./backups-demo"
  } > demo.env
  chmod 600 demo.env
fi

say "Starting the demo (the first build takes a few minutes)"
docker compose -p "$PROJECT" --env-file demo.env up -d --build

say "Waiting for it to answer"
ok=""
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
[ -n "$ok" ] || { echo "The demo did not start. Look at:  docker compose -p $PROJECT --env-file demo.env logs --tail 50" >&2; exit 1; }
echo "Demo is up on http://127.0.0.1:$PORT  (login: demo / demo)"

say "Nightly self-update"
cat > /etc/cron.d/hoormand-demo-update <<EOF
15 4 * * * root flock -n /var/lock/hoormand-demo.lock sh -c 'cd $DIR && git fetch -q origin $BRANCH && git reset -q --hard origin/$BRANCH && docker compose -p $PROJECT --env-file demo.env up -d --build && docker image prune -f >/dev/null 2>&1' >> /var/log/hoormand-demo-update.log 2>&1
EOF
chmod 644 /etc/cron.d/hoormand-demo-update

if [ -n "${CF_TOKEN:-}" ]; then
  say "Connecting the Cloudflare Tunnel"
  BIN=/usr/local/bin/cloudflared
  if [ ! -x "$BIN" ]; then
    case "$(uname -m)" in
      x86_64) arch=amd64 ;;
      aarch64 | arm64) arch=arm64 ;;
      *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
    esac
    curl -fL --retry 3 -o "$BIN.tmp" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$arch"
    chmod +x "$BIN.tmp" && mv "$BIN.tmp" "$BIN"
  fi
  cat > /etc/systemd/system/hoormand-demo-tunnel.service <<EOF
[Unit]
Description=Cloudflare Tunnel for the Hoormand demo
After=network-online.target docker.service
Wants=network-online.target

[Service]
ExecStart=$BIN tunnel --no-autoupdate run --token $CF_TOKEN
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  chmod 600 /etc/systemd/system/hoormand-demo-tunnel.service
  systemctl daemon-reload
  systemctl enable --now hoormand-demo-tunnel >/dev/null 2>&1
  sleep 3
  TUNNEL_UP=""
  for _ in 1 2 3 4 5 6 7 8; do
    if journalctl -u hoormand-demo-tunnel -n 40 --no-pager 2>/dev/null | grep -q "Registered tunnel connection"; then TUNNEL_UP=1; break; fi
    sleep 3
  done
  if [ -n "$TUNNEL_UP" ]; then echo "Tunnel is connected to Cloudflare."; else
    echo "The tunnel is NOT connected yet. Look at:  journalctl -u hoormand-demo-tunnel -n 30 --no-pager"
    echo "(the token must be only the long text starting with eyJ..., not the whole 'cloudflared service install ...' command)"
  fi
fi

if [ -n "${TUNNEL_UP:-}" ]; then
  TUNNEL_NOTE="(the tunnel is already connected)"
elif [ -n "${CF_TOKEN:-}" ]; then
  TUNNEL_NOTE="The tunnel is not connected yet: see the message above (journalctl -u hoormand-demo-tunnel -n 30 --no-pager)."
else
  TUNNEL_NOTE="Not connected yet: run the script again with  CF_TOKEN=<token>  in front of \"bash\"."
fi

cat <<EOF

================ DONE ================
Demo (local on this server): http://127.0.0.1:$PORT      login: demo / demo
Cloudflare: Zero Trust > Networks > Tunnels > your tunnel > Public hostname:
            hostname demo.YOURDOMAIN, service type HTTP, URL  localhost:$PORT
$TUNNEL_NOTE

Logs:   docker compose -p $PROJECT --env-file $DIR/demo.env logs --tail 50
Stop:   docker compose -p $PROJECT --env-file $DIR/demo.env down
Update: runs by itself every night at 04:15 (log: /var/log/hoormand-demo-update.log)
EOF
