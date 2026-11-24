#!/usr/bin/env bash
# Dump the Taidohub database and send it offsite with restic.
# The systemd timer runs it as root (offsite needs root's restic key);
# deploy.sh runs it as the deploy user with --local-only.
#
#   backup.sh               dump + restic backup + retention
#   backup.sh --local-only  dump only (before a deploy)
set -euo pipefail

cd /opt/taidohub
set -a; source ./.env; set +a

dir=/var/backups/taidohub
mkdir -p "$dir"
file="$dir/taidohub-$(date -u +%Y%m%dT%H%M%SZ).dump"

docker compose --env-file .env --env-file .image.env exec -T db \
  pg_dump -U taidohub -d taidohub --format=custom --no-owner > "$file.partial"
mv "$file.partial" "$file"
echo "dump: $file ($(du -h "$file" | cut -f1))"

# Keep three days of dumps on the server.
find "$dir" -name 'taidohub-*.dump' -mtime +3 -delete

[[ "${1:-}" == "--local-only" ]] && exit 0

restic backup --tag db --host "$(hostname)" "$file"
restic forget --tag db --host "$(hostname)" \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
