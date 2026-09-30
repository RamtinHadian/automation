#!/usr/bin/env bash
# Gives the app a real HTTPS address with a free Let's Encrypt certificate (needed for phone notifications
# while the app is closed). Caddy is downloaded from GitHub and runs as a system service.
#
#   sudo bash https.sh office.example.ir            HTTPS on the standard port 443
#   sudo bash https.sh office.example.ir 8443       HTTPS reachable from outside on port 8443 (router: 8443 -> this server :443)
#   sudo bash https.sh off                          stop and remove
#
# Requirements: the domain's A record points to the public IP, router forwards public port 80 -> this server :80
# (certificate check) and the public HTTPS port -> this server :443.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$(id -u)" = 0 ] || { echo "Run with sudo:  sudo bash https.sh <domain> [public-port]" >&2; exit 1; }

BIN=/usr/local/bin/caddy
UNIT=/etc/systemd/system/automation-https.service
SERVICE=automation-https
CONF_DIR=/etc/automation-https

if [ "${1:-}" = "off" ]; then
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "$UNIT"
  systemctl daemon-reload
  echo "HTTPS service stopped (the app itself keeps running on its normal port)."
  exit 0
fi

DOMAIN="${1:-}"
PUBLIC_PORT="${2:-443}"
[ -n "$DOMAIN" ] || { echo "Usage: sudo bash https.sh <domain> [public-port]" >&2; exit 1; }

touch .env
PORT="$(grep -E '^PORT=' .env | tail -1 | cut -d= -f2 || true)"
PORT="${PORT:-8080}"

need_curl() {
  command -v curl >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq curl; }
}
need_curl

# --- checks -----------------------------------------------------------------
echo "Checking DNS for $DOMAIN ..."
resolved="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ -z "$resolved" ]; then
  echo "The name $DOMAIN does not resolve yet. Create the A record (name -> public IP), wait a few minutes and run again." >&2
  exit 1
fi
echo "  $DOMAIN -> $resolved"

if ! systemctl is-active --quiet "$SERVICE"; then
  for p in 80 443; do
    if ss -ltn "( sport = :$p )" 2>/dev/null | grep -q LISTEN; then
      echo "Port $p on this server is already in use by another program. Free it first (see: sudo ss -ltnp | grep :$p)." >&2
      exit 1
    fi
  done
fi

# --- download caddy from GitHub (Docker Hub / other mirrors may be blocked) ----
if [ ! -x "$BIN" ]; then
  case "$(uname -m)" in
    x86_64) arch=amd64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
  esac
  tag="$(curl -fsSIL -o /dev/null -w '%{url_effective}' https://github.com/caddyserver/caddy/releases/latest | sed 's|.*/tag/||')"
  [ -n "$tag" ] || { echo "Could not find the latest Caddy release." >&2; exit 1; }
  ver="${tag#v}"
  echo "Downloading Caddy $ver ($arch)..."
  tmp="$(mktemp -d)"
  curl -fL --retry 3 -o "$tmp/caddy.tgz" "https://github.com/caddyserver/caddy/releases/download/$tag/caddy_${ver}_linux_${arch}.tar.gz"
  tar -xzf "$tmp/caddy.tgz" -C "$tmp" caddy
  install -m 0755 "$tmp/caddy" "$BIN"
  rm -rf "$tmp"
fi

# --- configuration -------------------------------------------------------------
mkdir -p "$CONF_DIR" /var/lib/automation-https
cat > "$CONF_DIR/Caddyfile" <<EOF
{
	# Do not redirect http -> https: the public HTTPS port may not be 443 and port 80 is only used for the certificate.
	auto_https disable_redirects
	email admin@$DOMAIN
}

$DOMAIN:443 {
	encode gzip
	# flush_interval -1 keeps live streams (notifications, file-transfer signalling) flowing immediately
	reverse_proxy localhost:$PORT {
		flush_interval -1
	}
}
EOF
"$BIN" validate --config "$CONF_DIR/Caddyfile" --adapter caddyfile >/dev/null

cat > "$UNIT" <<EOF
[Unit]
Description=HTTPS (Caddy) for the automation app
After=network-online.target docker.service
Wants=network-online.target

[Service]
Environment=XDG_DATA_HOME=/var/lib/automation-https
Environment=XDG_CONFIG_HOME=/var/lib/automation-https
ExecStart=$BIN run --config $CONF_DIR/Caddyfile --adapter caddyfile
Restart=always
RestartSec=5
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && echo "Firewall: opened ports 80 and 443."
fi

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1
systemctl restart "$SERVICE"

# --- wait for the certificate ------------------------------------------------------
echo "Requesting the free certificate (up to about 90 seconds)..."
for _ in $(seq 1 45); do
  if journalctl -u "$SERVICE" --no-pager 2>/dev/null | grep -q "certificate obtained successfully"; then
    if [ "$PUBLIC_PORT" = "443" ]; then url="https://$DOMAIN"; else url="https://$DOMAIN:$PUBLIC_PORT"; fi
    echo
    echo "Done. Open this address on your phone:  $url"
    exit 0
  fi
  sleep 2
done

echo "The certificate was not issued. Last log lines:" >&2
journalctl -u "$SERVICE" --no-pager 2>/dev/null | tail -15 >&2
echo >&2
echo "Check: (1) the A record points to the public IP, (2) the router forwards public port 80 -> this server:80," >&2
echo "(3) nothing else uses ports 80/443 on this server." >&2
exit 1
