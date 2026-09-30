#!/usr/bin/env bash
# Puts the app behind HTTPS with a Cloudflare Tunnel (needed for phone notifications when the app is closed).
#   sudo ./tunnel.sh            temporary free address https://xxxx.trycloudflare.com (for testing)
#   sudo ./tunnel.sh <TOKEN>    your own domain, using a named-tunnel token from Cloudflare Zero Trust
#   sudo ./tunnel.sh off        stop and remove the tunnel
# cloudflared is downloaded from GitHub and runs as a system service (not in Docker, because Docker Hub blocks some servers).
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$(id -u)" = 0 ] || { echo "Run with sudo:  sudo ./tunnel.sh" >&2; exit 1; }

BIN=/usr/local/bin/cloudflared
UNIT=/etc/systemd/system/automation-tunnel.service
SERVICE=automation-tunnel
touch .env
# Older versions of this script used Docker profiles; make sure none are left behind.
sed -i '/^COMPOSE_PROFILES=/d;/^CF_TUNNEL_TOKEN=/d' .env
PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 || true)"
PORT="${PORT:-8080}"

if [ "${1:-}" = "off" ]; then
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "$UNIT"
  systemctl daemon-reload
  echo "Tunnel stopped."
  exit 0
fi

if [ ! -x "$BIN" ]; then
  case "$(uname -m)" in
    x86_64) arch=amd64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
  esac
  echo "Downloading cloudflared ($arch)..."
  url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$arch"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 -o "$BIN.tmp" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$BIN.tmp" "$url"
  else
    apt-get update -qq && apt-get install -y -qq curl
    curl -fL --retry 3 -o "$BIN.tmp" "$url"
  fi
  chmod +x "$BIN.tmp"
  mv "$BIN.tmp" "$BIN"
fi

if [ -n "${1:-}" ]; then
  exec_line="$BIN tunnel --no-autoupdate run --token $1"
else
  exec_line="$BIN tunnel --no-autoupdate --url http://localhost:$PORT"
fi

cat > "$UNIT" <<EOF
[Unit]
Description=Cloudflare Tunnel for the automation app
After=network-online.target docker.service
Wants=network-online.target

[Service]
ExecStart=$exec_line
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
chmod 600 "$UNIT"

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

if [ -n "${1:-}" ]; then
  echo "Named tunnel started. In Cloudflare Zero Trust > Networks > Tunnels, set the public hostname's service to http://localhost:$PORT"
  exit 0
fi

echo "Waiting for the address..."
for _ in $(seq 1 30); do
  addr="$(journalctl -u "$SERVICE" --no-pager 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true)"
  if [ -n "$addr" ]; then
    echo "Open this address on your phone:  $addr"
    exit 0
  fi
  sleep 2
done
echo "No address yet. Check:  journalctl -u $SERVICE --no-pager | tail -20" >&2
exit 1
