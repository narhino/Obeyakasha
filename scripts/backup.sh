#!/usr/bin/env bash
#
# Nightly encrypted database backup (PLAN §20).
#
# Runs a pg_dump, gzips it, optionally encrypts with `age`, and uploads to the
# Bunny backups zone. Media originals already live off-box on Bunny, so this
# only needs to protect the database.
#
# Add to the server's crontab (runs 4am):
#   0 4 * * * cd /root/Obeyakasha && bash scripts/backup.sh >> /var/log/akasha-backup.log 2>&1
#
# Restore drill (do this once so you trust it):
#   gunzip -c backup-YYYYMMDD.sql.gz | psql "$DATABASE_URL"
#
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

STAMP=$(date +%Y%m%d-%H%M)
OUT="backup-${STAMP}.sql.gz"

echo "▸ Dumping database…"
# Inside compose, dump via the postgres service:
docker compose -f compose.prod.yml exec -T postgres \
  pg_dump -U postgres obeyakasha | gzip > "$OUT"

# Optional: encrypt at rest if BACKUP_AGE_RECIPIENT is set (age must be installed).
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ] && command -v age >/dev/null 2>&1; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "${OUT}.age" "$OUT"
  rm -f "$OUT"
  OUT="${OUT}.age"
  echo "▸ Encrypted → ${OUT}"
fi

# Optional: upload to Bunny backups zone.
if [ -n "${BUNNY_BACKUP_ZONE:-}" ] && [ -n "${BUNNY_STORAGE_KEY:-}" ]; then
  curl -fsS -X PUT "https://storage.bunnycdn.com/${BUNNY_BACKUP_ZONE}/${OUT}" \
    -H "AccessKey: ${BUNNY_STORAGE_KEY}" --data-binary "@${OUT}"
  echo "▸ Uploaded ${OUT} to Bunny."
fi

# Keep the last 30 local backups.
ls -1t backup-*.sql.gz* 2>/dev/null | tail -n +31 | xargs -r rm -f

echo "✓ Backup complete: ${OUT}"
