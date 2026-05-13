# taidohub

A full-stack TypeScript monorepo: a **Feature-Sliced Design** React frontend and a **NestJS** REST backend, sharing a single Zod-schema **contracts** package as the HTTP boundary. Built on **pnpm workspaces + Turborepo**. Backed by **Supabase Postgres** (database only — no Supabase Auth) with **Drizzle ORM**, identity via **better-auth**, authorization via **CASL**, and a Swagger UI generated from the same Zod schemas that validate at runtime.

---

## 1. What is this

- **Monorepo** — pnpm workspaces + Turborepo, two apps and three shared packages.
- **Frontend** — Vite + React 19 + TanStack Router/Query + Tailwind + shadcn/ui, organised by **Feature-Sliced Design v2.1**.
- **Backend** — NestJS on Express, Drizzle over Supabase Postgres, better-auth for sessions, CASL for ability checks, REST under `/api/*`.
- **`@repo/contracts`** — Zod schemas with `.openapi(...)` metadata are the **single source of truth** for DTOs, runtime validation, generated OpenAPI spec, and shared TS types/route constants.
- **Auth + AuthZ** — better-auth issues HTTP-only cookies on the API origin; cross-origin requests carry them via `credentials: 'include'`. CASL is authoritative; Supabase RLS is defence-in-depth.
- **Docs** — Swagger UI at `/api/docs`, plus a committed `openapi.json`/`openapi.yaml` artifact that CI guards against drift.

---

## 2. Monorepo layout

```
taidohub/
├── apps/
│   ├── frontend/                  # Vite + React 19 + FSD
│   └── backend/                   # NestJS + Drizzle + better-auth + CASL
├── packages/
│   ├── contracts/                 # Zod schemas + OpenAPI metadata (HTTP boundary)
│   │   └── openapi/               # generated openapi.json/.yaml (committed)
│   ├── tsconfig/                  # base + react-vite/nest/node-lib presets
│   └── eslint-config/             # flat config: ./base ./react ./node
├── .github/workflows/
│   ├── ci.yml                     # lint • typecheck • arch • build • test • e2e • openapi-sync
│   └── docker.yml                 # builds + pushes images to GHCR
├── docker-compose.yml             # dev convenience for the full stack
├── turbo.json                     # task graph
├── pnpm-workspace.yaml
└── .env.example
```

---

## 3. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | `>=20` | Tested on Node 24. |
| pnpm | `11.1.1` | `corepack enable && corepack prepare pnpm@11.1.1 --activate` |
| Docker Desktop | recent | Only required for `docker compose up`. |
| Supabase project | free tier ok | Used as Postgres only — no Auth/Storage/Realtime. |

Required environment values (copy `.env.example` → `.env`):

- `DATABASE_URL` — Supabase **pooler** URL (`...:6543/postgres?pgbouncer=true`). Runtime traffic.
- `DIRECT_URL` — Supabase **direct** URL (`...:5432/postgres`). Migrations only.
- `BETTER_AUTH_SECRET` — 32-byte hex. Generate with:
  ```bash
  openssl rand -hex 32
  ```
- `WEB_ORIGIN` — comma-separated allowed frontend origins for CORS.
- `BETTER_AUTH_URL` — public URL of the backend (`http://localhost:3001` in dev).
- `VITE_API_URL` — backend URL baked into the frontend bundle at build time.

---

## 4. Quick start (local dev, no Docker)

```bash
cp .env.example .env
# Edit .env: set DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET

pnpm install
pnpm --filter @repo/contracts build      # contracts must be built once before backend/frontend
pnpm --filter backend db:generate        # creates apps/backend/drizzle/*.sql
pnpm --filter backend db:migrate         # applies migrations via DIRECT_URL
pnpm dev                                 # runs frontend + backend + contracts watcher concurrently
```

URLs that come up:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3001 |
| Swagger UI | http://localhost:3001/api/docs |
| Health | http://localhost:3001/api/health |

---

## 5. Turbo pipelines

| Task | What it does | Where it runs |
|---|---|---|
| `dev` | Long-running dev servers, contracts watch. | every workspace |
| `build` | Compile output (`dist/`, `.next/`, `build/`). Depends on `^build`. | every workspace |
| `lint` | ESLint flat config. | every workspace |
| `typecheck` | `tsc --noEmit` / `tsc -b --noEmit`. | every workspace |
| `test` | Vitest unit tests. | apps + contracts |
| `test:e2e` | Vitest e2e via supertest. | `backend` |
| `arch` | `steiger ./src` — FSD layer/import rules. | `frontend` |
| `storybook` | Storybook dev server. | `frontend` |
| `build-storybook` | Static Storybook to `storybook-static/`. | `frontend` |
| `db:generate` | Drizzle Kit — produce migration SQL. | `backend` |
| `db:migrate` | Apply migrations via `DIRECT_URL`. | `backend` |
| `openapi:generate` | Boot Nest, write `openapi.json`/`.yaml` to `packages/contracts/openapi/`. | `backend` |
| `clean` | Remove build artefacts. | every workspace |

Both `dev` and `openapi:generate` depend on `@repo/contracts#build` so contracts always builds first.

---

## 6. `@repo/contracts` — the boundary

Every HTTP DTO is a Zod schema declared in `packages/contracts/src/*` and decorated with `.openapi({ title, description, example })`. Subpaths exported: `posts`, `users`, `auth`, `errors`, `casl`, `routes`, `openapi`.

- **Backend** wraps schemas with `nestjs-zod`'s `createZodDto` for body/query/param validation and Swagger generation in one step.
- **Frontend** parses every response through the same Zod schemas and types MSW handlers from them.
- **OpenAPI** is generated from those schemas via `@anatine/zod-openapi`. The OpenAPI artifact, runtime validators, and TS types **cannot drift** — they're literally the same objects.

When you change a schema, regenerate the spec and commit the diff:

```bash
pnpm --filter @repo/contracts build
pnpm --filter backend openapi:generate
git add packages/contracts/openapi/
```

The CI `openapi-sync` job fails the build if you forget.

---

## 7. FSD frontend rules

Layers, top to bottom — imports may only flow **downward**:

```
app  →  pages  →  widgets  →  features  →  entities  →  shared
```

- `app/` and `shared/` have **segments** only (no slices).
- `pages/`, `widgets/`, `features/`, `entities/` have **slices** (`features/auth-by-email/`, `entities/post/`, …) which contain **segments** (`ui/`, `model/`, `api/`, `lib/`).
- **Same-layer slices cannot import each other.** Cross-slice composition happens one layer up.
- Every slice exposes a **Public API** via `index.ts` (tests/stories exempt). Imports must hit the slice's `index.ts`, never its internals.

Library placement is non-negotiable:

| Concern | Lives in |
|---|---|
| shadcn primitives | `shared/ui/` |
| `cn(...)` helper | `shared/lib/utils.ts` |
| `fetch` wrapper | `shared/api/httpClient.ts` |
| `QueryClient` | `shared/api/queryClient.ts` |
| All routing | `app/router/` (TanStack Router) |
| Providers (Query, Router, Auth, Ability) | `app/providers/` |
| CASL `defineAbilityFor` | `shared/lib/casl/` (subjects/actions from `@repo/contracts/casl`) |

`pnpm arch` runs Steiger over `apps/frontend/src/` to enforce these rules in CI.

---

## 8. Backend module rules

- **REST conventions.** Plural-noun resources (`/api/posts`, `/api/users`). Standard verbs (`GET`/`POST`/`PATCH`/`DELETE`). JSON only.
- **Uniform error envelope.** Every error response is `{ error: { code, message, details? } }`. Built by `AllExceptionsFilter`. The shape is defined once in `@repo/contracts/errors` (`ErrorEnvelopeDto`) and referenced from every `@ApiBadRequestResponse({ type: ErrorEnvelopeDto })` etc.
- **Module isolation.** Repositories are the **only** files that import `drizzle-orm` / touch the DB client. Services consume only their own module's repository. Cross-module access goes through the owning module's exported **service**, never its repository.
- **Validation.** Controllers consume Zod DTOs from `@repo/contracts` via `nestjs-zod`'s `createZodDto`. The global `ZodValidationPipe` handles parsing.
- **CASL.** Rules are contributed per module in `<module>.abilities.ts`. The `AbilityFactory` composes them.
- **All paths under `/api`** (set by `app.setGlobalPrefix('api')`). `better-auth` handlers are mounted at `/api/auth/*` from `AuthModule` via `app.use(...)`.

---

## 9. Database decision: Supabase = Postgres only

We chose Supabase because it ships managed Postgres with sensible defaults, generous free tier, branching, point-in-time recovery, and good DX. We did **not** want to inherit GoTrue or its JWT model.

Therefore:

- Backend talks to Supabase Postgres via `postgres-js` (`drizzle-orm/postgres-js`) using `DATABASE_URL` (pooler).
- Migrations run via `DIRECT_URL` (direct, bypasses pgbouncer — pooled connections can't run DDL reliably).
- **better-auth** tables (`user`, `session`, `account`, `verification`) live in the same Postgres, with their schema defined as Drizzle tables under `apps/backend/src/infrastructure/database/schema/` and migrated by the same `drizzle-kit` pipeline.
- The frontend has **no `@supabase/supabase-js`**, no anon key, no service key. The only credential that ever reaches the browser is the better-auth session cookie set by our backend.
- **RLS** can be enabled on Supabase tables as defence-in-depth, but authoritative authorization is CASL in the API layer.

---

## 10. CORS + cookies on separate origins

The frontend (`http://localhost:5173` in dev) and the backend (`http://localhost:3001`) run on **different origins**. Cookies cross origin only when both ends opt in.

Backend (`main.ts`):

```ts
app.enableCors({
  origin: env.WEB_ORIGIN.split(','),
  credentials: true,
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
});
```

Frontend `shared/api/httpClient.ts` sets `credentials: 'include'` on every `fetch`.

Cookie matrix (set by better-auth):

| Environment | `sameSite` | `secure` | Example frontend URL |
|---|---|---|---|
| development | `lax` | `false` | `http://localhost:5173` |
| production | `none` | `true` | `https://app.example.com` (HTTPS required) |

Without `credentials: true` on both ends, the preflight succeeds but the session cookie is silently dropped. Without `secure: true` + `sameSite: 'none'` in prod, browsers refuse to send the cookie cross-site.

---

## 11. Swagger usage

**Viewing.** Swagger UI is mounted at `/api/docs` whenever `NODE_ENV !== 'production'` **or** `ENABLE_SWAGGER=true`. In production it is off by default.

**Authorizing.**

- Easiest: open `/api/docs` in the same browser session you used to sign in via the frontend — the session cookie auto-sends because Swagger UI is configured with `withCredentials: true` and `persistAuthorization: true`.
- Otherwise: hit `POST /api/auth/sign-in/email` from the UI's *Try it out*. The response `Set-Cookie` is captured by the browser, and every subsequent request from the same Swagger tab carries it.
- Click **Authorize** to paste a session token value (`session` cookie scheme) or a bearer token (`bearer` scheme) for non-browser clients.

**Regenerating the static spec.**

```bash
pnpm --filter backend openapi:generate
```

Writes `packages/contracts/openapi/openapi.json` + `openapi.yaml`. The script (`src/openapi/generate.ts`) boots a Nest application context without listening, so it runs in CI without a Postgres.

**CI sync check.** The `openapi-sync` job runs the generator, then `git diff --exit-code packages/contracts/openapi/`. If the committed spec diverges from what the live code produces, CI fails with an actionable message. Fix it by running the generator locally and committing the diff.

**Gating in production.** Easiest is to leave `ENABLE_SWAGGER` unset (and `NODE_ENV=production`) — the route never mounts. If you want it available, wrap the path in basic-auth middleware before `SwaggerModule.setup` (e.g. `app.use('/api/docs', basicAuth({ users: { admin: env.DOCS_PASSWORD } }))`).

---

## 12. Authentication

`/api/auth/*` is owned by **better-auth** — it's mounted in `main.ts` via `app.use('/api/auth', toNodeHandler(auth))` (decorated as `@Public()` so the global `AuthGuard` lets it through).

Key endpoints:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/sign-up/email` | Register with email + password |
| `POST` | `/api/auth/sign-in/email` | Sign in (sets `better-auth.session_token` cookie) |
| `POST` | `/api/auth/sign-out` | Clear session cookie |
| `GET` | `/api/auth/get-session` | Inspect current session |

Frontend uses `createAuthClient({ baseURL: import.meta.env.VITE_API_URL })` from `better-auth/react`. Hooks (`useSession`, `signIn`, `signOut`) call the API with `credentials: 'include'`. The session cookie is HTTP-only — JS cannot read it; the backend identifies the user from it on every request.

---

## 13. Authorization

Two layers, both authoritative-on-deny:

1. **Controller gate.** `@CheckAbility('read', 'Post')` on the handler. `AbilityGuard` reads the metadata and calls `ability.can(action, subject)` before the method runs.
2. **Service lock.** Inside the service, `ForbiddenError.from(ability).throwUnlessCan('update', post)` on a concrete instance. This catches per-record rules (ownership, status, etc.) that the controller-level gate can't.

Every route requires a session (global `AuthGuard`) unless decorated `@Public()` (applied to `/api/health` and `/api/auth/*`).

Frontend mirrors the same `Subjects` / `Actions` unions (re-exported from `@repo/contracts/casl`) and gates UI with `<Can I="create" a="Post">` from `@casl/react`. The backend still enforces — the frontend check is a UX nicety, never a security boundary.

---

## 14. Scripts cheat sheet

**Root** (proxy to Turbo):

| Script | Description |
|---|---|
| `pnpm dev` | Run all dev tasks in parallel (frontend, backend, contracts watch). |
| `pnpm build` | Build every workspace respecting `^build` deps. |
| `pnpm lint` | ESLint every workspace. |
| `pnpm typecheck` | `tsc --noEmit` every workspace. |
| `pnpm test` | Vitest unit tests across all workspaces. |
| `pnpm test:e2e` | E2E suite (backend). |
| `pnpm storybook` | Storybook dev server (frontend). |
| `pnpm build-storybook` | Static Storybook. |
| `pnpm arch` | Steiger FSD checks. |
| `pnpm db:generate` | Drizzle migration SQL (backend). |
| `pnpm db:migrate` | Apply migrations (backend). |
| `pnpm openapi:generate` | Regenerate `openapi.json`/`.yaml`. |
| `pnpm clean` | Remove `dist/`, `.turbo/`, etc. |
| `pnpm format` | Prettier write. |
| `pnpm format:check` | Prettier check (CI). |

**Backend** (`pnpm --filter backend <task>`):

| Script | Description |
|---|---|
| `dev` | `nest start --watch`. |
| `build` | `nest build` → `dist/main.js`. |
| `start` / `start:prod` | `node dist/main.js`. |
| `lint` / `typecheck` | Same as root, scoped. |
| `test` / `test:watch` | Vitest unit. |
| `test:e2e` | Vitest e2e config — boots a real Nest + Postgres. |
| `db:generate` | `drizzle-kit generate`. |
| `db:migrate` | `tsx src/infrastructure/database/migrate.ts`. |
| `db:studio` | `drizzle-kit studio` (DB explorer). |
| `openapi:generate` | `tsx src/openapi/generate.ts`. |

**Frontend** (`pnpm --filter frontend <task>`):

| Script | Description |
|---|---|
| `dev` | Vite dev server. |
| `build` | `tsc -b && vite build` → `dist/`. |
| `preview` | Serve the production build locally. |
| `lint` / `typecheck` | Same as root, scoped. |
| `test` / `test:watch` / `test:ui` | Vitest. |
| `test:coverage` | Vitest with V8 coverage. |
| `storybook` | Storybook dev. |
| `build-storybook` | Static Storybook → `storybook-static/`. |
| `arch` | Steiger FSD enforcement. |

**Contracts** (`pnpm --filter @repo/contracts <task>`):

| Script | Description |
|---|---|
| `build` | tsup dual ESM/CJS output. |
| `dev` | tsup watch (used by root `pnpm dev`). |
| `lint` / `typecheck` | As above. |

---

## 15. Docker

The Dockerfiles use BuildKit cache mounts for the pnpm store and rely on a checked-in `pnpm-lock.yaml`.

> **First-time requirement.** Run `pnpm install` locally **before** the first `docker build` so that `pnpm-lock.yaml` exists at the repo root. The Dockerfiles use `--frozen-lockfile` and will refuse to build without it.

```bash
cp .env.example .env
# Fill DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET, etc.
pnpm install                 # produces pnpm-lock.yaml
docker compose up --build
```

Compose services:

| Service | Port | Notes |
|---|---|---|
| `backend` | `3001` | `env_file: .env`. Healthcheck hits `/api/health`. |
| `frontend` | `8080` | Built with `VITE_API_URL=${VITE_API_URL:-http://localhost:3001}`. nginx serves the SPA with `try_files` fallback. `depends_on: backend (service_healthy)`. |

URLs that come up:

| Service | URL |
|---|---|
| Frontend (nginx) | http://localhost:8080 |
| Backend | http://localhost:3001 |
| Swagger UI | http://localhost:3001/api/docs (only if `ENABLE_SWAGGER=true` in `.env`) |

Build args worth knowing:

- `apps/frontend/Dockerfile` — `ARG VITE_API_URL`. Vite bakes this into the bundle at build time. Compose passes it; in `docker.yml` it comes from the GitHub repo variable `VITE_API_URL`.
- `apps/backend/Dockerfile` — no build args; runtime env is supplied at `docker run` / `docker compose` time.

The backend image runs `pnpm --filter backend openapi:generate` during the build stage so `/api/docs/openapi.json` works in production. It also `mkdir -p apps/backend/drizzle` defensively in case migrations haven't been generated yet.

---

## 16. GitHub Actions

### `ci.yml` — on PR and pushes to `main`

Three jobs:

1. **build-test** — `pnpm install --frozen-lockfile` → restore Turbo cache → `pnpm turbo run lint typecheck arch build test` → `build-storybook` → upload `storybook-static/` as an artifact.
2. **backend-e2e** — Spins up a `postgres:16-alpine` service container, builds contracts, runs `db:generate` + `db:migrate`, then `pnpm --filter backend test:e2e` against the ephemeral DB.
3. **openapi-sync** — Runs `openapi:generate` and `git diff --exit-code packages/contracts/openapi/`. Fails the build if the committed spec is stale. Uploads the generated artifacts.

Concurrency keys on `workflow + ref` cancel in-progress runs when you push again.

### `docker.yml` — on pushes to `main` and `v*` tags

Two parallel jobs (`frontend-image`, `backend-image`), each: Buildx → GHCR login → `docker/metadata-action@v5` (branch / tag / short SHA / `latest` on default branch) → `docker/build-push-action@v6` with GHA cache (`type=gha,scope=<image>`). Frontend job passes `VITE_API_URL=${{ vars.VITE_API_URL }}` as a build arg.

**Required repo configuration:**

| Kind | Name | Used by | Notes |
|---|---|---|---|
| Variable | `VITE_API_URL` | `docker.yml` (frontend build) | Public URL of the backend the frontend image should point at. Settings → Secrets and variables → Actions → Variables. |
| Token | `GITHUB_TOKEN` | both workflows | Provided automatically by Actions. Used for GHCR push (requires `permissions: packages: write`, already declared). |

No other secrets needed for CI. Backend e2e provides its own ephemeral Postgres and a throwaway `BETTER_AUTH_SECRET` inline in the job env.

---

## 17. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `docker build` fails with `ERR_PNPM_NO_LOCKFILE` | `pnpm-lock.yaml` doesn't exist yet. | Run `pnpm install` locally once, commit the lockfile, retry. |
| `db:migrate` hangs or errors with `prepared statement does not exist` | You pointed it at the pooler URL. | Migrations must use `DIRECT_URL` (port 5432), not `DATABASE_URL` (port 6543). |
| Login appears to succeed but next request is 401 | CORS preflight is fine but cookie was dropped. | Backend must have `credentials: true` and `origin` must be the literal frontend URL (no wildcard). Frontend `fetch` must set `credentials: 'include'`. |
| Cookie missing in production | Browser refuses `sameSite: 'none'` over HTTP. | Frontend **must** be served over HTTPS in production. Both `secure: true` and `sameSite: 'none'` are required for cross-site cookies. |
| Swagger UI shows no endpoints in prod | `NODE_ENV=production` and `ENABLE_SWAGGER` unset. | Either set `ENABLE_SWAGGER=true` (and add basic-auth) or leave it disabled — that's the secure default. |
| CI fails on `openapi-sync` | The committed spec doesn't match what the code generates. | Run `pnpm --filter backend openapi:generate` locally and commit `packages/contracts/openapi/`. |
| `pnpm arch` complains about an import | You crossed an FSD layer or imported a slice's internals. | Import only from a slice's `index.ts`, and only from a layer below you. |
| Frontend can't reach backend in Docker | `VITE_API_URL` was wrong at **build** time (Vite bakes it in). | Rebuild the frontend image with the right `VITE_API_URL` build arg. Runtime env changes have no effect. |

---

## 18. References

- FSD methodology — https://feature-sliced.design/docs/get-started/overview
- NestJS — https://docs.nestjs.com
- NestJS OpenAPI — https://docs.nestjs.com/openapi/introduction
- nestjs-zod — https://github.com/BenLorantfy/nestjs-zod
- Drizzle ORM — https://orm.drizzle.team
- Supabase Postgres — https://supabase.com/docs/guides/database
- better-auth — https://www.better-auth.com
- CASL — https://casl.js.org
- Turborepo — https://turborepo.com/docs
- pnpm workspaces — https://pnpm.io/workspaces
