# Feature-Flag Service (Backend D5)

**Status:** approved (brainstorm), pending review
**Date:** 2026-06-08
**Scope:** D5 from `docs/superpowers/specs/2026-05-24-belt-rank-followup-dependencies.md`.

## 1. Goals

1. Give the backend a way to gate endpoints by feature flag, so the existing frontend flag system (which only hides UI affordances) is paired with real API-side enforcement.
2. Move the flag registry into `@repo/contracts` so frontend and backend share one closed string union of valid flag codes.
3. Replace the build-time `VITE_FEATURE_FLAGS` env source with a runtime `GET /api/feature-flags` fetch — single source of truth, sysadmin-toggleable without redeploy.
4. Ship a sysadmin admin UI at `/admin/feature-flags` for live toggling, with audit-log entries on every flip.

## 2. Non-goals

- Per-organisation or per-user flag overrides (global-only; see §11 for "what if we ever need it").
- Percentage rollouts, A/B tests, sticky bucketing, observability — we are nowhere near needing GrowthBook / Unleash.
- In-process or distributed caching of the resolved flag map. Postgres indexed PK lookup is sub-millisecond; cache only when measurements warrant.
- Friendly "feature disabled" empty states — when a flag is off, the route is hidden and the affordance never renders; there's nothing to fall back to.

## 3. Vocabulary

- **Flag code** — a string identifier from a closed union, e.g. `'grading-history'`. Defined once in `@repo/contracts/feature-flags`.
- **Resolved map** — `Readonly<Record<FeatureFlagCode, boolean>>`. The shape returned by `GET /api/feature-flags` and consumed by `useFeatureFlag()` on the frontend.
- **Gated endpoint** — an HTTP route annotated with `@RequireFeatureFlag('<code>')`. When the flag is `false`, the guard throws `NotFoundException` (404) — same response a sysadmin gets for a route that doesn't exist, intentionally not 403 to avoid leaking roadmap.

## 4. Data model

One new table. Migration **0014** (next after labels' 0013).

### 4.1 `feature_flag`

| Column | Type | Notes |
|---|---|---|
| `code` | `text` PRIMARY KEY | One of `FEATURE_FLAG_CODES`; the contract validates on read. No `CHECK` constraint at the DB layer — closed union lives in code. |
| `enabled` | `boolean` NOT NULL DEFAULT `false` | The flag value. |
| `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | Bumped on every UPDATE. |
| `updated_by_id` | `text` NULL FK `"user"(id)` `ON DELETE SET NULL` | NULL after author is deleted, or NULL until the first toggle. |

No `created_at` — the seed inserts the initial rows and they're effectively part of the schema. No soft delete — flag rows don't get deleted; old flag codes get removed from the migration and the code union together (which is itself a deliberate breaking change).

**Seed:** migration 0014 inserts one row per code in the current registry (`grading-history`, `grading-history-verification`, `instructor-feedback`), all `enabled = false`. Matches the current `VITE_FEATURE_FLAGS={}` baseline — no behavioural regression on deploy.

**Adding a new flag** = bump the `FEATURE_FLAG_CODES` array in `@repo/contracts/feature-flags`, write a tiny migration that `INSERT … ON CONFLICT DO NOTHING` to add the row. The admin UI picks it up automatically.

**Removing a flag** = drop the code from the array, write a migration that `DELETE FROM feature_flag WHERE code = ?`. All consuming endpoints' `@RequireFeatureFlag(...)` references become typecheck errors, which is the desired forcing function.

## 5. Contracts (`@repo/contracts/feature-flags`)

New module at `packages/contracts/src/feature-flags.ts`. Re-exported via the package root + `./feature-flags` subpath (mirroring the labels module).

```ts
import { z } from 'zod';

export const FEATURE_FLAG_CODES = [
  'grading-history',
  'grading-history-verification',
  'instructor-feedback',
] as const;

export const FeatureFlagCodeSchema = z.enum(FEATURE_FLAG_CODES);
export type FeatureFlagCode = z.infer<typeof FeatureFlagCodeSchema>;

/** Default-off map. Every known flag resolves to `false` unless overridden. */
export const DEFAULT_FLAGS: Readonly<Record<FeatureFlagCode, boolean>> = Object.freeze(
  Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, false])) as Record<
    FeatureFlagCode,
    boolean
  >,
);

/** Wire shape of `GET /api/feature-flags` — the resolved map. */
export const FeatureFlagMapSchema = z
  .object(
    Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, z.boolean()])) as Record<
      FeatureFlagCode,
      z.ZodBoolean
    >,
  )
  .meta({ id: 'FeatureFlagMap' });

/** Wire shape of `GET /api/admin/feature-flags` (per-row). */
export const FeatureFlagSchema = z
  .object({
    code: FeatureFlagCodeSchema,
    enabled: z.boolean(),
    updatedAt: z.iso.datetime(),
    updatedById: z.string().nullable(),
  })
  .meta({ id: 'FeatureFlag' });

export const UpdateFeatureFlagSchema = z
  .object({ enabled: z.boolean() })
  .meta({ id: 'UpdateFeatureFlagInput' });

export type FeatureFlagMap = z.infer<typeof FeatureFlagMapSchema>;
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type UpdateFeatureFlagInput = z.input<typeof UpdateFeatureFlagSchema>;
```

The frontend's existing `apps/frontend/src/shared/lib/feature-flags/flags.ts` becomes a thin re-export so no consumer import path changes:

```ts
export { FEATURE_FLAG_CODES, type FeatureFlagCode, type FeatureFlagMap, DEFAULT_FLAGS } from '@repo/contracts/feature-flags';
```

The old `parseFlagsFromEnv` function is **removed** — env is no longer the source of truth.

## 6. CASL

New subject: `'FeatureFlag'`. Added to `AppSubjectName` in `packages/contracts/src/casl.ts`.

Rules (new `FeatureFlagsAbilityRules` in `apps/backend/src/modules/feature-flags/`):

- **Sysadmin:** `manage FeatureFlag`.
- **Regular users:** no permissions on `FeatureFlag`. They read the resolved map via the *public* `GET /api/feature-flags`, which doesn't go through CASL — same pattern as `/api/health`.

Wire `FeatureFlagsAbilityRules` into `AbilityFactory.contributors` via `@Optional()` injection.

## 7. REST API

```
GET   /api/feature-flags                — public (no auth), returns FeatureFlagMap
GET   /api/admin/feature-flags          — sysadmin, returns FeatureFlag[]
PATCH /api/admin/feature-flags/:code    — sysadmin, body: UpdateFeatureFlagInput, returns FeatureFlag
```

The public endpoint is **deliberately unauthenticated**. The flag values are global; nothing per-user to leak. Logged-in users and visitors to `/login` both need them to render correctly. Same reasoning as the existing `/api/health` route.

The admin endpoint requires `manage FeatureFlag` via the existing CASL guard. The PATCH writes an audit-log row through the existing audit-log module: `subjectType='FeatureFlag'`, `subjectId=code`, `action='update'`, `before={enabled: prev}`, `after={enabled: next}`.

### 7.1 `@RequireFeatureFlag` decorator + guard

```ts
// apps/backend/src/infrastructure/feature-flags/require-feature-flag.decorator.ts
export const FEATURE_FLAG_KEY = 'feature-flag';
export const RequireFeatureFlag = (code: FeatureFlagCode) =>
  SetMetadata(FEATURE_FLAG_KEY, code);
```

```ts
// apps/backend/src/infrastructure/feature-flags/feature-flag.guard.ts
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const code = this.reflector.get<FeatureFlagCode | undefined>(FEATURE_FLAG_KEY, ctx.getHandler());
    if (!code) return true; // route is not gated
    const enabled = await this.flags.isEnabled(code);
    if (!enabled) throw new NotFoundException();
    return true;
  }
}
```

Registered as a **global guard** in `AppModule` (alongside the existing auth + CASL guards). Routes opt into gating via the decorator; routes without it run unaffected.

### 7.2 Where Phase A applies the guard

Phase A gates every endpoint that aligns with a flag's intent so each flag has one consistent meaning ("feature is enforced everywhere or absent everywhere"):

- `grading-history`:
  - `POST   /api/rank-history`
  - `PATCH  /api/rank-history/:id`
  - `DELETE /api/rank-history/:id`
- `grading-history-verification`:
  - `POST   /api/rank-history/:id/verify`
  - `POST   /api/rank-history/:id/unverify`
- `instructor-feedback`: no endpoints exist yet — nothing to gate. (The flag still appears in the admin UI; when the feature ships, its endpoints will be annotated.)

`GET` endpoints stay **ungated by design**. Read views of historical data shouldn't disappear when a write flag is flipped off — admins decommissioning a feature still need to read what's there.

## 8. Resolution + caching

Phase A: **no cache.** `FeatureFlagsService.isEnabled(code)` does a single `SELECT enabled FROM feature_flag WHERE code = $1`. Postgres indexed PK lookup is sub-millisecond. The full map for `GET /api/feature-flags` is `SELECT code, enabled FROM feature_flag`.

Why no cache:
- Eliminates multi-replica staleness (instance A toggles a flag; instance B sees the change immediately on the next request).
- Eliminates cache-invalidation complexity around the admin PATCH.
- One query per request is acceptable at the table size (≤20 rows realistically).

A short-TTL in-memory cache (e.g. 30s) can land as a follow-up if a benchmark shows the per-request lookup is a hot path. The interface stays the same.

## 9. Frontend changes

### 9.1 Provider rewrite

`apps/frontend/src/shared/lib/feature-flags/provider.tsx` switches from `parseFlagsFromEnv(import.meta.env.VITE_FEATURE_FLAGS)` to a React Query fetch:

```tsx
export function FeatureFlagsProvider({ children, flags }: Props): React.ReactElement {
  // Test override path stays exactly as is.
  if (flags) {
    return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
  }
  const { data } = useSuspenseQuery({
    queryKey: ['feature-flags'],
    queryFn: () => getFeatureFlags(), // from entities/feature-flag/api
    staleTime: Infinity, // refetch only on admin toggle invalidation
  });
  return <FeatureFlagsContext.Provider value={data}>{children}</FeatureFlagsContext.Provider>;
}
```

The provider mounts inside a `<Suspense fallback={<AppLoading />} />` boundary at the router root. First paint waits for the fetch (typical: 50–150 ms locally, similar to existing auth-session fetch). No flicker.

The existing `useFeatureFlag(code)` hook surface and the `<FeatureFlag code>` wrapper component stay exactly as they are.

### 9.2 New `entities/feature-flag/` slice

Mirrors `entities/labels` from the labels series. Files:
- `api/feature-flags.api.ts` — `getFeatureFlags()` for the public map; `getAdminFeatureFlags()` + `updateFeatureFlag(code, input)` for the admin endpoints.
- `lib/hooks.ts` — `useFeatureFlagsAdminQuery()`, `useUpdateFeatureFlagMutation()`. (No `useFlagsQuery()` for the public map — that's the provider's job, not a feature-tier hook.)
- `index.ts` — barrel.

### 9.3 Admin page `/admin/feature-flags`

New route `_app.admin.feature-flags.tsx`. Sysadmin only (`beforeLoad` checks the session role; redirect to `/dashboard` otherwise).

Page layout:

```
Feature flags
─────────────────────────────────────────────────────────────
[code]                              [toggle]   [last updated]
grading-history                       [✓]      ada · 3h ago
grading-history-verification          [ ]      —
instructor-feedback                   [ ]      —
─────────────────────────────────────────────────────────────
```

Toggle switch fires `useUpdateFeatureFlagMutation()`. On success, the mutation invalidates the `['feature-flags']` query (the public map) so the SPA's whole flag state updates immediately. Optimistic update on the toggle is fine (the value reverts on failure).

Linked from the existing `/settings` hub page below the Labels link.

### 9.4 Cleanup

- Remove `VITE_FEATURE_FLAGS` from `apps/frontend/.env.example` and `vitest.config.ts`'s test env.
- Remove `parseFlagsFromEnv` from `flags.ts`.
- Update existing tests of the flags provider — they pass `flags={{...}}` prop directly, so they're unaffected by the source switch.

## 10. Migration plan

The migration is a **schema add + seed** with default-off rows. Operational sequence:

1. **Deploy backend** (migration 0014 runs, table exists, all flags default false, public endpoint returns the all-off map).
2. **Deploy frontend** (provider switches to API fetch — fetches all-off, behaves identically to current `VITE_FEATURE_FLAGS={}` baseline).
3. **Sysadmin flips on whichever flags were intended to be on** in the new admin UI.

If the backend and frontend deploy out of order, behaviours during the gap:
- Backend deployed first, frontend old: frontend still reads its build-time inlined `{}`, backend serves the same. Identical.
- Frontend deployed first, backend old: `GET /api/feature-flags` is 404, the Suspense fetch fails, app fails to boot. **This is the dangerous gap.**

Mitigation: deploy order must be backend-first. Document this in the plan's deployment notes. If the deployment infrastructure can't guarantee order, ship an additional Phase A task that adds an error-boundary fallback to `DEFAULT_FLAGS` when the fetch fails — degrades to "all off" rather than blocking the app.

## 11. Out of scope (recap + future shape)

- **Per-org overrides.** If we ever need them: add a `feature_flag_org_override(flag_code, organisation_id, enabled)` table and a resolver that, given a request's active org, picks the override if present, else the global. The contract stays `Record<code, boolean>` per request because the server has already resolved org context. Frontend doesn't need to know.
- **Caching.** Short-TTL in-process cache (30s) if measurement shows the per-request lookup matters. The interface (`isEnabled(code): Promise<boolean>`) stays the same.
- **Audit-log "by sysadmin X" attribution beyond the row itself.** The flag rows already carry `updated_by_id`; the audit-log entry duplicates that for searchability.

## 12. Testing strategy

| Layer | What to test |
|---|---|
| Contracts | `FeatureFlagCodeSchema` accepts the three current codes + rejects unknown. `FeatureFlagMapSchema` shape matches all-known-codes. `UpdateFeatureFlagInputSchema` accepts `{enabled: true|false}`. |
| DB | Migration 0014 is purely additive — seed inserts exactly 3 rows, no other tables touched. |
| Service: `FeatureFlagsService` | `isEnabled(code)` resolves from DB row. `all()` returns the full map. `setEnabled(code, enabled, userId)` writes the row + bumps `updated_at` + sets `updated_by_id`. |
| Guard: `FeatureFlagGuard` | Returns `true` for ungated routes (no `@RequireFeatureFlag` metadata). Throws `NotFoundException` when flag is off. Returns `true` when flag is on. |
| Controller: `FeatureFlagsController` | Public GET returns the resolved map (no auth required). Admin GET requires sysadmin. Admin PATCH requires sysadmin + writes audit-log + invalidates downstream readers. |
| Integration: gated rank-history endpoints | With `grading-history-verification: false`, `POST /verify` returns 404. With `true`, returns the existing 200 response. |
| Frontend: provider | Test override path (`<FeatureFlagsProvider flags={...}>`) unchanged. New API path: mock `getFeatureFlags()`, assert Suspense resolves with the mocked map. |
| Frontend: admin page | Renders list of flags with current state, toggling fires the mutation, list refreshes from the public-map invalidation. |

## 13. Open considerations

- **Multi-replica deploy + cache later.** When caching lands, picking a sync strategy (Postgres NOTIFY/LISTEN, short TTL, eventual via reload) becomes a real decision. For now, no cache, no problem.
- **Should `FeatureFlagGuard` be opt-in per-route or global?** Spec calls for global registration via `APP_GUARD` — every route runs through it, but routes without `@RequireFeatureFlag` short-circuit on the metadata check. Lower risk of "forgot to apply the guard somewhere" than per-route `@UseGuards(FeatureFlagGuard)`.
- **Should the admin UI live under `/admin/feature-flags` or `/settings/feature-flags`?** `/admin/*` is where the existing admin routes cluster (`/admin/users`, `/admin/organisations`, `/admin/audit-log`, `/admin/belt-catalog`). Feature-flag management fits that cluster more naturally than the per-user `/settings/*` namespace. Recommend `/admin/feature-flags`.

## 14. Task decomposition estimate

Phase A breaks into roughly:

1. Contracts: registry + schemas + CASL subject `'FeatureFlag'`.
2. DB: `feature_flag` table + migration 0014 + seed for 3 codes.
3. Backend: `FeatureFlagsRepository` + `FeatureFlagsService` + spec.
4. Backend: `@RequireFeatureFlag` decorator + `FeatureFlagGuard` + spec.
5. Backend: register guard globally; apply decorator to 5 rank-history write endpoints + update spec.
6. Backend: `FeatureFlagsController` (public + admin) + `FeatureFlagsAbilityRules` + AbilityFactory wiring + spec.
7. OpenAPI regen.
8. Frontend entities: `entities/feature-flag/` API client + admin React Query hooks.
9. Frontend provider: switch from env to API fetch + Suspense boundary + provider spec update.
10. Frontend admin: `/admin/feature-flags` page + route + sysadmin guard.
11. Frontend: link from `/settings` hub.
12. i18n keys (en/sv/fi).
13. Cleanup: remove `VITE_FEATURE_FLAGS` from `.env.example` and `vitest.config.ts`.
14. Full pipeline pass.

Estimated ~13–14 tasks. Comparable scope to the labels Phase A.

---

## Glossary recap

- **Flag code** = closed-union string from `FEATURE_FLAG_CODES`. Source of truth lives in `@repo/contracts`.
- **Resolved map** = `Record<FeatureFlagCode, boolean>`. What `GET /api/feature-flags` returns and what the provider feeds the SPA.
- **Gated endpoint** = backend route with `@RequireFeatureFlag('<code>')`. Off → 404; on → normal handler.
- **Admin endpoint** = `/api/admin/feature-flags*`. Sysadmin-only; toggling here writes an audit-log entry.
