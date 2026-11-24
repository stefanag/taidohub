#!/usr/bin/env bash
# Seed the sysadmin and the reference data (organisations, belt catalog,
# classifications, techniques, patterns). Idempotent. Never seeds the STAF
# club roster unless SEED_CLUB_MEMBERS=true is passed explicitly.
#
#   ./seed.sh admin@taidohub.se
set -euo pipefail

cd "$(dirname "$0")"
email="${1:?usage: seed.sh <sysadmin-email>}"
read -r -s -p "Password for $email (min 12 chars): " password; echo
[[ ${#password} -ge 12 ]] || { echo "too short" >&2; exit 1; }

docker compose --env-file .env --env-file .image.env run --rm --no-deps \
  -e SYSADMIN_EMAIL="$email" \
  -e SYSADMIN_PASSWORD="$password" \
  -e SEED_CLUB_MEMBERS="${SEED_CLUB_MEMBERS:-false}" \
  app node dist/src/infrastructure/database/seed.js
