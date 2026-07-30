# Local database

This doc covers two things:

1. **Local Postgres for dev work** — run against a disposable local DB instead of the shared Supabase project.
2. **Provider portability** — what it takes to move production off Supabase to Railway (or anything else). Not urgent; documented so it's a known-cost decision, not a research task.

The codebase is Postgres-only. No `@supabase/*` imports; auth is `better-auth`; DB access is vanilla `postgres-js` + Drizzle. Supabase currently provides only the Postgres server + PGBouncer pooler.

---

## 1. Local Postgres for dev

### Why bother

- No accidental writes to the shared Supabase during feature dev
- Faster iteration — no network round-trip, no pooler quota (`EMAXCONNSESSION`) to fight
- Works offline
- Reset in one command when you want a clean slate

### One-time setup

1. Install Docker Desktop (or Colima on macOS).
2. Bring the container up:
   ```bash
   pnpm --filter backend db:dev:up
   ```
3. Point `.env` at localhost. Set BOTH values (locally, we don't split runtime vs. migrations — there's no pooler):
   ```dotenv
   DATABASE_URL=postgres://taidohub:taidohub@localhost:5432/taidohub_dev
   DIRECT_URL=postgres://taidohub:taidohub@localhost:5432/taidohub_dev
   ```
4. Apply the schema and seed:
   ```bash
   pnpm --filter backend db:dev:migrate
   pnpm --filter backend db:dev:seed
   ```
5. Start the app:
   ```bash
   pnpm dev
   ```

### Daily workflow

The container persists across restarts (named volume `taidohub_dev_pgdata`), so day-to-day you just `pnpm dev` and forget about the DB. Common operations:

| Task | Command |
|---|---|
| Start (or resume) local Postgres | `pnpm --filter backend db:dev:up` |
| Stop (keeps data) | `pnpm --filter backend db:dev:down` |
| Apply new migrations after `db:generate` | `pnpm --filter backend db:dev:migrate` |
| Re-seed after a schema change | `pnpm --filter backend db:dev:seed` |
| Full reset — wipe volume, re-migrate, re-seed | `pnpm --filter backend db:dev:reset` |
| Open Drizzle Studio against local DB | `pnpm --filter backend db:studio` |

### Switching back to Supabase

Just edit `.env` — set `DATABASE_URL` and `DIRECT_URL` back to the Supabase URLs. The container can keep running in the background at no cost; you're just not pointed at it.

### Troubleshooting

**Port 5432 already in use.** You have another Postgres on 5432 (system install, another project's container). Two options:

- Stop the other one: `sudo systemctl stop postgresql` (Linux) or quit Postgres.app (macOS).
- Override the port:
  ```bash
  DEV_POSTGRES_PORT=15432 pnpm --filter backend db:dev:up
  ```
  Then update `.env` URLs to `...@localhost:15432/taidohub_dev`.

**"password authentication failed".** Your `.env` URLs don't match the container's credentials. The compose file hardcodes `taidohub` / `taidohub` — copy the URLs from the section above verbatim.

**"database taidohub_dev does not exist".** The container was created against a different db name (perhaps from an old compose file). Wipe and start over: `pnpm --filter backend db:dev:reset`.

**Everything looks weird after a schema change.** `db:dev:reset` is the hammer — wipes the volume, re-migrates from `apps/backend/drizzle/*.sql`, re-seeds.

---

## 2. Production: moving off Supabase (when / if)

**Status quo — Supabase.** Postgres, PGBouncer, daily backups, PITR on Pro. We use only the DB — no Auth (better-auth), no Realtime, no Storage, no Edge Functions. Staying on Supabase is fine; the migration path below is documented so it stays a known-cost decision, not a research project.

**Alternative — Railway.** Managed Postgres, usage-based pricing, US/EU regions. No built-in pooler — either run a PgBouncer sidecar or collapse to a single URL and tune the app pool. Bare Postgres, trivial to leave.

### Migration path (whenever it happens)

Plan for ~2 hours of hands-on time, mostly waiting on `pg_dump`/`pg_restore`.

1. **Provision** — Railway Postgres, plus a PgBouncer sidecar if you want to keep the split URL model. If not, plan to remove `DIRECT_URL` from the code below.
2. **Dump the current DB** from Supabase Direct URL:
   ```bash
   pg_dump "$SUPABASE_DIRECT_URL" -Fc -f taidohub.dump
   ```
3. **Restore into Railway**:
   ```bash
   pg_restore -d "$RAILWAY_DIRECT_URL" --no-owner --no-privileges taidohub.dump
   ```
4. **Sanity-check** — row counts on the largest tables (`user`, `organisation`, `audit_log`, `progress`), plus one signup + one signin via the real API pointed at the new DB.
5. **Swap env** — update `DATABASE_URL` and `DIRECT_URL` in the deployment env; redeploy backend.
6. **Delete the misleading comment** in [`apps/backend/src/infrastructure/database/client.ts`](../apps/backend/src/infrastructure/database/client.ts) — it references "Supabase's session-mode pooler cap", which no longer applies. The single-pool guard itself stays useful.
7. **Watch for 30 minutes** — auth writes to `session`/`account`, audit log inserts, first real read paths.
8. **Retire Supabase** — keep the last dump for 30 days as insurance, then delete the project.

### What breaks in code

Nothing structural. The two URLs are the only touch points. If Railway is chosen without PgBouncer, either:

- Point both `DATABASE_URL` and `DIRECT_URL` at the same URL and delete the split (simpler), or
- Add a PgBouncer sidecar and keep both distinct (matches current shape).

Either way, `postgres-js` + Drizzle are provider-agnostic and don't need config changes.

### What breaks operationally

- **Backups.** Configure Railway's automated backups explicitly; they're not on by default on the free tier.
- **Region.** Move the frontend/backend hosts too if you were relying on Supabase's region for low DB latency.
- **Point-in-time recovery.** Available on Railway's paid tiers; verify before you rely on it.
