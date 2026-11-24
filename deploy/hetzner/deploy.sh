#!/usr/bin/env bash
# Deploy an image tag on this server, or roll back to the previous one.
#
#   ./deploy.sh <image-tag>     e.g. ./deploy.sh staging-3f2c1ab
#   ./deploy.sh --rollback      back to the tag before the current one
#
# Order: backup → pull → migrate → start → wait until healthy. A failed
# migration stops the deploy before the new app takes traffic.
set -euo pipefail

cd "$(dirname "$0")"
[[ -f .env ]] || { echo "missing $(pwd)/.env" >&2; exit 1; }

dc() { docker compose --env-file .env --env-file .image.env "$@"; }

if [[ "${1:-}" == "--rollback" ]]; then
  [[ -f .image.env.prev ]] || { echo "no previous tag recorded" >&2; exit 1; }
  tag="$(sed -n 's/^IMAGE_TAG=//p' .image.env.prev)"
  echo "Rolling back to ${tag}. Migrations are not reverted; restore a backup if the schema must go back."
else
  tag="${1:?usage: deploy.sh <image-tag> | --rollback}"
fi

[[ -f .image.env ]] && cp .image.env .image.env.prev
echo "IMAGE_TAG=${tag}" > .image.env.next

# 1. Backup the current database (skipped on the very first deploy).
if docker compose --env-file .env --env-file .image.env.next ps --status running --services 2>/dev/null | grep -qx db; then
  ./backup.sh --local-only
fi

mv .image.env.next .image.env

# 2. Pull the new images.
dc pull app web

# 3. Database up, then migrations with the new app image.
dc up -d db
dc run --rm --no-deps app node dist/src/infrastructure/database/migrate.js

# 4. Start the new app and Caddy.
dc up -d --remove-orphans

# 5. Wait for the app's healthcheck.
for _ in $(seq 1 40); do
  state="$(docker inspect -f '{{.State.Health.Status}}' "$(dc ps -q app)" 2>/dev/null || true)"
  if [[ "$state" == "healthy" ]]; then
    echo "Deployed ${tag}."
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "App did not become healthy. Logs:" >&2
dc logs --tail 80 app >&2
exit 1
