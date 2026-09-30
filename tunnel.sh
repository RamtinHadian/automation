#!/usr/bin/env bash
# Puts the app behind HTTPS with a Cloudflare Tunnel (needed for phone notifications when the app is closed).
#   ./tunnel.sh            temporary free address https://xxxx.trycloudflare.com (for testing)
#   ./tunnel.sh <TOKEN>    your own domain, using a named-tunnel token from Cloudflare Zero Trust
#   ./tunnel.sh off        stop the tunnel
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
touch .env

set_env() {
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}

case "${1:-}" in
  off)
    set_env COMPOSE_PROFILES ""
    docker compose --profile quick --profile tunnel stop tunnel-quick tunnel 2>/dev/null || true
    docker compose --profile quick --profile tunnel rm -f tunnel-quick tunnel 2>/dev/null || true
    echo "Tunnel stopped."
    ;;
  "")
    set_env COMPOSE_PROFILES quick
    docker compose up -d
    echo "Waiting for the address..."
    for _ in $(seq 1 30); do
      url="$(docker compose logs tunnel-quick 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true)"
      if [ -n "$url" ]; then echo "Open this address on your phone:  $url"; exit 0; fi
      sleep 2
    done
    echo "No address yet - check: docker compose logs tunnel-quick" >&2
    exit 1
    ;;
  *)
    set_env CF_TUNNEL_TOKEN "$1"
    set_env COMPOSE_PROFILES tunnel
    docker compose up -d
    echo "Named tunnel started. Set its public hostname to http://app:8080 in Cloudflare Zero Trust > Networks > Tunnels."
    ;;
esac
