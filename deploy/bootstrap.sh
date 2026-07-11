#!/usr/bin/env bash
#
# OBEY AKASHA — one-shot server bootstrap.
# Run this from inside the cloned repo on a fresh Ubuntu 22.04/24.04 server:
#
#   bash deploy/bootstrap.sh
#
# It installs Docker (if missing), verifies your .env, then builds and starts
# the whole stack with automatic HTTPS. Safe to re-run (idempotent).

set -euo pipefail

cd "$(dirname "$0")/.."   # repo root

echo "▸ OBEY AKASHA bootstrap"

# 1. Docker ----------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "▸ Installing Docker…"
  curl -fsSL https://get.docker.com | sh
else
  echo "▸ Docker already installed."
fi

# 1b. Swap — protect the first build from OOM on small (<3GB) servers -------
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
if [ "${mem_kb:-0}" -lt 3000000 ] && [ ! -f /swapfile ] && \
   [ "$(swapon --show 2>/dev/null | wc -l)" = "0" ]; then
  echo "▸ Adding 2G swap (small server) so the build won't run out of memory…"
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 2. .env ------------------------------------------------------------------
if [ ! -f .env ]; then
  echo "✗ No .env found. Copy the template and fill it in first:"
  echo "    cp .env.production.example .env && nano .env"
  exit 1
fi

# Load .env for validation.
set -a; . ./.env; set +a

missing=0
for var in APP_DOMAIN APP_ORIGIN AUTH_SECRET POSTGRES_PASSWORD \
           PATREON_CLIENT_ID PATREON_CLIENT_SECRET; do
  if [ -z "${!var:-}" ]; then
    echo "✗ Missing required value in .env: $var"
    missing=1
  fi
done
if [ -z "${ADMIN_PATREON_EMAIL:-}" ] && [ -z "${ADMIN_PATREON_USER_ID:-}" ]; then
  echo "✗ Set ADMIN_PATREON_EMAIL (your Patreon email) in .env so you become admin."
  missing=1
fi
[ "$missing" = "1" ] && { echo "Fix .env and re-run."; exit 1; }

echo "▸ .env looks good (domain: $APP_DOMAIN)"

# 3. Up --------------------------------------------------------------------
echo "▸ Building and starting the stack (first build takes a few minutes)…"
docker compose -f compose.prod.yml up -d --build

echo ""
echo "✓ Up. Caddy is fetching an HTTPS certificate for $APP_DOMAIN."
echo "  Give DNS + certificate a minute, then open:  https://$APP_DOMAIN"
echo ""
echo "  Check status:  docker compose -f compose.prod.yml ps"
echo "  View logs:     docker compose -f compose.prod.yml logs -f web"
echo "  Health:        curl https://$APP_DOMAIN/api/health"
