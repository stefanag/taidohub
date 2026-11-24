#!/usr/bin/env bash
# Seed the sysadmin and the reference data (organisations, belt catalog,
# classifications, techniques, patterns). Idempotent. Never seeds the STAF
# club roster unless SEED_CLUB_MEMBERS=true is passed explicitly.
#
#   ./seed.sh admin@taidohub.se
#
# Staging only: SEED_DEMO_DATA=true also seeds a fictional demo club with a
# demo orgadmin, a demo instructor and students (all @example.com, names
# marked "(DEMO)"). It asks for one shared password for the demo accounts.
# The app refuses to seed demo data into production.
#
#   SEED_DEMO_DATA=true ./seed.sh admin@taidohub.se
set -euo pipefail

cd "$(dirname "$0")"
email="${1:?usage: seed.sh <sysadmin-email>}"
read -r -s -p "Password for $email (min 12 chars): " password; echo
[[ ${#password} -ge 12 ]] || { echo "too short" >&2; exit 1; }

demo_env=(-e SEED_DEMO_DATA=false)
if [[ "${SEED_DEMO_DATA:-false}" == "true" ]]; then
  read -r -s -p "Password for the demo accounts (min 12 chars): " demo_password; echo
  [[ ${#demo_password} -ge 12 ]] || { echo "too short" >&2; exit 1; }
  demo_env=(-e SEED_DEMO_DATA=true -e DEMO_PASSWORD="$demo_password")
fi

docker compose --env-file .env --env-file .image.env run --rm --no-deps \
  -e SYSADMIN_EMAIL="$email" \
  -e SYSADMIN_PASSWORD="$password" \
  -e SEED_CLUB_MEMBERS="${SEED_CLUB_MEMBERS:-false}" \
  "${demo_env[@]}" \
  app node dist/src/infrastructure/database/seed.js
