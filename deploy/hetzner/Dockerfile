# syntax=docker/dockerfile:1
#
# Builds the two images Taidohub runs on Hetzner. Build context: repo root.
#
#   app  NestJS backend (production node_modules only), listens on :3001
#   web  Caddy serving the frontend build and proxying /api to `app`
#
# The frontend reads VITE_API_URL at build time, so the `web` image is built
# per environment:
#
#   docker build -f deploy/hetzner/Dockerfile --target app -t taidohub-app .
#   docker build -f deploy/hetzner/Dockerfile --target web \
#     --build-arg VITE_API_URL=https://staging.taidohub.se -t taidohub-web .

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS build
ENV CI=true
RUN npm install -g pnpm@11.1.2
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @repo/contracts build \
 && pnpm --filter backend build
ARG VITE_API_URL
RUN if [ -n "$VITE_API_URL" ]; then VITE_API_URL="$VITE_API_URL" pnpm --filter frontend build; fi
# Self-contained backend: dist, drizzle migrations, production node_modules.
RUN pnpm --filter backend deploy --legacy --prod /out/backend
# The seed fixtures are JSON next to the compiled seeders. nest-cli.json copies
# them once the repo patch is applied; this keeps older commits deployable.
RUN cd apps/backend/src \
 && find . -name '*.seed.json' -exec sh -c 'mkdir -p "/out/backend/dist/src/$(dirname "$1")" && cp "$1" "/out/backend/dist/src/$1"' _ {} \;

FROM node:${NODE_VERSION}-slim AS app
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /out/backend ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]

FROM caddy:2 AS web
COPY deploy/hetzner/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/frontend/dist /srv
