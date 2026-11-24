#!/usr/bin/env bash
# Restore the database from a dump. Run as root. Stops the app meanwhile.
#
#   restore.sh /var/backups/taidohub/taidohub-<ts>.dump   a local dump
#   restore.sh --latest-offsite                             newest restic snapshot
#
# Replaces every object in the database. Take a fresh dump first if unsure.
set -euo pipefail

cd /opt/taidohub
set -a; source ./.env; set +a
dc() { docker compose --env-file .env --env-file .image.env "$@"; }

src="${1:?usage: restore.sh <dump-file> | --latest-offsite}"
if [[ "$src" == "--latest-offsite" ]]; then
  tmp="$(mktemp -d)"
  restic restore latest --tag db --host "$(hostname)" --target "$tmp"
  src="$(find "$tmp" -name 'taidohub-*.dump' | sort | tail -1)"
fi
[[ -f "$src" ]] || { echo "no such dump: $src" >&2; exit 1; }

read -r -p "Restore $src into $SITE_DOMAIN? Type the domain to confirm: " answer
[[ "$answer" == "$SITE_DOMAIN" ]] || { echo "aborted"; exit 1; }

dc stop app web
dc exec -T db pg_restore -U taidohub -d taidohub --clean --if-exists --no-owner < "$src"
dc up -d
echo "Restored $src."
