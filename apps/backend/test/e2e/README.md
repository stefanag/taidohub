# Backend e2e tests

Boots a real NestJS app (see [`test/helpers/app-factory.ts`](../helpers/app-factory.ts)) and drives it over HTTP with `supertest`. Each e2e file starts from a truncated database via [`test/helpers/db-reset.ts`](../helpers/db-reset.ts) and seeds only the rows it needs — with unique slugs/emails/short-codes per test so runs stay isolated even against a persistent test DB.

## Configuration

Every e2e run needs a Postgres reachable at `TEST_DATABASE_URL` (or `DATABASE_URL` as a fallback). The suite is silently skipped if neither is set — see the `describe.skipIf(!hasDatabase())` wrapper — so `pnpm test` on a fresh laptop stays green.

Env vars required (see [`.env.e2e.example`](../../.env.e2e.example)):

- `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` — all pointing at the same disposable DB in local dev.
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`, `WEB_APP_URL` — required by `EnvSchema` at Nest boot.

## Running the tests

### CI (GitHub Actions)

Already wired. The `backend-e2e` job in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) provisions a `postgres:16-alpine` service, sets the env, applies migrations, and runs `pnpm --filter backend test:e2e`. Every PR runs this automatically.

### Local — with Docker

Bundled `docker-compose.e2e.yml` starts `postgres:16-alpine` on **port 5433** (to avoid clashing with a dev Postgres on 5432). Data lives in a `tmpfs` mount so `down -v` truly discards everything.

```bash
# One shot: up → migrate → test → down (down runs even if tests fail)
pnpm --filter backend test:e2e:all

# Or step by step:
pnpm --filter backend test:e2e:up       # start Postgres, wait for readiness
pnpm --filter backend test:e2e:migrate  # apply migrations
pnpm --filter backend test:e2e          # run vitest
pnpm --filter backend test:e2e:down     # stop + drop the volume
```

The env is loaded from `apps/backend/.env.e2e` — copy from `.env.e2e.example` on first setup.

### Local — without Docker (BYO Postgres)

Any disposable Postgres works — a local install, a scratch schema on a shared server, a Neon branch, a Supabase branch. Point `TEST_DATABASE_URL` at it and run:

```bash
# 1. Copy the example and edit the DB URLs to your target
cp apps/backend/.env.e2e.example apps/backend/.env.e2e

# 2. Apply migrations
pnpm --filter backend test:e2e:migrate

# 3. Run the suite
pnpm --filter backend test:e2e
```

`vitest.e2e.config.ts` loads `.env.e2e` automatically via `process.loadEnvFile()` if the file exists. CI-provided env always wins over `.env.e2e` so you can't accidentally leak your local URL into a CI run.

## Writing new e2e specs

- Filename: `test/e2e/<feature>.e2e.spec.ts`.
- Wrap the top-level `describe` in `describe.skipIf(!hasDatabase())`.
- Call `resetDatabase()` in `beforeAll` (or `beforeEach` if state must not leak between tests within the file).
- Build the Nest app with `buildTestApp()` and destroy it in `afterAll`.
- Use unique identifiers (`Date.now()`-suffixed slugs, emails, short codes) so parallel or re-run tests don't collide with each other's seeds.

## Troubleshooting

- **`TRUNCATE TABLE ... CASCADE` notices in the output** — expected. Postgres always warns when a truncate cascades, and `resetDatabase()` explicitly relies on cascading so we can pass an unordered table list.
- **Tests hang on start-up** — the healthcheck on the compose file waits for `pg_isready`. If Postgres never becomes ready, check the container logs: `docker logs taidohub-e2e-postgres`.
- **`DIRECT_URL is required to run migrations`** — you're missing `apps/backend/.env.e2e`. Copy from the example and edit as needed.
- **Port already in use on 5433** — override with `E2E_POSTGRES_PORT=15432 pnpm --filter backend test:e2e:up` (also update `DATABASE_URL`/`DIRECT_URL`/`TEST_DATABASE_URL` in `.env.e2e` to match).
