# Belt-Catalog Frontend + Feature-Flag Infrastructure + Public Rank Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Plan B — the frontend admin surface for the belt-catalog (Systems / Ranks / Shogo titles) on top of the already-shipped backend (Plan A), plus a small env-driven feature-flag system pulled forward from followup D5, plus a minimal public `/ranks/:slug` page backed by a new public-read endpoint.

**Architecture:** Three new frontend entity slices (`belt-system`, `belt-rank`, `shogo-title`) wrap the existing `GET/POST/PATCH/DELETE` admin endpoints. Two shared lib modules port the belt-visuals rule table and rank-label helper from Taidopass verbatim. A new shared UI primitive (`BeltGraphic`) and small `BeltBadge` deliver the visual swatch. Three feature slices build the admin forms (RHF + zodResolver against the existing `@repo/contracts/{belt-systems,ranks,shogo-titles}` schemas) and three matching list-table features. A single `pages/admin-belt-catalog/` hub page tabs the three surfaces. Feature flags ship as a typed string-literal union (`'grading-history' | 'grading-history-verification' | 'instructor-feedback'`), parsed at boot from `VITE_FEATURE_FLAGS` JSON into a React context, defaulting to all-off. The public rank page reuses the existing `_public.tsx` layout and a new backend public-read endpoint (`GET /api/public/ranks/:slug`) gated by the existing `@Public()` decorator.

**Tech Stack:** React 19, Vite, TanStack Router/Query v5, Feature-Sliced Design, shadcn primitives (Radix-backed) from `@/shared/ui`, Tailwind, `react-hook-form` + `@hookform/resolvers` (NEW deps), Zod 4 via `@repo/contracts`, NestJS 11 (backend public endpoint), Drizzle, Vitest + Testing Library.

**Dependency posture:** The catalog backend (`BeltSystemsController`, `BeltRanksController`, `ShogoTitlesController`) is already live from Plan A — every admin endpoint this plan consumes exists. Plan A's CASL subjects (`BeltSystem`, `BeltRank`, `ShogoTitle`) already register; the sidebar gate reuses the existing `ability.can('manage', 'BeltRank')` check. Followup D5 (feature flags) backend half is NOT included — this plan ships the frontend half only (env-driven, no service call). Followup D7 (admin user grading-history tab) is out of scope.

**Implementer environment notes (Windows):**

- `pnpm --filter backend typecheck` and `pnpm --filter frontend typecheck` can hang on Windows. Fall back to `cd apps/backend && npx tsc --noEmit` / `cd apps/frontend && npx tsc --noEmit` if either hangs.
- Tests via `pnpm --filter frontend exec vitest run [path]` always work fine.
- `pnpm --filter @repo/contracts test` (note the `@repo/` scope) — the package name is `@repo/contracts`.

---

### Task 1: Install `react-hook-form` + `@hookform/resolvers`

**Files:**

- Modify: `apps/frontend/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install the dependencies**

```
pnpm --filter frontend add react-hook-form @hookform/resolvers
```

Expected: PASS — pnpm prints `+ react-hook-form 7.x` and `+ @hookform/resolvers 5.x` (or the current latest), regenerates `pnpm-lock.yaml`, and writes the two entries into `apps/frontend/package.json` `"dependencies"`. No type errors expected (`zod` is already a peer of `@hookform/resolvers/zod`; we have Zod 4 from `@repo/contracts`).

- [ ] **Step 2: Sanity-typecheck the frontend**

```
pnpm --filter frontend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0; the new deps are purely additive and not yet imported anywhere.

- [ ] **Step 3: Commit**

```
git add apps/frontend/package.json pnpm-lock.yaml
git commit -m "chore(frontend): add react-hook-form and @hookform/resolvers"
```

---

### Task 2: Feature-flag infrastructure (shared/lib/feature-flags)

**Files:**

- Create: `apps/frontend/src/shared/lib/feature-flags/flags.ts`
- Create: `apps/frontend/src/shared/lib/feature-flags/provider.tsx`
- Create: `apps/frontend/src/shared/lib/feature-flags/useFeatureFlag.ts`
- Create: `apps/frontend/src/shared/lib/feature-flags/FeatureFlag.tsx`
- Create: `apps/frontend/src/shared/lib/feature-flags/useFeatureFlag.test.tsx`
- Create: `apps/frontend/src/shared/lib/feature-flags/index.ts`
- Modify: `apps/frontend/src/app/providers/QueryProvider.tsx` — only to confirm we don't break it (no change required if we mount the new provider in the route tree; see Step 6)
- Create: `apps/frontend/src/app/providers/FeatureFlagsProvider.tsx`
- Modify: `apps/frontend/src/app/router/routes/__root.tsx` — wrap the root outlet with `<FeatureFlagsProvider>`
- Modify: `.env.example` — document `VITE_FEATURE_FLAGS`
- Modify: `apps/frontend/steiger.config.js` — add a public-API sidestep override for the new test file's deep mock

- [ ] **Step 1: Create the flags registry**

Create `apps/frontend/src/shared/lib/feature-flags/flags.ts`:

```ts
/**
 * The frontend-side feature-flag registry. Flag codes are a closed string
 * union so a typo at a `useFeatureFlag('xxx')` call site is a type error,
 * not a silently-always-false flag. v1 is env-driven only — the
 * `VITE_FEATURE_FLAGS` JSON object set at build time becomes the single
 * source of truth for the lifetime of the SPA session. A server-side flag
 * service can slot in later (followup D5 backend half) by replacing the
 * provider's source without changing the hook surface.
 */

export const FEATURE_FLAG_CODES = [
  'grading-history',
  'grading-history-verification',
  'instructor-feedback',
] as const;

export type FeatureFlagCode = (typeof FEATURE_FLAG_CODES)[number];

export type FeatureFlagMap = Readonly<Record<FeatureFlagCode, boolean>>;

/** Default-off map. Every known flag resolves to `false` unless overridden. */
export const DEFAULT_FLAGS: FeatureFlagMap = Object.freeze(
  Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, false])) as Record<
    FeatureFlagCode,
    boolean
  >,
);

/**
 * Parse the `VITE_FEATURE_FLAGS` JSON string into a `FeatureFlagMap`.
 *
 * - Missing / empty / `'{}'` → returns `DEFAULT_FLAGS` unchanged.
 * - Unknown keys in the JSON are dropped silently (forward-compat with new
 *   codes appearing in env before the code that consumes them ships).
 * - Non-boolean values are coerced to `false` (defensive — env injection
 *   shouldn't be able to flip a flag on with a truthy-but-not-`true` value).
 * - Parse errors fall back to `DEFAULT_FLAGS` and log a warning; the SPA
 *   keeps booting.
 */
export function parseFlagsFromEnv(raw: string | undefined): FeatureFlagMap {
  if (!raw || raw.trim() === '' || raw.trim() === '{}') return DEFAULT_FLAGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[feature-flags] Failed to parse VITE_FEATURE_FLAGS:', err);
    return DEFAULT_FLAGS;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return DEFAULT_FLAGS;
  }
  const next: Record<FeatureFlagCode, boolean> = { ...DEFAULT_FLAGS };
  for (const code of FEATURE_FLAG_CODES) {
    const value = (parsed as Record<string, unknown>)[code];
    next[code] = value === true;
  }
  return Object.freeze(next);
}
```

- [ ] **Step 2: Create the React context + provider**

Create `apps/frontend/src/shared/lib/feature-flags/provider.tsx`:

```tsx
import * as React from 'react';

import { DEFAULT_FLAGS, parseFlagsFromEnv, type FeatureFlagMap } from './flags.js';

/**
 * Context that exposes the parsed `FeatureFlagMap`. Defaults to the all-off
 * map so a missing provider doesn't blow up the tree — every call to
 * `useFeatureFlag` returns `false` in that case, matching the "flag off"
 * semantics.
 */
export const FeatureFlagsContext = React.createContext<FeatureFlagMap>(DEFAULT_FLAGS);

export interface FeatureFlagsProviderProps {
  children: React.ReactNode;
  /**
   * Optional override — primarily for tests / Storybook to inject a specific
   * map without touching `import.meta.env`. Production callers omit this and
   * the provider reads `VITE_FEATURE_FLAGS` itself.
   */
  flags?: FeatureFlagMap;
}

/**
 * Reads `VITE_FEATURE_FLAGS` at mount and freezes the result for the lifetime
 * of the SPA. Vite inlines env at build time, so this is a one-shot parse —
 * no resubscribe / no re-render churn.
 */
export function FeatureFlagsProvider({
  children,
  flags,
}: FeatureFlagsProviderProps): React.ReactElement {
  const value = React.useMemo<FeatureFlagMap>(
    () => flags ?? parseFlagsFromEnv(import.meta.env.VITE_FEATURE_FLAGS as string | undefined),
    [flags],
  );
  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}
```

- [ ] **Step 3: Create the hook**

Create `apps/frontend/src/shared/lib/feature-flags/useFeatureFlag.ts`:

```ts
import * as React from 'react';

import { type FeatureFlagCode } from './flags.js';
import { FeatureFlagsContext } from './provider.js';

/** Read one flag by its typed code. Returns `false` for any flag the provider does not know. */
export function useFeatureFlag(code: FeatureFlagCode): boolean {
  const flags = React.useContext(FeatureFlagsContext);
  return flags[code] ?? false;
}
```

- [ ] **Step 4: Create the conditional-render component**

Create `apps/frontend/src/shared/lib/feature-flags/FeatureFlag.tsx`:

```tsx
import * as React from 'react';

import { type FeatureFlagCode } from './flags.js';
import { useFeatureFlag } from './useFeatureFlag.js';

export interface FeatureFlagProps {
  code: FeatureFlagCode;
  children: React.ReactNode;
  /** Rendered when the flag is off. Defaults to `null`. */
  fallback?: React.ReactNode;
}

/** Wraps children in a runtime check against the named flag. */
export function FeatureFlag({ code, children, fallback = null }: FeatureFlagProps): React.ReactNode {
  return useFeatureFlag(code) ? children : fallback;
}
```

- [ ] **Step 5: Create the test**

Create `apps/frontend/src/shared/lib/feature-flags/useFeatureFlag.test.tsx`:

```tsx
import { render, renderHook, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_FLAGS, parseFlagsFromEnv, type FeatureFlagMap } from './flags.js';
import { FeatureFlag } from './FeatureFlag.js';
import { FeatureFlagsProvider } from './provider.js';
import { useFeatureFlag } from './useFeatureFlag.js';

function wrapper(flags: FeatureFlagMap) {
  return ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <FeatureFlagsProvider flags={flags}>{children}</FeatureFlagsProvider>
  );
}

describe('parseFlagsFromEnv', () => {
  it('returns DEFAULT_FLAGS for undefined / empty / "{}" input', () => {
    expect(parseFlagsFromEnv(undefined)).toEqual(DEFAULT_FLAGS);
    expect(parseFlagsFromEnv('')).toEqual(DEFAULT_FLAGS);
    expect(parseFlagsFromEnv('{}')).toEqual(DEFAULT_FLAGS);
  });

  it('honours `true` values for known codes', () => {
    const out = parseFlagsFromEnv('{"grading-history":true}');
    expect(out['grading-history']).toBe(true);
    expect(out['grading-history-verification']).toBe(false);
    expect(out['instructor-feedback']).toBe(false);
  });

  it('coerces non-true values to false', () => {
    const out = parseFlagsFromEnv('{"grading-history":1,"instructor-feedback":"yes"}');
    expect(out['grading-history']).toBe(false);
    expect(out['instructor-feedback']).toBe(false);
  });

  it('drops unknown keys silently', () => {
    const out = parseFlagsFromEnv('{"never-defined":true}');
    expect(Object.keys(out).sort()).toEqual(
      ['grading-history', 'grading-history-verification', 'instructor-feedback'].sort(),
    );
  });

  it('falls back to DEFAULT_FLAGS on malformed JSON', () => {
    expect(parseFlagsFromEnv('not json')).toEqual(DEFAULT_FLAGS);
  });
});

describe('useFeatureFlag', () => {
  it('returns false with no provider in the tree (defaults)', () => {
    const { result } = renderHook(() => useFeatureFlag('grading-history'));
    expect(result.current).toBe(false);
  });

  it('returns the provider-supplied value', () => {
    const flags = { ...DEFAULT_FLAGS, 'grading-history': true };
    const { result } = renderHook(() => useFeatureFlag('grading-history'), {
      wrapper: wrapper(flags),
    });
    expect(result.current).toBe(true);
  });
});

describe('<FeatureFlag>', () => {
  it('renders children when the flag is on', () => {
    const flags = { ...DEFAULT_FLAGS, 'grading-history': true };
    render(
      <FeatureFlagsProvider flags={flags}>
        <FeatureFlag code="grading-history">
          <span>shown</span>
        </FeatureFlag>
      </FeatureFlagsProvider>,
    );
    expect(screen.getByText('shown')).toBeInTheDocument();
  });

  it('renders the fallback when the flag is off', () => {
    render(
      <FeatureFlagsProvider flags={DEFAULT_FLAGS}>
        <FeatureFlag code="grading-history" fallback={<span>fallback</span>}>
          <span>shown</span>
        </FeatureFlag>
      </FeatureFlagsProvider>,
    );
    expect(screen.queryByText('shown')).not.toBeInTheDocument();
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Create the barrel**

Create `apps/frontend/src/shared/lib/feature-flags/index.ts`:

```ts
export {
  DEFAULT_FLAGS,
  FEATURE_FLAG_CODES,
  parseFlagsFromEnv,
  type FeatureFlagCode,
  type FeatureFlagMap,
} from './flags.js';
export { FeatureFlagsContext, FeatureFlagsProvider } from './provider.js';
export { useFeatureFlag } from './useFeatureFlag.js';
export { FeatureFlag } from './FeatureFlag.js';
```

- [ ] **Step 7: Mount the provider at the app root**

Create `apps/frontend/src/app/providers/FeatureFlagsProvider.tsx`:

```tsx
import * as React from 'react';

import { FeatureFlagsProvider as Provider } from '@/shared/lib/feature-flags';

/**
 * App-level wrapper around `FeatureFlagsProvider` from `shared/lib`. Lives in
 * `app/providers/` alongside `AuthProvider` / `QueryProvider` so the boot
 * order is obvious; the underlying provider is a re-export to make it easy
 * for tests / Storybook to inject an explicit `flags` prop.
 */
export function FeatureFlagsProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <Provider>{children}</Provider>;
}
```

Modify `apps/frontend/src/app/router/routes/__root.tsx` — wrap the `<Outlet>` so every route (public + app) sees the same flag context:

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import * as React from 'react';

import { FeatureFlagsProvider } from '@/app/providers/FeatureFlagsProvider';

/**
 * Bare root layout. Chrome lives in the `_public` and `_app` layout routes;
 * the root only renders the outlet and the dev-only devtools panel. The
 * `<FeatureFlagsProvider>` wraps everything so anonymous public pages
 * (e.g. `/ranks/:slug`) can read flags too.
 */
function RootComponent(): React.ReactElement {
  return (
    <FeatureFlagsProvider>
      <Outlet />
      {import.meta.env.DEV ? (
        <React.Suspense fallback={null}>
          <TanStackRouterDevtools position="bottom-right" />
        </React.Suspense>
      ) : null}
    </FeatureFlagsProvider>
  );
}

export const rootRoute = createRootRoute({
  component: RootComponent,
});

export const Route = rootRoute;
```

- [ ] **Step 8: Document the env var in `.env.example`**

Add this block to `.env.example` immediately below the existing `VITE_API_URL` line:

```
# Feature flags — JSON object keyed by code, values are booleans.
# Known codes: grading-history, grading-history-verification, instructor-feedback.
# Defaults to all-off; only flags explicitly set to `true` are enabled.
VITE_FEATURE_FLAGS={}
```

- [ ] **Step 9: Steiger override for the test file**

Modify `apps/frontend/steiger.config.js` — the test imports the deep paths inside its own slice (no public-API sidestep), but Steiger's `fsd/insignificant-slice` rule may warn about a single-file segment. We pre-emptively allow that rule to stay at `warn` (already the project default). NO config change required if `shared/lib/feature-flags/` has at least 5 files (it has 6: `flags.ts`, `provider.tsx`, `useFeatureFlag.ts`, `FeatureFlag.tsx`, `useFeatureFlag.test.tsx`, `index.ts`). Skip Step 9 unless `pnpm --filter frontend arch` complains; if it does, append this override before the closing `]`:

```js
  {
    files: ['src/shared/lib/feature-flags/**'],
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
```

- [ ] **Step 10: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/shared/lib/feature-flags/useFeatureFlag.test.tsx
```

Expected: PASS — all three `describe` blocks pass (5 + 2 + 2 = 9 cases). No other test files touched.

- [ ] **Step 11: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS — `tsc --noEmit` exits 0; Steiger reports no errors (warnings about insignificant-slice are acceptable if rule is at `warn`).

- [ ] **Step 12: Commit**

```
git add apps/frontend/src/shared/lib/feature-flags apps/frontend/src/app/providers/FeatureFlagsProvider.tsx apps/frontend/src/app/router/routes/__root.tsx .env.example apps/frontend/steiger.config.js
git commit -m "feat(frontend): env-driven feature-flag infrastructure (typed registry + provider + hook)"
```

---

### Task 3: Entity slice — `entities/belt-system/`

**Files:**

- Create: `apps/frontend/src/entities/belt-system/api/belt-system.api.ts`
- Create: `apps/frontend/src/entities/belt-system/api/belt-system.api.test.ts`
- Create: `apps/frontend/src/entities/belt-system/model/belt-system.queries.ts`
- Create: `apps/frontend/src/entities/belt-system/index.ts`

- [ ] **Step 1: Write the failing API test**

Create `apps/frontend/src/entities/belt-system/api/belt-system.api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createBeltSystem,
  deleteBeltSystem,
  getBeltSystems,
  updateBeltSystem,
} from './belt-system.api.js';

import { httpClient } from '@/shared/api';

const ROW = {
  id: 'sys-1',
  code: 'kyu',
  nameEn: 'Kyu',
  nameSv: 'Kyu',
  nameFi: 'Kyu',
  organisationId: null,
  sortOrder: 1,
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt: '2026-05-24T08:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('belt-system api', () => {
  it('getBeltSystems GETs /api/belt-systems', async () => {
    mockedHttp.mockResolvedValueOnce([ROW]);
    const out = await getBeltSystems();
    expect(mockedHttp).toHaveBeenCalledWith('/api/belt-systems');
    expect(out[0]?.code).toBe('kyu');
  });

  it('createBeltSystem POSTs /api/belt-systems', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await createBeltSystem({
      code: 'kyu',
      nameEn: 'Kyu',
      nameSv: 'Kyu',
      nameFi: 'Kyu',
    });
    expect(mockedHttp).toHaveBeenCalledWith('/api/belt-systems', {
      method: 'POST',
      body: { code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu', nameFi: 'Kyu' },
    });
  });

  it('updateBeltSystem PATCHes /api/belt-systems/:id', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await updateBeltSystem('sys-1', { sortOrder: 5 });
    expect(mockedHttp).toHaveBeenCalledWith('/api/belt-systems/sys-1', {
      method: 'PATCH',
      body: { sortOrder: 5 },
    });
  });

  it('deleteBeltSystem DELETEs /api/belt-systems/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteBeltSystem('sys-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/belt-systems/sys-1', {
      method: 'DELETE',
    });
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/entities/belt-system/api/belt-system.api.test.ts
```

Expected: FAIL — `Failed to resolve import "./belt-system.api.js"` because the API module does not exist yet.

- [ ] **Step 3: Create the API module**

Create `apps/frontend/src/entities/belt-system/api/belt-system.api.ts`:

```ts
import {
  BeltSystemSchema,
  type BeltSystem,
  type CreateBeltSystemInput,
  type UpdateBeltSystemInput,
} from '@repo/contracts/belt-systems';
import { BeltSystemsRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the BeltSystem entity. */

export async function getBeltSystems(): Promise<BeltSystem[]> {
  const raw = await httpClient(BeltSystemsRoutes.base);
  return BeltSystemSchema.array().parse(raw);
}

export async function createBeltSystem(input: CreateBeltSystemInput): Promise<BeltSystem> {
  const raw = await httpClient(BeltSystemsRoutes.base, { method: 'POST', body: input });
  return BeltSystemSchema.parse(raw);
}

export async function updateBeltSystem(
  id: string,
  input: UpdateBeltSystemInput,
): Promise<BeltSystem> {
  const raw = await httpClient(BeltSystemsRoutes.byId(id), { method: 'PATCH', body: input });
  return BeltSystemSchema.parse(raw);
}

export async function deleteBeltSystem(id: string): Promise<void> {
  await httpClient(BeltSystemsRoutes.byId(id), { method: 'DELETE' });
}
```

- [ ] **Step 4: Create the query/mutation module**

Create `apps/frontend/src/entities/belt-system/model/belt-system.queries.ts`:

```ts
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  BeltSystem,
  CreateBeltSystemInput,
  UpdateBeltSystemInput,
} from '@repo/contracts/belt-systems';

import {
  createBeltSystem,
  deleteBeltSystem,
  getBeltSystems,
  updateBeltSystem,
} from '../api/belt-system.api.js';

export const beltSystemKeys = {
  all: ['belt-systems'] as const,
  list: () => [...beltSystemKeys.all, 'list'] as const,
};

export function listBeltSystemsQueryOptions() {
  return queryOptions({
    queryKey: beltSystemKeys.list(),
    queryFn: () => getBeltSystems(),
  });
}

/**
 * onSuccess composition: spread caller `options` FIRST, then define the
 * invalidating `onSuccess` AFTER, so a caller-supplied `onSuccess` cannot
 * overwrite the invalidation.
 */
export function useCreateBeltSystem(
  options?: Omit<UseMutationOptions<BeltSystem, Error, CreateBeltSystemInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBeltSystem,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltSystemKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateBeltSystem(
  options?: Omit<
    UseMutationOptions<BeltSystem, Error, { id: string; input: UpdateBeltSystemInput }>,
    'mutationFn'
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }) => updateBeltSystem(id, input),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltSystemKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteBeltSystem(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBeltSystem(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltSystemKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}
```

- [ ] **Step 5: Create the barrel**

Create `apps/frontend/src/entities/belt-system/index.ts`:

```ts
export type {
  BeltSystem,
  CreateBeltSystemInput,
  UpdateBeltSystemInput,
} from '@repo/contracts/belt-systems';

export {
  createBeltSystem,
  deleteBeltSystem,
  getBeltSystems,
  updateBeltSystem,
} from './api/belt-system.api.js';

export {
  beltSystemKeys,
  listBeltSystemsQueryOptions,
  useCreateBeltSystem,
  useDeleteBeltSystem,
  useUpdateBeltSystem,
} from './model/belt-system.queries.js';
```

- [ ] **Step 6: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/entities/belt-system/api/belt-system.api.test.ts
```

Expected: PASS — all 4 cases pass.

- [ ] **Step 7: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```
git add apps/frontend/src/entities/belt-system
git commit -m "feat(frontend): entities/belt-system — api + queries + mutations"
```

---

### Task 4: Entity slice — `entities/belt-rank/`

**Files:**

- Create: `apps/frontend/src/entities/belt-rank/api/belt-rank.api.ts`
- Create: `apps/frontend/src/entities/belt-rank/api/belt-rank.api.test.ts`
- Create: `apps/frontend/src/entities/belt-rank/model/belt-rank.queries.ts`
- Create: `apps/frontend/src/entities/belt-rank/index.ts`

- [ ] **Step 1: Write the failing API test**

Create `apps/frontend/src/entities/belt-rank/api/belt-rank.api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createBeltRank,
  deleteBeltRank,
  getBeltRank,
  getBeltRanks,
  updateBeltRank,
} from './belt-rank.api.js';

import { httpClient } from '@/shared/api';

const ROW = {
  id: 'rank-1',
  organisationId: null,
  systemId: 'sys-1',
  level: 1,
  sortOrder: 10,
  nameJa: null,
  nameRomaji: 'Jukyu',
  nameEn: '10th Kyu',
  nameSv: '10 Kyu',
  nameFi: '10. Kyu',
  beltColor: '#FFFFFF',
  imageUrl: null,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt: '2026-05-24T08:00:00.000Z',
};

const mockedHttp = vi.mocked(httpClient);

describe('belt-rank api', () => {
  it('getBeltRanks GETs /api/ranks', async () => {
    mockedHttp.mockResolvedValueOnce([ROW]);
    const out = await getBeltRanks();
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks');
    expect(out[0]?.nameRomaji).toBe('Jukyu');
  });

  it('getBeltRank GETs /api/ranks/:id', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await getBeltRank('rank-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks/rank-1');
  });

  it('createBeltRank POSTs /api/ranks', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await createBeltRank({
      systemId: 'sys-1',
      level: 1,
      nameRomaji: 'Jukyu',
      beltColor: '#FFFFFF',
    });
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks', {
      method: 'POST',
      body: { systemId: 'sys-1', level: 1, nameRomaji: 'Jukyu', beltColor: '#FFFFFF' },
    });
  });

  it('updateBeltRank PATCHes /api/ranks/:id', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await updateBeltRank('rank-1', { sortOrder: 99 });
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks/rank-1', {
      method: 'PATCH',
      body: { sortOrder: 99 },
    });
  });

  it('deleteBeltRank DELETEs /api/ranks/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteBeltRank('rank-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/ranks/rank-1', { method: 'DELETE' });
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/entities/belt-rank/api/belt-rank.api.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create the API module**

Create `apps/frontend/src/entities/belt-rank/api/belt-rank.api.ts`:

```ts
import {
  BeltRankSchema,
  type BeltRank,
  type CreateBeltRankInput,
  type UpdateBeltRankInput,
} from '@repo/contracts/ranks';
import { BeltRanksRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the BeltRank entity. */

export async function getBeltRanks(): Promise<BeltRank[]> {
  const raw = await httpClient(BeltRanksRoutes.base);
  return BeltRankSchema.array().parse(raw);
}

export async function getBeltRank(id: string): Promise<BeltRank> {
  const raw = await httpClient(BeltRanksRoutes.byId(id));
  return BeltRankSchema.parse(raw);
}

export async function createBeltRank(input: CreateBeltRankInput): Promise<BeltRank> {
  const raw = await httpClient(BeltRanksRoutes.base, { method: 'POST', body: input });
  return BeltRankSchema.parse(raw);
}

export async function updateBeltRank(
  id: string,
  input: UpdateBeltRankInput,
): Promise<BeltRank> {
  const raw = await httpClient(BeltRanksRoutes.byId(id), { method: 'PATCH', body: input });
  return BeltRankSchema.parse(raw);
}

export async function deleteBeltRank(id: string): Promise<void> {
  await httpClient(BeltRanksRoutes.byId(id), { method: 'DELETE' });
}
```

- [ ] **Step 4: Create the query/mutation module**

Create `apps/frontend/src/entities/belt-rank/model/belt-rank.queries.ts`:

```ts
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  BeltRank,
  CreateBeltRankInput,
  UpdateBeltRankInput,
} from '@repo/contracts/ranks';

import {
  createBeltRank,
  deleteBeltRank,
  getBeltRank,
  getBeltRanks,
  updateBeltRank,
} from '../api/belt-rank.api.js';

export const beltRankKeys = {
  all: ['belt-ranks'] as const,
  list: () => [...beltRankKeys.all, 'list'] as const,
  byId: (id: string) => [...beltRankKeys.all, 'byId', id] as const,
};

export function listBeltRanksQueryOptions() {
  return queryOptions({
    queryKey: beltRankKeys.list(),
    queryFn: () => getBeltRanks(),
  });
}

export function beltRankQueryOptions(id: string) {
  return queryOptions({
    queryKey: beltRankKeys.byId(id),
    queryFn: () => getBeltRank(id),
  });
}

export function useCreateBeltRank(
  options?: Omit<UseMutationOptions<BeltRank, Error, CreateBeltRankInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBeltRank,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltRankKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateBeltRank(
  options?: Omit<
    UseMutationOptions<BeltRank, Error, { id: string; input: UpdateBeltRankInput }>,
    'mutationFn'
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }) => updateBeltRank(id, input),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltRankKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteBeltRank(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBeltRank(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: beltRankKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}
```

- [ ] **Step 5: Create the barrel**

Create `apps/frontend/src/entities/belt-rank/index.ts`:

```ts
export type {
  BeltRank,
  CreateBeltRankInput,
  UpdateBeltRankInput,
} from '@repo/contracts/ranks';

export {
  createBeltRank,
  deleteBeltRank,
  getBeltRank,
  getBeltRanks,
  updateBeltRank,
} from './api/belt-rank.api.js';

export {
  beltRankKeys,
  beltRankQueryOptions,
  listBeltRanksQueryOptions,
  useCreateBeltRank,
  useDeleteBeltRank,
  useUpdateBeltRank,
} from './model/belt-rank.queries.js';
```

- [ ] **Step 6: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/entities/belt-rank/api/belt-rank.api.test.ts
```

Expected: PASS — all 5 cases.

- [ ] **Step 7: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```
git add apps/frontend/src/entities/belt-rank
git commit -m "feat(frontend): entities/belt-rank — api + queries + mutations (incl. byId)"
```

---

### Task 5: Entity slice — `entities/shogo-title/`

**Files:**

- Create: `apps/frontend/src/entities/shogo-title/api/shogo-title.api.ts`
- Create: `apps/frontend/src/entities/shogo-title/api/shogo-title.api.test.ts`
- Create: `apps/frontend/src/entities/shogo-title/model/shogo-title.queries.ts`
- Create: `apps/frontend/src/entities/shogo-title/index.ts`

- [ ] **Step 1: Write the failing API test**

Create `apps/frontend/src/entities/shogo-title/api/shogo-title.api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createShogoTitle,
  deleteShogoTitle,
  getShogoTitles,
  updateShogoTitle,
} from './shogo-title.api.js';

import { httpClient } from '@/shared/api';

const ROW = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: 'rank-1',
  sortOrder: 1,
};

const mockedHttp = vi.mocked(httpClient);

describe('shogo-title api', () => {
  it('getShogoTitles GETs /api/shogo-titles', async () => {
    mockedHttp.mockResolvedValueOnce([ROW]);
    const out = await getShogoTitles();
    expect(mockedHttp).toHaveBeenCalledWith('/api/shogo-titles');
    expect(out[0]?.code).toBe('renshi');
  });

  it('createShogoTitle POSTs /api/shogo-titles', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await createShogoTitle(ROW);
    expect(mockedHttp).toHaveBeenCalledWith('/api/shogo-titles', {
      method: 'POST',
      body: ROW,
    });
  });

  it('updateShogoTitle PATCHes /api/shogo-titles/:code', async () => {
    mockedHttp.mockResolvedValueOnce(ROW);
    await updateShogoTitle('renshi', { sortOrder: 9 });
    expect(mockedHttp).toHaveBeenCalledWith('/api/shogo-titles/renshi', {
      method: 'PATCH',
      body: { sortOrder: 9 },
    });
  });

  it('deleteShogoTitle DELETEs /api/shogo-titles/:code', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteShogoTitle('renshi');
    expect(mockedHttp).toHaveBeenCalledWith('/api/shogo-titles/renshi', { method: 'DELETE' });
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/entities/shogo-title/api/shogo-title.api.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create the API module**

Create `apps/frontend/src/entities/shogo-title/api/shogo-title.api.ts`:

```ts
import {
  ShogoTitleSchema,
  type CreateShogoTitleInput,
  type ShogoTitle,
  type UpdateShogoTitleInput,
} from '@repo/contracts/shogo-titles';
import { ShogoTitlesRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the ShogoTitle entity. NOTE: shogos use `code` (string)
 * as their path key — not a uuid.
 */

export async function getShogoTitles(): Promise<ShogoTitle[]> {
  const raw = await httpClient(ShogoTitlesRoutes.base);
  return ShogoTitleSchema.array().parse(raw);
}

export async function createShogoTitle(input: CreateShogoTitleInput): Promise<ShogoTitle> {
  const raw = await httpClient(ShogoTitlesRoutes.base, { method: 'POST', body: input });
  return ShogoTitleSchema.parse(raw);
}

export async function updateShogoTitle(
  code: string,
  input: UpdateShogoTitleInput,
): Promise<ShogoTitle> {
  const raw = await httpClient(ShogoTitlesRoutes.byCode(code), { method: 'PATCH', body: input });
  return ShogoTitleSchema.parse(raw);
}

export async function deleteShogoTitle(code: string): Promise<void> {
  await httpClient(ShogoTitlesRoutes.byCode(code), { method: 'DELETE' });
}
```

- [ ] **Step 4: Create the query/mutation module**

Create `apps/frontend/src/entities/shogo-title/model/shogo-title.queries.ts`:

```ts
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type {
  CreateShogoTitleInput,
  ShogoTitle,
  UpdateShogoTitleInput,
} from '@repo/contracts/shogo-titles';

import {
  createShogoTitle,
  deleteShogoTitle,
  getShogoTitles,
  updateShogoTitle,
} from '../api/shogo-title.api.js';

export const shogoTitleKeys = {
  all: ['shogo-titles'] as const,
  list: () => [...shogoTitleKeys.all, 'list'] as const,
};

export function listShogoTitlesQueryOptions() {
  return queryOptions({
    queryKey: shogoTitleKeys.list(),
    queryFn: () => getShogoTitles(),
  });
}

export function useCreateShogoTitle(
  options?: Omit<UseMutationOptions<ShogoTitle, Error, CreateShogoTitleInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createShogoTitle,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: shogoTitleKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateShogoTitle(
  options?: Omit<
    UseMutationOptions<ShogoTitle, Error, { code: string; input: UpdateShogoTitleInput }>,
    'mutationFn'
  >,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, input }) => updateShogoTitle(code, input),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: shogoTitleKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteShogoTitle(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => deleteShogoTitle(code),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: shogoTitleKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}
```

- [ ] **Step 5: Create the barrel**

Create `apps/frontend/src/entities/shogo-title/index.ts`:

```ts
export type {
  CreateShogoTitleInput,
  ShogoTitle,
  UpdateShogoTitleInput,
} from '@repo/contracts/shogo-titles';

export {
  createShogoTitle,
  deleteShogoTitle,
  getShogoTitles,
  updateShogoTitle,
} from './api/shogo-title.api.js';

export {
  listShogoTitlesQueryOptions,
  shogoTitleKeys,
  useCreateShogoTitle,
  useDeleteShogoTitle,
  useUpdateShogoTitle,
} from './model/shogo-title.queries.js';
```

- [ ] **Step 6: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/entities/shogo-title/api/shogo-title.api.test.ts
```

Expected: PASS — all 4 cases.

- [ ] **Step 7: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```
git add apps/frontend/src/entities/shogo-title
git commit -m "feat(frontend): entities/shogo-title — api + queries + mutations (code path key)"
```

---

### Task 6: Shared lib — `belt-visuals` (ported verbatim from Taidopass)

**Files:**

- Create: `apps/frontend/src/shared/lib/belt-visuals/belt-visuals.ts`
- Create: `apps/frontend/src/shared/lib/belt-visuals/belt-visuals.test.ts`
- Create: `apps/frontend/src/shared/lib/belt-visuals/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/shared/lib/belt-visuals/belt-visuals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { getBeltVisuals } from './belt-visuals.js';

describe('getBeltVisuals — kyu', () => {
  it('level 0 (Mukyu) → white, no badge', () => {
    expect(getBeltVisuals('kyu', 0)).toEqual({ gradient: 'white', badge: false });
  });

  it('level 1 (Kukyu) → yellow, no badge (odd levels = no badge)', () => {
    expect(getBeltVisuals('kyu', 1)).toEqual({ gradient: 'yellow', badge: false });
  });

  it('level 2 (Hachikyu) → yellow with badge (even non-zero = badge)', () => {
    expect(getBeltVisuals('kyu', 2)).toEqual({ gradient: 'yellow', badge: true });
  });

  it('level 5 (Gokyu) → green, no badge', () => {
    expect(getBeltVisuals('kyu', 5)).toEqual({ gradient: 'green', badge: false });
  });

  it('level 8 (Ikkyu) → brown with badge', () => {
    expect(getBeltVisuals('kyu', 8)).toEqual({ gradient: 'brown', badge: true });
  });
});

describe('getBeltVisuals — dan', () => {
  it('plain dan → black, no overlay', () => {
    expect(getBeltVisuals('dan', 1)).toEqual({ gradient: 'black', overlayTopHalf: undefined });
  });

  it('dan + renshi → black with magenta top half', () => {
    expect(getBeltVisuals('dan', 4, 'renshi')).toEqual({
      gradient: 'black',
      overlayTopHalf: 'magenta',
    });
  });

  it('dan + kyoshi → black with green top half', () => {
    expect(getBeltVisuals('dan', 6, 'kyoshi')).toEqual({
      gradient: 'black',
      overlayTopHalf: 'green',
    });
  });

  it('dan + hanshi → black with brown top half', () => {
    expect(getBeltVisuals('dan', 7, 'hanshi')).toEqual({
      gradient: 'black',
      overlayTopHalf: 'brown',
    });
  });
});

describe('getBeltVisuals — mon', () => {
  it('level 1 (pos 0 of magenta group) → white base, magenta gradient mid-line, no stripe', () => {
    expect(getBeltVisuals('mon', 1)).toEqual({
      gradient: 'white',
      midLine: 'magenta',
      midLineGradient: true,
      stripe: undefined,
    });
  });

  it('level 2 (pos 1) → white base, magenta gradient mid-line, black stripe', () => {
    expect(getBeltVisuals('mon', 2)).toEqual({
      gradient: 'white',
      midLine: 'magenta',
      midLineGradient: true,
      stripe: 'black',
    });
  });

  it('level 3 (pos 2) → magenta base, white flat mid-line, no stripe', () => {
    expect(getBeltVisuals('mon', 3)).toEqual({
      gradient: 'magenta',
      midLine: 'white',
      midLineGradient: false,
      stripe: undefined,
    });
  });

  it('level 12 (pos 3 of brown group) → brown base, white flat mid-line, black stripe', () => {
    expect(getBeltVisuals('mon', 12)).toEqual({
      gradient: 'brown',
      midLine: 'white',
      midLineGradient: false,
      stripe: 'black',
    });
  });
});

describe('getBeltVisuals — fallback', () => {
  it('unknown system → plain white', () => {
    expect(getBeltVisuals('unknown', 5)).toEqual({ gradient: 'white' });
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/shared/lib/belt-visuals/belt-visuals.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create the module (ported verbatim — see source rules in docblock)**

Create `apps/frontend/src/shared/lib/belt-visuals/belt-visuals.ts`:

```ts
import type { BeltColor, BeltGraphicProps } from '@/shared/ui/belt-graphic';

/**
 * Map a belt rank to its visual representation. The rule table is sourced
 * from the Taidopass codebase verbatim:
 *
 *  - KYU (level 0..8): KYU_COLORS = ['white','yellow','yellow','magenta',
 *    'magenta','green','green','brown','brown']; badge=true when level>0 and
 *    level is even.
 *  - DAN: always black; optional `overlayTopHalf` from SHOGO_COLORS = {
 *    renshi:'magenta', kyoshi:'green', hanshi:'brown' }.
 *  - MON (level 1..12): cycles in groups of 4. Color cycles every 4 levels
 *    (1-4 magenta, 5-8 green, 9-12 brown). Within each group of 4, pos =
 *    (level-1) % 4 selects the styling — see the table comment below.
 */

export type BeltVisuals = Omit<BeltGraphicProps, 'className'>;

const KYU_COLORS: BeltColor[] = [
  'white',
  'yellow',
  'yellow',
  'magenta',
  'magenta',
  'green',
  'green',
  'brown',
  'brown',
];

const SHOGO_COLORS: Record<string, BeltColor> = {
  renshi: 'magenta',
  kyoshi: 'green',
  hanshi: 'brown',
};

const MON_COLORS: BeltColor[] = [
  'magenta',
  'magenta',
  'magenta',
  'magenta',
  'green',
  'green',
  'green',
  'green',
  'brown',
  'brown',
  'brown',
  'brown',
];

export function getBeltVisuals(
  systemCode: string,
  level: number,
  shogoTitle?: string | null,
): BeltVisuals {
  if (systemCode === 'dan') return getDanVisuals(shogoTitle);
  if (systemCode === 'kyu') return getKyuVisuals(level);
  if (systemCode === 'mon') return getMonVisuals(level);
  return { gradient: 'white' };
}

function getKyuVisuals(level: number): BeltVisuals {
  const gradient = KYU_COLORS[level] ?? 'white';
  const badge = level > 0 && level % 2 === 0;
  return { gradient, badge };
}

function getDanVisuals(shogoTitle?: string | null): BeltVisuals {
  const overlayTopHalf = shogoTitle ? SHOGO_COLORS[shogoTitle.toLowerCase()] : undefined;
  return { gradient: 'black', overlayTopHalf };
}

/**
 * Within each group of 4 (pos = (level - 1) % 4):
 *   0: white base, colored mid-line (gradient), no stripe
 *   1: white base, colored mid-line (gradient), black stripe
 *   2: colored base, white mid-line (flat), no stripe
 *   3: colored base, white mid-line (flat), black stripe
 */
function getMonVisuals(level: number): BeltVisuals {
  const idx = Math.max(0, level - 1);
  const color = MON_COLORS[idx] ?? 'magenta';
  const pos = idx % 4;

  const isWhiteBase = pos <= 1;
  const hasStripe = pos === 1 || pos === 3;

  return {
    gradient: isWhiteBase ? 'white' : color,
    midLine: isWhiteBase ? color : 'white',
    midLineGradient: isWhiteBase,
    stripe: hasStripe ? 'black' : undefined,
  };
}
```

NOTE: this file imports `BeltColor` and `BeltGraphicProps` from `@/shared/ui/belt-graphic`, which Task 8 creates. To avoid a chicken-and-egg failure, Task 8 must run before this test passes — but the test we wrote here is purely about the return values. To bridge: in Step 4 we re-order — the BeltGraphic primitive (Task 8) lands FIRST. **Revise sequencing**: do Task 8 (Step 1-7) BEFORE finishing this task's Step 4. Or, simpler, inline the two types here and re-export them from BeltGraphic in Task 8. The plan takes the inline-then-reexport approach:

Replace the import at the top of `belt-visuals.ts` with the local declaration block:

```ts
/**
 * Local mirrors of the BeltGraphic prop surface — kept here so this module
 * has no upward (shared/lib → shared/ui) dependency. `BeltGraphic` re-exports
 * these so consumers can rely on a single canonical shape.
 */
export type BeltColor = 'yellow' | 'magenta' | 'green' | 'brown' | 'black' | 'white';

export interface BeltVisuals {
  gradient: BeltColor;
  badge?: boolean;
  stripe?: BeltColor;
  midLine?: BeltColor;
  midLineGradient?: boolean;
  overlayTopHalf?: BeltColor;
}
```

Remove the `import type` line and the `export type BeltVisuals = Omit<...>` line; use the local interface instead.

- [ ] **Step 4: Create the barrel**

Create `apps/frontend/src/shared/lib/belt-visuals/index.ts`:

```ts
export { getBeltVisuals } from './belt-visuals.js';
export type { BeltColor, BeltVisuals } from './belt-visuals.js';
```

- [ ] **Step 5: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/shared/lib/belt-visuals/belt-visuals.test.ts
```

Expected: PASS — all 13 cases.

- [ ] **Step 6: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/shared/lib/belt-visuals
git commit -m "feat(frontend): shared/lib/belt-visuals — port belt rule table from Taidopass"
```

---

### Task 7: Shared lib — `rank-label` (ported verbatim)

**Files:**

- Create: `apps/frontend/src/shared/lib/rank-label/rank-label.ts`
- Create: `apps/frontend/src/shared/lib/rank-label/rank-label.test.ts`
- Create: `apps/frontend/src/shared/lib/rank-label/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/shared/lib/rank-label/rank-label.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { rankLabel } from './rank-label.js';

const RANK = {
  nameRomaji: 'Jukyu',
  nameEn: '10th Kyu',
  nameSv: '10 Kyu',
  nameFi: '10. Kyu',
};

describe('rankLabel', () => {
  it('returns "{romaji} — {english}" for lang=en', () => {
    expect(rankLabel(RANK, 'en')).toBe('Jukyu — 10th Kyu');
  });

  it('returns Finnish locale for lang=fi', () => {
    expect(rankLabel(RANK, 'fi')).toBe('Jukyu — 10. Kyu');
  });

  it('returns Swedish locale for lang=sv', () => {
    expect(rankLabel(RANK, 'sv')).toBe('Jukyu — 10 Kyu');
  });

  it('narrows BCP-47 tags (en-US → en)', () => {
    expect(rankLabel(RANK, 'en-US')).toBe('Jukyu — 10th Kyu');
  });

  it('falls back to English for unknown lang', () => {
    expect(rankLabel(RANK, 'de')).toBe('Jukyu — 10th Kyu');
  });

  it('returns romaji only when the localised name is empty', () => {
    expect(rankLabel({ ...RANK, nameEn: '' }, 'en')).toBe('Jukyu');
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/shared/lib/rank-label/rank-label.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create the module**

Create `apps/frontend/src/shared/lib/rank-label/rank-label.ts`:

```ts
/**
 * Format a belt rank for display: `"{romaji} — {localised}"`, falling back to
 * `"{romaji}"` when the localised name is empty. Ported verbatim from the
 * Taidopass `lib/rankLabel.ts` module; the narrowing behaviour (BCP-47
 * `en-US` → `en`, unknown → `en`) is preserved.
 */

export type Lang = 'en' | 'sv' | 'fi';

export interface RankLabelInput {
  nameRomaji: string;
  nameEn: string;
  nameSv: string;
  nameFi: string;
}

function narrowLang(raw: string): Lang {
  if (raw === 'en' || raw === 'sv' || raw === 'fi') return raw;
  const base = raw.split('-')[0];
  if (base === 'en' || base === 'sv' || base === 'fi') return base;
  return 'en';
}

export function rankLabel(rank: RankLabelInput, rawLang: string): string {
  const lang = narrowLang(rawLang);
  const localised =
    lang === 'en' ? rank.nameEn : lang === 'fi' ? rank.nameFi : rank.nameSv;
  return localised ? `${rank.nameRomaji} — ${localised}` : rank.nameRomaji;
}
```

- [ ] **Step 4: Create the barrel**

Create `apps/frontend/src/shared/lib/rank-label/index.ts`:

```ts
export { rankLabel } from './rank-label.js';
export type { Lang, RankLabelInput } from './rank-label.js';
```

- [ ] **Step 5: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/shared/lib/rank-label/rank-label.test.ts
```

Expected: PASS — all 6 cases.

- [ ] **Step 6: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/shared/lib/rank-label
git commit -m "feat(frontend): shared/lib/rank-label — port rankLabel helper from Taidopass"
```

---

### Task 8: Shared UI — `BeltGraphic` primitive

**Files:**

- Create: `apps/frontend/src/shared/ui/belt-graphic/BeltGraphic.tsx`
- Create: `apps/frontend/src/shared/ui/belt-graphic/index.ts`

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/shared/ui/belt-graphic/BeltGraphic.tsx`:

```tsx
import * as React from 'react';

import { cn } from '@/shared/lib/utils';
import type { BeltColor } from '@/shared/lib/belt-visuals';

/**
 * BeltGraphic — a pure presentational belt swatch. Ported from the Taidopass
 * `components/ui/BeltGraphic.tsx`. The GRADIENTS / FLAT_COLORS tables stay
 * inline (this is the only consumer of those particular hex strings; a token
 * migration would happen at the design-system level, not here).
 */

export type { BeltColor } from '@/shared/lib/belt-visuals';

export interface BeltGraphicProps {
  /** Base belt gradient. */
  gradient: BeltColor;
  /** Black rectangle near right end (kyu odd levels). */
  badge?: boolean;
  /** Vertical stripe near right end (mon odd levels). */
  stripe?: BeltColor;
  /** Horizontal center line — plain color or gradient. */
  midLine?: BeltColor;
  /** Whether midLine uses a gradient or flat color. */
  midLineGradient?: boolean;
  /** Colored top half overlay (shogo belts). */
  overlayTopHalf?: BeltColor;
  className?: string;
}

const GRADIENTS: Record<BeltColor, string> = {
  yellow: 'linear-gradient(to bottom, #FFDF00, #FFBF00)',
  magenta: 'linear-gradient(to bottom, #AC92EC, #967ADC)',
  green: 'linear-gradient(to bottom, #209920, #1B601C)',
  brown: 'linear-gradient(to bottom, #AF6F09, #704A07)',
  black: 'linear-gradient(to bottom, #333333, #111111)',
  white: 'linear-gradient(to bottom, #fefefe, #fdfdfd)',
};

const FLAT_COLORS: Record<BeltColor, string> = {
  yellow: '#FFDF00',
  magenta: '#AC92EC',
  green: '#209920',
  brown: '#AF6F09',
  black: '#000000',
  white: '#ffffff',
};

export function BeltGraphic({
  gradient,
  badge,
  stripe,
  midLine,
  midLineGradient,
  overlayTopHalf,
  className,
}: BeltGraphicProps): React.ReactElement {
  return (
    <div
      className={cn('relative flex flex-row justify-end rounded-sm shadow-lg', className)}
      style={{ height: 21, backgroundImage: GRADIENTS[gradient] }}
    >
      {overlayTopHalf ? (
        <div
          className="absolute left-0 top-0 w-full rounded-t-sm"
          style={{ height: 10, backgroundColor: FLAT_COLORS[overlayTopHalf] }}
        />
      ) : null}

      {midLine ? (
        <div
          className="absolute left-0 w-full self-center"
          style={{
            height: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            ...(midLineGradient
              ? { backgroundImage: GRADIENTS[midLine] }
              : { backgroundColor: FLAT_COLORS[midLine] }),
          }}
        />
      ) : null}

      {stripe ? (
        <div
          className="absolute right-3 top-0"
          style={{ width: 7, height: 21, backgroundColor: FLAT_COLORS[stripe] }}
        />
      ) : null}

      {badge ? (
        <div
          className="absolute right-3 top-[2px] rounded-sm"
          style={{
            width: '20%',
            minWidth: 15,
            maxWidth: 35,
            height: 17,
            backgroundColor: '#000000',
          }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Create the barrel**

Create `apps/frontend/src/shared/ui/belt-graphic/index.ts`:

```ts
export { BeltGraphic } from './BeltGraphic.js';
export type { BeltColor, BeltGraphicProps } from './BeltGraphic.js';
```

- [ ] **Step 3: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS — `cn` exists in `@/shared/lib/utils`; `BeltColor` is re-exported from `@/shared/lib/belt-visuals`.

- [ ] **Step 4: Commit**

```
git add apps/frontend/src/shared/ui/belt-graphic
git commit -m "feat(frontend): shared/ui/belt-graphic — port BeltGraphic primitive"
```

---

### Task 9: Shared UI — `BeltBadge` primitive

**Files:**

- Create: `apps/frontend/src/shared/ui/belt-badge/BeltBadge.tsx`
- Create: `apps/frontend/src/shared/ui/belt-badge/index.ts`

- [ ] **Step 1: Create the component**

Create `apps/frontend/src/shared/ui/belt-badge/BeltBadge.tsx`:

```tsx
import * as React from 'react';

import { cn } from '@/shared/lib/utils';

export interface BeltBadgeProps {
  /** Any valid CSS color — typically the rank's `beltColor` hex string. */
  color: string;
  /** Display label, e.g. `rankLabel(rank, lang)`. */
  label: string;
  className?: string;
}

/**
 * BeltBadge — a single-line pill with a colored dot and a label. Used in
 * compact list rows where a full `<BeltGraphic>` is too large.
 */
export function BeltBadge({ color, label, className }: BeltBadgeProps): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded bg-surface-container-high px-3 py-1 text-xs font-bold text-on-surface',
        className,
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Create the barrel**

Create `apps/frontend/src/shared/ui/belt-badge/index.ts`:

```ts
export { BeltBadge } from './BeltBadge.js';
export type { BeltBadgeProps } from './BeltBadge.js';
```

- [ ] **Step 3: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```
git add apps/frontend/src/shared/ui/belt-badge
git commit -m "feat(frontend): shared/ui/belt-badge — color-dot + label pill"
```

---

### Task 10: Feature — `features/belt-system-form/`

**Files:**

- Create: `apps/frontend/src/features/belt-system-form/ui/BeltSystemForm.tsx`
- Create: `apps/frontend/src/features/belt-system-form/ui/BeltSystemForm.test.tsx`
- Create: `apps/frontend/src/features/belt-system-form/index.ts`
- Modify: `apps/frontend/steiger.config.js` — add deep-mock override

- [ ] **Step 1: Create the form**

Create `apps/frontend/src/features/belt-system-form/ui/BeltSystemForm.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateBeltSystemSchema,
  type BeltSystem,
  type CreateBeltSystemInput,
} from '@repo/contracts/belt-systems';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useCreateBeltSystem, useUpdateBeltSystem } from '@/entities/belt-system';
import { listOrganisationsQueryOptions } from '@/entities/organisation';
import { useQuery } from '@tanstack/react-query';
import { HttpError } from '@/shared/api';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

export interface BeltSystemFormProps {
  /** Pre-populated row when editing; omitted when creating. */
  system?: BeltSystem;
  /** Fired after a successful save. The hub page closes the inline form / refetches. */
  onSaved?: () => void;
  /** Fired when the user cancels. The hub page hides the form. */
  onCancel?: () => void;
}

const NONE_ORG = '__none__';

export function BeltSystemForm({
  system,
  onSaved,
  onCancel,
}: BeltSystemFormProps): React.ReactElement {
  const { t } = useTranslation();
  const orgsQuery = useQuery(listOrganisationsQueryOptions());

  const form = useForm<CreateBeltSystemInput>({
    resolver: zodResolver(CreateBeltSystemSchema),
    defaultValues: {
      code: system?.code ?? '',
      nameEn: system?.nameEn ?? '',
      nameSv: system?.nameSv ?? '',
      nameFi: system?.nameFi ?? '',
      organisationId: system?.organisationId ?? null,
      sortOrder: system?.sortOrder ?? 0,
    },
  });

  const create = useCreateBeltSystem();
  const update = useUpdateBeltSystem();
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    try {
      if (system) {
        await update.mutateAsync({ id: system.id, input: values });
      } else {
        await create.mutateAsync(values);
      }
      onSaved?.();
    } catch (err) {
      setSubmitError(
        err instanceof HttpError
          ? err.message
          : t('common.unknownError', { defaultValue: 'Unknown error' }),
      );
    }
  });

  const pending = create.isPending || update.isPending;
  const orgs = orgsQuery.data ?? [];

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="bs-code">{t('admin.beltCatalog.fields.code')}</Label>
        <Input id="bs-code" maxLength={3} {...form.register('code')} />
        <FormMessage message={form.formState.errors.code?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="bs-name-en">{t('admin.beltCatalog.fields.nameEn')}</Label>
        <Input id="bs-name-en" {...form.register('nameEn')} />
        <FormMessage message={form.formState.errors.nameEn?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="bs-name-sv">{t('admin.beltCatalog.fields.nameSv')}</Label>
        <Input id="bs-name-sv" {...form.register('nameSv')} />
        <FormMessage message={form.formState.errors.nameSv?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="bs-name-fi">{t('admin.beltCatalog.fields.nameFi')}</Label>
        <Input id="bs-name-fi" {...form.register('nameFi')} />
        <FormMessage message={form.formState.errors.nameFi?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="bs-org">{t('admin.beltCatalog.fields.organisation')}</Label>
        <Select
          value={form.watch('organisationId') ?? NONE_ORG}
          onValueChange={(v) => form.setValue('organisationId', v === NONE_ORG ? null : v)}
        >
          <SelectTrigger id="bs-org" aria-label={t('admin.beltCatalog.fields.organisation')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_ORG}>{t('admin.beltCatalog.organisationGlobal')}</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nameEn} ({o.shortCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField>
        <Label htmlFor="bs-sort">{t('admin.beltCatalog.fields.sortOrder')}</Label>
        <Input
          id="bs-sort"
          type="number"
          {...form.register('sortOrder', { valueAsNumber: true })}
        />
      </FormField>

      <FormMessage message={submitError} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t('common.save')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the test**

Create `apps/frontend/src/features/belt-system-form/ui/BeltSystemForm.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/entities/belt-system/api/belt-system.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-system/api/belt-system.api.js')>();
  return {
    ...actual,
    createBeltSystem: vi.fn().mockResolvedValue({
      id: 'sys-new',
      code: 'kyu',
      nameEn: 'Kyu',
      nameSv: 'Kyu',
      nameFi: 'Kyu',
      organisationId: null,
      sortOrder: 0,
      createdAt: '2026-05-24T08:00:00.000Z',
      updatedAt: '2026-05-24T08:00:00.000Z',
    }),
  };
});
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return {
    ...actual,
    getOrganisations: vi.fn().mockResolvedValue([]),
  };
});

import { createBeltSystem } from '@/entities/belt-system/api/belt-system.api.js';

import { BeltSystemForm } from './BeltSystemForm.js';

import i18n from '@/i18n';

const mockedCreate = vi.mocked(createBeltSystem);

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <BeltSystemForm onSaved={onSaved} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSaved };
}

describe('<BeltSystemForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedCreate.mockClear();
  });

  it('submits valid values', async () => {
    const { user, onSaved } = renderForm();
    await user.type(screen.getByLabelText(/code/i), 'kyu');
    await user.type(screen.getByLabelText(/name \(english\)/i), 'Kyu');
    await user.type(screen.getByLabelText(/name \(swedish\)/i), 'Kyu');
    await user.type(screen.getByLabelText(/name \(finnish\)/i), 'Kyu');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled();
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows a validation error when code is missing', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).not.toHaveBeenCalled();
    });
    // RHF renders the message inside the FormMessage slot under the code input.
    expect(screen.getByLabelText(/code/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Create the barrel**

Create `apps/frontend/src/features/belt-system-form/index.ts`:

```ts
export { BeltSystemForm } from './ui/BeltSystemForm.js';
export type { BeltSystemFormProps } from './ui/BeltSystemForm.js';
```

- [ ] **Step 4: Steiger override**

Modify `apps/frontend/steiger.config.js` — add this override before the closing `]`:

```js
  {
    files: ['src/features/belt-system-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
```

- [ ] **Step 5: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/features/belt-system-form
```

Expected: PASS — both cases.

- [ ] **Step 6: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/features/belt-system-form apps/frontend/steiger.config.js
git commit -m "feat(frontend): features/belt-system-form — RHF + zodResolver against CreateBeltSystemSchema"
```

---

### Task 11: Feature — `features/belt-rank-form/`

**Files:**

- Create: `apps/frontend/src/features/belt-rank-form/ui/BeltRankForm.tsx`
- Create: `apps/frontend/src/features/belt-rank-form/ui/BeltRankForm.test.tsx`
- Create: `apps/frontend/src/features/belt-rank-form/index.ts`
- Modify: `apps/frontend/steiger.config.js` — add deep-mock override

- [ ] **Step 1: Create the form**

Create `apps/frontend/src/features/belt-rank-form/ui/BeltRankForm.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateBeltRankSchema,
  type BeltRank,
  type CreateBeltRankInput,
} from '@repo/contracts/ranks';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
  listBeltRanksQueryOptions,
  useCreateBeltRank,
  useUpdateBeltRank,
} from '@/entities/belt-rank';
import { listBeltSystemsQueryOptions } from '@/entities/belt-system';
import { listOrganisationsQueryOptions } from '@/entities/organisation';
import { HttpError } from '@/shared/api';
import { getBeltVisuals } from '@/shared/lib/belt-visuals';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';
import { BeltGraphic } from '@/shared/ui/belt-graphic';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

export interface BeltRankFormProps {
  /** Pre-populated row when editing. */
  rank?: BeltRank;
  onSaved?: () => void;
  onCancel?: () => void;
}

const NONE = '__none__';

export function BeltRankForm({
  rank,
  onSaved,
  onCancel,
}: BeltRankFormProps): React.ReactElement {
  const { t } = useTranslation();
  const systemsQuery = useQuery(listBeltSystemsQueryOptions());
  const ranksQuery = useQuery(listBeltRanksQueryOptions());
  const orgsQuery = useQuery(listOrganisationsQueryOptions());

  const form = useForm<CreateBeltRankInput>({
    resolver: zodResolver(CreateBeltRankSchema),
    defaultValues: {
      organisationId: rank?.organisationId ?? null,
      systemId: rank?.systemId ?? '',
      level: rank?.level ?? 1,
      sortOrder: rank?.sortOrder ?? 0,
      nameJa: rank?.nameJa ?? null,
      nameRomaji: rank?.nameRomaji ?? '',
      nameEn: rank?.nameEn ?? '',
      nameSv: rank?.nameSv ?? '',
      nameFi: rank?.nameFi ?? '',
      beltColor: rank?.beltColor ?? '#FFFFFF',
      imageUrl: rank?.imageUrl ?? null,
      descriptionEn: rank?.descriptionEn ?? null,
      descriptionSv: rank?.descriptionSv ?? null,
      descriptionFi: rank?.descriptionFi ?? null,
      publiclyVisible: rank?.publiclyVisible ?? false,
      slug: rank?.slug ?? null,
      minAge: rank?.minAge ?? null,
      nextRankId: rank?.nextRankId ?? null,
    },
  });

  const create = useCreateBeltRank();
  const update = useUpdateBeltRank();
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const onSubmit = form.handleSubmit(
    async (values) => {
      setSubmitError(undefined);
      // Service-side guard against `nextRankId` self-reference for edit mode.
      if (rank && values.nextRankId === rank.id) {
        setSubmitError(t('admin.beltCatalog.errors.nextRankSelf'));
        return;
      }
      try {
        if (rank) {
          await update.mutateAsync({ id: rank.id, input: values });
        } else {
          await create.mutateAsync(values);
        }
        onSaved?.();
      } catch (err) {
        setSubmitError(
          err instanceof HttpError
            ? err.message
            : t('common.unknownError', { defaultValue: 'Unknown error' }),
        );
      }
    },
  );

  const pending = create.isPending || update.isPending;
  const systems = systemsQuery.data ?? [];
  const ranks = ranksQuery.data ?? [];
  const orgs = orgsQuery.data ?? [];

  // Live preview for the BeltGraphic.
  const watchedSystemId = form.watch('systemId');
  const watchedLevel = form.watch('level');
  const watchedColor = form.watch('beltColor');
  const watchedPublic = form.watch('publiclyVisible');
  const watchedSystem = systems.find((s) => s.id === watchedSystemId);
  const visuals = watchedSystem
    ? getBeltVisuals(watchedSystem.code, Number(watchedLevel ?? 0))
    : { gradient: 'white' as const };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="rounded border border-outline-variant p-3">
        <div className="mb-2 text-xs uppercase text-on-surface-variant">
          {t('admin.beltCatalog.preview')}
        </div>
        <BeltGraphic {...visuals} className="w-full max-w-xs" />
        <div
          className="mt-2 h-3 w-full max-w-xs rounded"
          style={{ backgroundColor: watchedColor ?? '#ffffff' }}
          aria-label={t('admin.beltCatalog.fields.beltColor')}
        />
      </div>

      <FormField>
        <Label htmlFor="br-system">{t('admin.beltCatalog.fields.system')}</Label>
        <Select
          value={form.watch('systemId') || ''}
          onValueChange={(v) => form.setValue('systemId', v)}
        >
          <SelectTrigger id="br-system">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {systems.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nameEn} ({s.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage message={form.formState.errors.systemId?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-level">{t('admin.beltCatalog.fields.level')}</Label>
        <Input id="br-level" type="number" {...form.register('level', { valueAsNumber: true })} />
        <FormMessage message={form.formState.errors.level?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-sort">{t('admin.beltCatalog.fields.sortOrder')}</Label>
        <Input
          id="br-sort"
          type="number"
          {...form.register('sortOrder', { valueAsNumber: true })}
        />
      </FormField>

      <FormField>
        <Label htmlFor="br-romaji">{t('admin.beltCatalog.fields.nameRomaji')}</Label>
        <Input id="br-romaji" {...form.register('nameRomaji')} />
        <FormMessage message={form.formState.errors.nameRomaji?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-ja">{t('admin.beltCatalog.fields.nameJa')}</Label>
        <Input
          id="br-ja"
          {...form.register('nameJa', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>

      <FormField>
        <Label htmlFor="br-en">{t('admin.beltCatalog.fields.nameEn')}</Label>
        <Input id="br-en" {...form.register('nameEn')} />
      </FormField>
      <FormField>
        <Label htmlFor="br-sv">{t('admin.beltCatalog.fields.nameSv')}</Label>
        <Input id="br-sv" {...form.register('nameSv')} />
      </FormField>
      <FormField>
        <Label htmlFor="br-fi">{t('admin.beltCatalog.fields.nameFi')}</Label>
        <Input id="br-fi" {...form.register('nameFi')} />
      </FormField>

      <FormField>
        <Label htmlFor="br-color">{t('admin.beltCatalog.fields.beltColor')}</Label>
        <div className="flex items-center gap-2">
          <input
            id="br-color"
            type="color"
            value={form.watch('beltColor') || '#FFFFFF'}
            onChange={(e) => form.setValue('beltColor', e.target.value.toUpperCase())}
            className="h-9 w-12 rounded border border-outline-variant"
          />
          <Input
            aria-label={t('admin.beltCatalog.fields.beltColorHex')}
            value={form.watch('beltColor') || ''}
            onChange={(e) => form.setValue('beltColor', e.target.value)}
            maxLength={7}
            className="flex-1"
          />
        </div>
        <FormMessage message={form.formState.errors.beltColor?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-image">{t('admin.beltCatalog.fields.imageUrl')}</Label>
        <Input
          id="br-image"
          {...form.register('imageUrl', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>

      <FormField>
        <Label htmlFor="br-desc-en">{t('admin.beltCatalog.fields.descriptionEn')}</Label>
        <Input
          id="br-desc-en"
          {...form.register('descriptionEn', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>
      <FormField>
        <Label htmlFor="br-desc-sv">{t('admin.beltCatalog.fields.descriptionSv')}</Label>
        <Input
          id="br-desc-sv"
          {...form.register('descriptionSv', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>
      <FormField>
        <Label htmlFor="br-desc-fi">{t('admin.beltCatalog.fields.descriptionFi')}</Label>
        <Input
          id="br-desc-fi"
          {...form.register('descriptionFi', { setValueAs: (v: string) => (v ? v : null) })}
        />
      </FormField>

      <FormField>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...form.register('publiclyVisible')} />
          {t('admin.beltCatalog.fields.publiclyVisible')}
        </label>
      </FormField>

      <FormField>
        <Label htmlFor="br-slug">
          {t('admin.beltCatalog.fields.slug')}
          {watchedPublic ? ' *' : ''}
        </Label>
        <Input
          id="br-slug"
          {...form.register('slug', { setValueAs: (v: string) => (v ? v : null) })}
        />
        <FormMessage message={form.formState.errors.slug?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="br-minage">{t('admin.beltCatalog.fields.minAge')}</Label>
        <Input
          id="br-minage"
          type="number"
          {...form.register('minAge', {
            setValueAs: (v: string) => (v === '' ? null : Number(v)),
          })}
        />
      </FormField>

      <FormField>
        <Label htmlFor="br-next">{t('admin.beltCatalog.fields.nextRank')}</Label>
        <Select
          value={form.watch('nextRankId') ?? NONE}
          onValueChange={(v) => form.setValue('nextRankId', v === NONE ? null : v)}
        >
          <SelectTrigger id="br-next">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('admin.beltCatalog.noNextRank')}</SelectItem>
            {ranks
              .filter((r) => !rank || r.id !== rank.id)
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nameRomaji} (level {r.level})
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField>
        <Label htmlFor="br-org">{t('admin.beltCatalog.fields.organisation')}</Label>
        <Select
          value={form.watch('organisationId') ?? NONE}
          onValueChange={(v) => form.setValue('organisationId', v === NONE ? null : v)}
        >
          <SelectTrigger id="br-org">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('admin.beltCatalog.organisationGlobal')}</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nameEn} ({o.shortCode})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormMessage message={submitError} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t('common.save')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the test**

Create `apps/frontend/src/features/belt-rank-form/ui/BeltRankForm.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SYSTEM_ROW = {
  id: 'sys-1',
  code: 'kyu',
  nameEn: 'Kyu',
  nameSv: 'Kyu',
  nameFi: 'Kyu',
  organisationId: null,
  sortOrder: 1,
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt: '2026-05-24T08:00:00.000Z',
};

vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return {
    ...actual,
    createBeltRank: vi.fn().mockResolvedValue({
      id: 'rank-new',
      organisationId: null,
      systemId: 'sys-1',
      level: 1,
      sortOrder: 0,
      nameJa: null,
      nameRomaji: 'Jukyu',
      nameEn: '',
      nameSv: '',
      nameFi: '',
      beltColor: '#FFFFFF',
      imageUrl: null,
      descriptionEn: null,
      descriptionSv: null,
      descriptionFi: null,
      publiclyVisible: false,
      slug: null,
      minAge: null,
      nextRankId: null,
      createdAt: '2026-05-24T08:00:00.000Z',
      updatedAt: '2026-05-24T08:00:00.000Z',
    }),
    getBeltRanks: vi.fn().mockResolvedValue([]),
  };
});
vi.mock('@/entities/belt-system/api/belt-system.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-system/api/belt-system.api.js')>();
  return { ...actual, getBeltSystems: vi.fn().mockResolvedValue([SYSTEM_ROW]) };
});
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return { ...actual, getOrganisations: vi.fn().mockResolvedValue([]) };
});

import { createBeltRank } from '@/entities/belt-rank/api/belt-rank.api.js';

import { BeltRankForm } from './BeltRankForm.js';

import i18n from '@/i18n';

const mockedCreate = vi.mocked(createBeltRank);

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <BeltRankForm onSaved={onSaved} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSaved };
}

describe('<BeltRankForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedCreate.mockClear();
  });

  it('rejects publiclyVisible=true with no slug', async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText(/romaji/i), 'Jukyu');
    await user.click(screen.getByLabelText(/publicly visible/i));
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).not.toHaveBeenCalled();
    });
  });

  it('submits when publicly visible with a valid slug', async () => {
    const { user, onSaved } = renderForm();
    // Pick the (only) system option via the Select trigger.
    await user.click(screen.getByRole('combobox', { name: /system/i }));
    await user.click(await screen.findByText(/Kyu \(kyu\)/));

    await user.type(screen.getByLabelText(/romaji/i), 'Jukyu');
    await user.click(screen.getByLabelText(/publicly visible/i));
    await user.type(screen.getByLabelText(/^slug/i), 'jukyu');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled();
    });
    expect(onSaved).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Create the barrel**

Create `apps/frontend/src/features/belt-rank-form/index.ts`:

```ts
export { BeltRankForm } from './ui/BeltRankForm.js';
export type { BeltRankFormProps } from './ui/BeltRankForm.js';
```

- [ ] **Step 4: Steiger override**

Modify `apps/frontend/steiger.config.js` — add this override before the closing `]`:

```js
  {
    files: ['src/features/belt-rank-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
```

- [ ] **Step 5: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/features/belt-rank-form
```

Expected: PASS — both cases.

- [ ] **Step 6: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/features/belt-rank-form apps/frontend/steiger.config.js
git commit -m "feat(frontend): features/belt-rank-form — RHF + live BeltGraphic preview + slug-required-when-public rule"
```

---

### Task 12: Feature — `features/shogo-title-form/`

**Files:**

- Create: `apps/frontend/src/features/shogo-title-form/ui/ShogoTitleForm.tsx`
- Create: `apps/frontend/src/features/shogo-title-form/ui/ShogoTitleForm.test.tsx`
- Create: `apps/frontend/src/features/shogo-title-form/index.ts`
- Modify: `apps/frontend/steiger.config.js` — add deep-mock override

- [ ] **Step 1: Create the form**

Create `apps/frontend/src/features/shogo-title-form/ui/ShogoTitleForm.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateShogoTitleSchema,
  type CreateShogoTitleInput,
  type ShogoTitle,
} from '@repo/contracts/shogo-titles';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import { useCreateShogoTitle, useUpdateShogoTitle } from '@/entities/shogo-title';
import { HttpError } from '@/shared/api';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

export interface ShogoTitleFormProps {
  shogo?: ShogoTitle;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function ShogoTitleForm({
  shogo,
  onSaved,
  onCancel,
}: ShogoTitleFormProps): React.ReactElement {
  const { t } = useTranslation();
  const ranksQuery = useQuery(listBeltRanksQueryOptions());

  const form = useForm<CreateShogoTitleInput>({
    resolver: zodResolver(CreateShogoTitleSchema),
    defaultValues: {
      code: shogo?.code ?? '',
      nameEn: shogo?.nameEn ?? '',
      nameSv: shogo?.nameSv ?? '',
      nameFi: shogo?.nameFi ?? '',
      nameJa: shogo?.nameJa ?? '',
      minRankId: shogo?.minRankId ?? '',
      sortOrder: shogo?.sortOrder ?? 0,
    },
  });

  const create = useCreateShogoTitle();
  const update = useUpdateShogoTitle();
  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    try {
      if (shogo) {
        await update.mutateAsync({ code: shogo.code, input: values });
      } else {
        await create.mutateAsync(values);
      }
      onSaved?.();
    } catch (err) {
      setSubmitError(
        err instanceof HttpError
          ? err.message
          : t('common.unknownError', { defaultValue: 'Unknown error' }),
      );
    }
  });

  const pending = create.isPending || update.isPending;
  const ranks = ranksQuery.data ?? [];
  const editing = Boolean(shogo);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="sh-code">{t('admin.beltCatalog.fields.code')}</Label>
        <Input id="sh-code" disabled={editing} {...form.register('code')} />
        <FormMessage message={form.formState.errors.code?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="sh-en">{t('admin.beltCatalog.fields.nameEn')}</Label>
        <Input id="sh-en" {...form.register('nameEn')} />
      </FormField>
      <FormField>
        <Label htmlFor="sh-sv">{t('admin.beltCatalog.fields.nameSv')}</Label>
        <Input id="sh-sv" {...form.register('nameSv')} />
      </FormField>
      <FormField>
        <Label htmlFor="sh-fi">{t('admin.beltCatalog.fields.nameFi')}</Label>
        <Input id="sh-fi" {...form.register('nameFi')} />
      </FormField>
      <FormField>
        <Label htmlFor="sh-ja">{t('admin.beltCatalog.fields.nameJa')}</Label>
        <Input id="sh-ja" {...form.register('nameJa')} />
      </FormField>

      <FormField>
        <Label htmlFor="sh-rank">{t('admin.beltCatalog.fields.minRank')}</Label>
        <Select
          value={form.watch('minRankId') || ''}
          onValueChange={(v) => form.setValue('minRankId', v)}
        >
          <SelectTrigger id="sh-rank">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ranks.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.nameRomaji} (level {r.level})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FormMessage message={form.formState.errors.minRankId?.message} />
      </FormField>

      <FormField>
        <Label htmlFor="sh-sort">{t('admin.beltCatalog.fields.sortOrder')}</Label>
        <Input id="sh-sort" type="number" {...form.register('sortOrder', { valueAsNumber: true })} />
      </FormField>

      <FormMessage message={submitError} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t('common.save')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the test**

Create `apps/frontend/src/features/shogo-title-form/ui/ShogoTitleForm.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const RANK_ROW = {
  id: 'rank-1',
  organisationId: null,
  systemId: 'sys-1',
  level: 1,
  sortOrder: 0,
  nameJa: null,
  nameRomaji: 'Jukyu',
  nameEn: '',
  nameSv: '',
  nameFi: '',
  beltColor: '#FFFFFF',
  imageUrl: null,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  createdAt: '2026-05-24T08:00:00.000Z',
  updatedAt: '2026-05-24T08:00:00.000Z',
};

vi.mock('@/entities/shogo-title/api/shogo-title.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/shogo-title/api/shogo-title.api.js')>();
  return {
    ...actual,
    createShogoTitle: vi.fn().mockResolvedValue({
      code: 'renshi',
      nameEn: 'Renshi',
      nameSv: 'Renshi',
      nameFi: 'Renshi',
      nameJa: '錬士',
      minRankId: 'rank-1',
      sortOrder: 1,
    }),
  };
});
vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return { ...actual, getBeltRanks: vi.fn().mockResolvedValue([RANK_ROW]) };
});

import { createShogoTitle } from '@/entities/shogo-title/api/shogo-title.api.js';

import { ShogoTitleForm } from './ShogoTitleForm.js';

import i18n from '@/i18n';

const mockedCreate = vi.mocked(createShogoTitle);

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ShogoTitleForm onSaved={onSaved} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSaved };
}

describe('<ShogoTitleForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedCreate.mockClear();
  });

  it('submits valid input', async () => {
    const { user, onSaved } = renderForm();
    await user.type(screen.getByLabelText(/code/i), 'renshi');
    await user.type(screen.getByLabelText(/name \(english\)/i), 'Renshi');
    await user.type(screen.getByLabelText(/name \(swedish\)/i), 'Renshi');
    await user.type(screen.getByLabelText(/name \(finnish\)/i), 'Renshi');
    await user.type(screen.getByLabelText(/name \(japanese\)/i), '錬士');
    await user.click(screen.getByRole('combobox', { name: /minimum rank/i }));
    await user.click(await screen.findByText(/Jukyu/));
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalled();
    });
    expect(onSaved).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Create the barrel**

Create `apps/frontend/src/features/shogo-title-form/index.ts`:

```ts
export { ShogoTitleForm } from './ui/ShogoTitleForm.js';
export type { ShogoTitleFormProps } from './ui/ShogoTitleForm.js';
```

- [ ] **Step 4: Steiger override**

Modify `apps/frontend/steiger.config.js` — add:

```js
  {
    files: ['src/features/shogo-title-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
```

- [ ] **Step 5: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/features/shogo-title-form
```

Expected: PASS.

- [ ] **Step 6: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/features/shogo-title-form apps/frontend/steiger.config.js
git commit -m "feat(frontend): features/shogo-title-form — RHF + zodResolver against CreateShogoTitleSchema"
```

---

### Task 13: Feature — three list tables (`belt-systems-table`, `belt-ranks-table`, `shogo-titles-table`)

**Files:**

- Create: `apps/frontend/src/features/belt-systems-table/ui/BeltSystemsTable.tsx`
- Create: `apps/frontend/src/features/belt-systems-table/index.ts`
- Create: `apps/frontend/src/features/belt-ranks-table/ui/BeltRanksTable.tsx`
- Create: `apps/frontend/src/features/belt-ranks-table/index.ts`
- Create: `apps/frontend/src/features/shogo-titles-table/ui/ShogoTitlesTable.tsx`
- Create: `apps/frontend/src/features/shogo-titles-table/index.ts`

- [ ] **Step 1: Create `BeltSystemsTable.tsx`**

Create `apps/frontend/src/features/belt-systems-table/ui/BeltSystemsTable.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useDeleteBeltSystem, type BeltSystem } from '@/entities/belt-system';
import { Button } from '@/shared/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog.js';

export interface BeltSystemsTableProps {
  systems: BeltSystem[];
  onEdit: (system: BeltSystem) => void;
}

export function BeltSystemsTable({
  systems,
  onEdit,
}: BeltSystemsTableProps): React.ReactElement {
  const { t } = useTranslation();
  const del = useDeleteBeltSystem();
  const [pendingDelete, setPendingDelete] = React.useState<BeltSystem | null>(null);

  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-on-surface-variant">
          <tr>
            <th className="py-2">{t('admin.beltCatalog.fields.code')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.nameEn')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.organisation')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.sortOrder')}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {systems.map((s) => (
            <tr key={s.id}>
              <td className="py-2 font-mono">{s.code}</td>
              <td className="py-2">{s.nameEn}</td>
              <td className="py-2">
                {s.organisationId ?? t('admin.beltCatalog.organisationGlobal')}
              </td>
              <td className="py-2">{s.sortOrder}</td>
              <td className="py-2 text-right">
                <Button variant="outline" size="sm" onClick={() => onEdit(s)}>
                  {t('admin.beltCatalog.actions.edit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  onClick={() => setPendingDelete(s)}
                >
                  {t('admin.beltCatalog.actions.delete')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.beltCatalog.confirmDelete.title')}</DialogTitle>
            <DialogDescription>
              {t('admin.beltCatalog.confirmDelete.systemBody', {
                code: pendingDelete?.code ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (pendingDelete) {
                  del.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
                }
              }}
              disabled={del.isPending}
            >
              {t('admin.beltCatalog.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Create `belt-systems-table/index.ts`**

```ts
export { BeltSystemsTable } from './ui/BeltSystemsTable.js';
export type { BeltSystemsTableProps } from './ui/BeltSystemsTable.js';
```

- [ ] **Step 3: Create `BeltRanksTable.tsx`** (parallel structure with `BeltGraphic` swatch)

Create `apps/frontend/src/features/belt-ranks-table/ui/BeltRanksTable.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useDeleteBeltRank,
  type BeltRank,
} from '@/entities/belt-rank';
import { type BeltSystem } from '@/entities/belt-system';
import { getBeltVisuals } from '@/shared/lib/belt-visuals';
import { Button } from '@/shared/ui';
import { BeltGraphic } from '@/shared/ui/belt-graphic';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog.js';

export interface BeltRanksTableProps {
  ranks: BeltRank[];
  systems: BeltSystem[];
  onEdit: (rank: BeltRank) => void;
}

export function BeltRanksTable({
  ranks,
  systems,
  onEdit,
}: BeltRanksTableProps): React.ReactElement {
  const { t } = useTranslation();
  const del = useDeleteBeltRank();
  const [pendingDelete, setPendingDelete] = React.useState<BeltRank | null>(null);

  const systemsById = React.useMemo(() => {
    const map = new Map<string, BeltSystem>();
    for (const s of systems) map.set(s.id, s);
    return map;
  }, [systems]);

  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-on-surface-variant">
          <tr>
            <th className="py-2">{t('admin.beltCatalog.preview')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.nameRomaji')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.level')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.system')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.organisation')}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {ranks.map((r) => {
            const sys = systemsById.get(r.systemId);
            const visuals = sys
              ? getBeltVisuals(sys.code, r.level)
              : { gradient: 'white' as const };
            return (
              <tr key={r.id}>
                <td className="w-32 py-2">
                  <BeltGraphic {...visuals} className="w-24" />
                </td>
                <td className="py-2">{r.nameRomaji}</td>
                <td className="py-2">{r.level}</td>
                <td className="py-2">{sys?.nameEn ?? '—'}</td>
                <td className="py-2">
                  {r.organisationId ?? t('admin.beltCatalog.organisationGlobal')}
                </td>
                <td className="py-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => onEdit(r)}>
                    {t('admin.beltCatalog.actions.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-2"
                    onClick={() => setPendingDelete(r)}
                  >
                    {t('admin.beltCatalog.actions.delete')}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Dialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.beltCatalog.confirmDelete.title')}</DialogTitle>
            <DialogDescription>
              {t('admin.beltCatalog.confirmDelete.rankBody', {
                romaji: pendingDelete?.nameRomaji ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (pendingDelete) {
                  del.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
                }
              }}
              disabled={del.isPending}
            >
              {t('admin.beltCatalog.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Create `belt-ranks-table/index.ts`**

```ts
export { BeltRanksTable } from './ui/BeltRanksTable.js';
export type { BeltRanksTableProps } from './ui/BeltRanksTable.js';
```

- [ ] **Step 5: Create `ShogoTitlesTable.tsx`**

Create `apps/frontend/src/features/shogo-titles-table/ui/ShogoTitlesTable.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { type BeltRank } from '@/entities/belt-rank';
import { useDeleteShogoTitle, type ShogoTitle } from '@/entities/shogo-title';
import { Button } from '@/shared/ui';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog.js';

export interface ShogoTitlesTableProps {
  shogos: ShogoTitle[];
  ranks: BeltRank[];
  onEdit: (shogo: ShogoTitle) => void;
}

export function ShogoTitlesTable({
  shogos,
  ranks,
  onEdit,
}: ShogoTitlesTableProps): React.ReactElement {
  const { t } = useTranslation();
  const del = useDeleteShogoTitle();
  const [pendingDelete, setPendingDelete] = React.useState<ShogoTitle | null>(null);

  const ranksById = React.useMemo(() => {
    const map = new Map<string, BeltRank>();
    for (const r of ranks) map.set(r.id, r);
    return map;
  }, [ranks]);

  return (
    <>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-on-surface-variant">
          <tr>
            <th className="py-2">{t('admin.beltCatalog.fields.code')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.nameEn')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.nameJa')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.minRank')}</th>
            <th className="py-2">{t('admin.beltCatalog.fields.sortOrder')}</th>
            <th />
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {shogos.map((s) => (
            <tr key={s.code}>
              <td className="py-2 font-mono">{s.code}</td>
              <td className="py-2">{s.nameEn}</td>
              <td className="py-2">{s.nameJa}</td>
              <td className="py-2">{ranksById.get(s.minRankId)?.nameRomaji ?? '—'}</td>
              <td className="py-2">{s.sortOrder}</td>
              <td className="py-2 text-right">
                <Button variant="outline" size="sm" onClick={() => onEdit(s)}>
                  {t('admin.beltCatalog.actions.edit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  onClick={() => setPendingDelete(s)}
                >
                  {t('admin.beltCatalog.actions.delete')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.beltCatalog.confirmDelete.title')}</DialogTitle>
            <DialogDescription>
              {t('admin.beltCatalog.confirmDelete.shogoBody', {
                code: pendingDelete?.code ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (pendingDelete) {
                  del.mutate(pendingDelete.code, { onSuccess: () => setPendingDelete(null) });
                }
              }}
              disabled={del.isPending}
            >
              {t('admin.beltCatalog.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 6: Create `shogo-titles-table/index.ts`**

```ts
export { ShogoTitlesTable } from './ui/ShogoTitlesTable.js';
export type { ShogoTitlesTableProps } from './ui/ShogoTitlesTable.js';
```

- [ ] **Step 7: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```
git add apps/frontend/src/features/belt-systems-table apps/frontend/src/features/belt-ranks-table apps/frontend/src/features/shogo-titles-table
git commit -m "feat(frontend): three list tables — belt-systems / belt-ranks / shogo-titles (with delete-confirm dialogs)"
```

---

### Task 14: Page — `pages/admin-belt-catalog/` (tabbed hub)

**Files:**

- Create: `apps/frontend/src/pages/admin-belt-catalog/ui/AdminBeltCatalogPage.tsx`
- Create: `apps/frontend/src/pages/admin-belt-catalog/index.ts`

- [ ] **Step 1: Create the page**

Create `apps/frontend/src/pages/admin-belt-catalog/ui/AdminBeltCatalogPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  listBeltRanksQueryOptions,
  type BeltRank,
} from '@/entities/belt-rank';
import {
  listBeltSystemsQueryOptions,
  type BeltSystem,
} from '@/entities/belt-system';
import {
  listShogoTitlesQueryOptions,
  type ShogoTitle,
} from '@/entities/shogo-title';
import { BeltRankForm } from '@/features/belt-rank-form';
import { BeltRanksTable } from '@/features/belt-ranks-table';
import { BeltSystemForm } from '@/features/belt-system-form';
import { BeltSystemsTable } from '@/features/belt-systems-table';
import { ShogoTitleForm } from '@/features/shogo-title-form';
import { ShogoTitlesTable } from '@/features/shogo-titles-table';
import { Button } from '@/shared/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs.js';

type Mode<T> = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; row: T };

export function AdminBeltCatalogPage(): React.ReactElement {
  const { t } = useTranslation();

  const systemsQuery = useQuery(listBeltSystemsQueryOptions());
  const ranksQuery = useQuery(listBeltRanksQueryOptions());
  const shogosQuery = useQuery(listShogoTitlesQueryOptions());

  const [sysMode, setSysMode] = React.useState<Mode<BeltSystem>>({ kind: 'closed' });
  const [rankMode, setRankMode] = React.useState<Mode<BeltRank>>({ kind: 'closed' });
  const [shogoMode, setShogoMode] = React.useState<Mode<ShogoTitle>>({ kind: 'closed' });

  return (
    <div className="container mx-auto max-w-5xl py-8">
      <h1 className="font-headline text-3xl">{t('admin.beltCatalog.title')}</h1>
      <p className="mt-2 text-on-surface-variant">{t('admin.beltCatalog.description')}</p>

      <Tabs defaultValue="systems" className="mt-6">
        <TabsList>
          <TabsTrigger value="systems">{t('admin.beltCatalog.tabs.systems')}</TabsTrigger>
          <TabsTrigger value="ranks">{t('admin.beltCatalog.tabs.ranks')}</TabsTrigger>
          <TabsTrigger value="shogos">{t('admin.beltCatalog.tabs.shogos')}</TabsTrigger>
        </TabsList>

        <TabsContent value="systems" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setSysMode({ kind: 'create' })}>
              {t('admin.beltCatalog.addSystem')}
            </Button>
          </div>
          {sysMode.kind !== 'closed' ? (
            <BeltSystemForm
              system={sysMode.kind === 'edit' ? sysMode.row : undefined}
              onSaved={() => setSysMode({ kind: 'closed' })}
              onCancel={() => setSysMode({ kind: 'closed' })}
            />
          ) : null}
          <BeltSystemsTable
            systems={systemsQuery.data ?? []}
            onEdit={(row) => setSysMode({ kind: 'edit', row })}
          />
        </TabsContent>

        <TabsContent value="ranks" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setRankMode({ kind: 'create' })}>
              {t('admin.beltCatalog.addRank')}
            </Button>
          </div>
          {rankMode.kind !== 'closed' ? (
            <BeltRankForm
              rank={rankMode.kind === 'edit' ? rankMode.row : undefined}
              onSaved={() => setRankMode({ kind: 'closed' })}
              onCancel={() => setRankMode({ kind: 'closed' })}
            />
          ) : null}
          <BeltRanksTable
            ranks={ranksQuery.data ?? []}
            systems={systemsQuery.data ?? []}
            onEdit={(row) => setRankMode({ kind: 'edit', row })}
          />
        </TabsContent>

        <TabsContent value="shogos" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShogoMode({ kind: 'create' })}>
              {t('admin.beltCatalog.addShogo')}
            </Button>
          </div>
          {shogoMode.kind !== 'closed' ? (
            <ShogoTitleForm
              shogo={shogoMode.kind === 'edit' ? shogoMode.row : undefined}
              onSaved={() => setShogoMode({ kind: 'closed' })}
              onCancel={() => setShogoMode({ kind: 'closed' })}
            />
          ) : null}
          <ShogoTitlesTable
            shogos={shogosQuery.data ?? []}
            ranks={ranksQuery.data ?? []}
            onEdit={(row) => setShogoMode({ kind: 'edit', row })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Create the barrel**

Create `apps/frontend/src/pages/admin-belt-catalog/index.ts`:

```ts
export { AdminBeltCatalogPage } from './ui/AdminBeltCatalogPage.js';
```

- [ ] **Step 3: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 4: Commit**

```
git add apps/frontend/src/pages/admin-belt-catalog
git commit -m "feat(frontend): pages/admin-belt-catalog — tabbed hub for systems / ranks / shogo titles"
```

---

### Task 15: Route — `_app.admin.belt-catalog.tsx`

**Files:**

- Create: `apps/frontend/src/app/router/routes/_app.admin.belt-catalog.tsx`
- Modify: `apps/frontend/src/app/router/index.ts` (if it explicitly registers child routes — check first)

- [ ] **Step 1: Check the router barrel**

```
pnpm --filter frontend exec ls src/app/router
```

Inspect `src/app/router/index.ts` (or `routeTree.ts`) to confirm how new routes are wired in. The pattern matches `_app.admin.users.tsx` and is auto-discovered by TanStack Router if the project uses file-based routing; if it uses an explicit `routeTree`, append the new route entry.

- [ ] **Step 2: Create the route**

Create `apps/frontend/src/app/router/routes/_app.admin.belt-catalog.tsx`:

```tsx
import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminBeltCatalogPage } from '@/pages/admin-belt-catalog';

import { appLayoutRoute } from './_app.js';

/**
 * Admin-only route mounting the belt-catalog hub. Sits under `_app` so the
 * parent's session check still applies; this `beforeLoad` layers a sysadmin
 * check on top and redirects everyone else to `/dashboard`.
 */
export const adminBeltCatalogRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/belt-catalog',
  beforeLoad: async () => {
    try {
      const result = await authClient.getSession();
      const role = (result.data?.user as { role?: string } | undefined)?.role;
      if (role !== 'sysadmin') {
        throw redirect({ to: '/dashboard' });
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'options' in err) throw err;
      throw redirect({ to: '/login' });
    }
  },
  component: AdminBeltCatalogPage,
});

export const Route = adminBeltCatalogRoute;
```

- [ ] **Step 3: Wire into the router** (only if the project uses an explicit `routeTree`; otherwise skip)

If `apps/frontend/src/app/router/index.ts` builds the route tree with explicit `addChildren`, add `adminBeltCatalogRoute` to the `_app` children. Mirror the placement of `adminUsersRoute`.

- [ ] **Step 4: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/app/router/routes/_app.admin.belt-catalog.tsx apps/frontend/src/app/router/index.ts
git commit -m "feat(frontend): /admin/belt-catalog route under _app with sysadmin beforeLoad gate"
```

---

### Task 16: Sidebar entry — "Belt catalog"

**Files:**

- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.test.tsx` (if it asserts the exact nav set; update if so)

- [ ] **Step 1: Add the nav entry**

In `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`:

1. Add `Award` to the `lucide-react` import line:

```tsx
import { Award, Building2, History, LayoutDashboard, LogOut, UserRound, Users } from 'lucide-react';
```

2. Inside the admin `<SidebarGroup>`, immediately AFTER the `adminAuditLog` item and BEFORE the closing `</SidebarMenu>`, insert:

```tsx
{ability?.can('manage', 'BeltRank') ? (
  <SidebarMenuItem>
    <SidebarMenuButton
      asChild
      isActive={pathname.startsWith('/admin/belt-catalog')}
    >
      <Link to="/admin/belt-catalog">
        <Award />
        <span>{t('nav.adminBeltCatalog')}</span>
      </Link>
    </SidebarMenuButton>
  </SidebarMenuItem>
) : null}
```

- [ ] **Step 2: Check + update the sidebar test**

Run the existing sidebar test:

```
pnpm --filter frontend exec vitest run src/widgets/appsidebar
```

If it asserts the exact set of nav items, extend the assertions to include the new entry (mock the ability to grant `('manage', 'BeltRank')` for the case that should show it; leave a separate case that does NOT grant it to assert hiding).

- [ ] **Step 3: Typecheck + test**

```
pnpm --filter frontend typecheck
pnpm --filter frontend exec vitest run src/widgets/appsidebar
```

Expected: both PASS.

- [ ] **Step 4: Commit**

```
git add apps/frontend/src/widgets/appsidebar
git commit -m "feat(frontend): sidebar — Belt catalog admin entry gated by ability.can('manage','BeltRank')"
```

---

### Task 17: i18n — `admin.beltCatalog.*` subtree in all three locales

**Files:**

- Modify: `apps/frontend/src/i18n/locales/en.json`
- Modify: `apps/frontend/src/i18n/locales/sv.json`
- Modify: `apps/frontend/src/i18n/locales/fi.json`

- [ ] **Step 1: Extend `en.json`**

In `apps/frontend/src/i18n/locales/en.json`:

1. Inside the `"nav"` object, add `"adminBeltCatalog": "Belt catalog"` after `"adminUsers"`.
2. Inside the `"admin"` object, add this `"beltCatalog"` subtree (sibling of `"organisations"`):

```json
    "beltCatalog": {
      "title": "Belt catalog",
      "description": "Manage belt systems, ranks, and shogo titles.",
      "tabs": {
        "systems": "Systems",
        "ranks": "Ranks",
        "shogos": "Shogo titles"
      },
      "addSystem": "Add system",
      "addRank": "Add rank",
      "addShogo": "Add shogo title",
      "preview": "Preview",
      "organisationGlobal": "Global (all organisations)",
      "noNextRank": "No next rank",
      "fields": {
        "code": "Code",
        "nameEn": "Name (English)",
        "nameSv": "Name (Swedish)",
        "nameFi": "Name (Finnish)",
        "nameJa": "Name (Japanese)",
        "nameRomaji": "Name (Romaji)",
        "descriptionEn": "Description (English)",
        "descriptionSv": "Description (Swedish)",
        "descriptionFi": "Description (Finnish)",
        "organisation": "Organisation",
        "sortOrder": "Sort order",
        "system": "System",
        "level": "Level",
        "beltColor": "Belt color",
        "beltColorHex": "Belt color (hex)",
        "imageUrl": "Image URL",
        "publiclyVisible": "Publicly visible",
        "slug": "URL slug",
        "minAge": "Minimum age",
        "minRank": "Minimum rank",
        "nextRank": "Next rank"
      },
      "actions": {
        "edit": "Edit",
        "delete": "Delete"
      },
      "confirmDelete": {
        "title": "Confirm delete",
        "systemBody": "Delete the belt system \"{{code}}\"? This cannot be undone.",
        "rankBody": "Delete the rank \"{{romaji}}\"? This cannot be undone.",
        "shogoBody": "Delete the shogo title \"{{code}}\"? This cannot be undone."
      },
      "errors": {
        "nextRankSelf": "A rank cannot reference itself as its next rank."
      }
    }
```

- [ ] **Step 2: Extend `sv.json` (Swedish)**

Append `"adminBeltCatalog": "Beltkatalog"` as the last key of the existing `nav` object. Then add this `"beltCatalog"` subtree inside the existing `"admin"` object (sibling of `"organisations"`):

```json
    "beltCatalog": {
      "title": "Beltkatalog",
      "description": "Hantera beltsystem, grader och shogo-titlar.",
      "tabs": {
        "systems": "System",
        "ranks": "Grader",
        "shogos": "Shogo-titlar"
      },
      "addSystem": "Lägg till system",
      "addRank": "Lägg till grad",
      "addShogo": "Lägg till shogo-titel",
      "preview": "Förhandsgranskning",
      "organisationGlobal": "Global (alla organisationer)",
      "noNextRank": "Ingen nästa grad",
      "fields": {
        "code": "Kod",
        "nameEn": "Namn (engelska)",
        "nameSv": "Namn (svenska)",
        "nameFi": "Namn (finska)",
        "nameJa": "Namn (japanska)",
        "nameRomaji": "Namn (romaji)",
        "descriptionEn": "Beskrivning (engelska)",
        "descriptionSv": "Beskrivning (svenska)",
        "descriptionFi": "Beskrivning (finska)",
        "organisation": "Organisation",
        "sortOrder": "Sorteringsordning",
        "system": "System",
        "level": "Nivå",
        "beltColor": "Beltfärg",
        "beltColorHex": "Beltfärg (hex)",
        "imageUrl": "Bild-URL",
        "publiclyVisible": "Publikt synlig",
        "slug": "URL-slug",
        "minAge": "Minimiålder",
        "minRank": "Lägsta grad",
        "nextRank": "Nästa grad"
      },
      "actions": {
        "edit": "Redigera",
        "delete": "Ta bort"
      },
      "confirmDelete": {
        "title": "Bekräfta borttagning",
        "systemBody": "Ta bort beltsystemet \"{{code}}\"? Detta kan inte ångras.",
        "rankBody": "Ta bort graden \"{{romaji}}\"? Detta kan inte ångras.",
        "shogoBody": "Ta bort shogo-titeln \"{{code}}\"? Detta kan inte ångras."
      },
      "errors": {
        "nextRankSelf": "En grad kan inte referera till sig själv som nästa grad."
      }
    }
```

- [ ] **Step 3: Extend `fi.json` (Finnish)**

Append `"adminBeltCatalog": "Vyökatalogi"` as the last key of the existing `nav` object. Then add this `"beltCatalog"` subtree inside the existing `"admin"` object:

```json
    "beltCatalog": {
      "title": "Vyökatalogi",
      "description": "Hallinnoi vyöjärjestelmiä, asteita ja shogo-arvonimiä.",
      "tabs": {
        "systems": "Järjestelmät",
        "ranks": "Asteet",
        "shogos": "Shogo-arvonimet"
      },
      "addSystem": "Lisää järjestelmä",
      "addRank": "Lisää aste",
      "addShogo": "Lisää shogo-arvonimi",
      "preview": "Esikatselu",
      "organisationGlobal": "Yleinen (kaikki organisaatiot)",
      "noNextRank": "Ei seuraavaa astetta",
      "fields": {
        "code": "Koodi",
        "nameEn": "Nimi (englanniksi)",
        "nameSv": "Nimi (ruotsiksi)",
        "nameFi": "Nimi (suomeksi)",
        "nameJa": "Nimi (japaniksi)",
        "nameRomaji": "Nimi (romaji)",
        "descriptionEn": "Kuvaus (englanniksi)",
        "descriptionSv": "Kuvaus (ruotsiksi)",
        "descriptionFi": "Kuvaus (suomeksi)",
        "organisation": "Organisaatio",
        "sortOrder": "Järjestysnumero",
        "system": "Järjestelmä",
        "level": "Taso",
        "beltColor": "Vyön väri",
        "beltColorHex": "Vyön väri (hex)",
        "imageUrl": "Kuvan URL",
        "publiclyVisible": "Julkisesti näkyvä",
        "slug": "URL-slug",
        "minAge": "Vähimmäisikä",
        "minRank": "Vähimmäisaste",
        "nextRank": "Seuraava aste"
      },
      "actions": {
        "edit": "Muokkaa",
        "delete": "Poista"
      },
      "confirmDelete": {
        "title": "Vahvista poisto",
        "systemBody": "Poistetaanko vyöjärjestelmä \"{{code}}\"? Tätä ei voi peruuttaa.",
        "rankBody": "Poistetaanko aste \"{{romaji}}\"? Tätä ei voi peruuttaa.",
        "shogoBody": "Poistetaanko shogo-arvonimi \"{{code}}\"? Tätä ei voi peruuttaa."
      },
      "errors": {
        "nextRankSelf": "Aste ei voi viitata itseensä seuraavana asteena."
      }
    }
```

JSON keys must be character-identical to en.json so i18next's missing-key warning stays silent.

- [ ] **Step 4: Run a smoke test**

```
pnpm --filter frontend exec vitest run src/i18n
```

Expected: PASS — any `i18n` test asserting that the three locales share the same key set continues to pass.

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/i18n/locales
git commit -m "feat(frontend): i18n — admin.beltCatalog.* subtree + nav.adminBeltCatalog (en/sv/fi)"
```

---

### Task 18: Backend — public read endpoint (`GET /api/public/ranks/:slug`)

**Files:**

- Modify: `packages/contracts/src/routes.ts` — add `PublicRoutes`
- Modify: `packages/contracts/src/ranks.ts` — add `PublicRankResponseSchema` (rank + system + organisation summary)
- Modify: `packages/contracts/src/__tests__/ranks.test.ts` — assertions for the new schema
- Create: `apps/backend/src/modules/belt-catalog/dto/public-rank-response.dto.ts`
- Modify: `apps/backend/src/modules/belt-catalog/belt-ranks.service.ts` — add `findPublicBySlug(slug): Promise<PublicRankResponse>`
- Modify: `apps/backend/src/modules/belt-catalog/belt-ranks.repository.ts` — add `findPublicBySlug(slug)` joining `belt_systems` and `organisations`
- Modify: `apps/backend/src/modules/belt-catalog/belt-ranks.controller.ts` — add `@Public() GET /api/public/ranks/:slug` handler (note: the controller is currently mounted at `/ranks`; add a SECOND controller for the public path OR change the path explicitly via `@Get('/api/public/ranks/:slug')` — see Step 4)
- Modify: `apps/backend/src/modules/belt-catalog/belt-ranks.service.spec.ts` — add `findPublicBySlug` cases

- [ ] **Step 1: Extend the contracts**

In `packages/contracts/src/routes.ts`, append after `RankHistoryRoutes`:

```ts
export const PublicRoutes = {
  rankBySlug: (slug: string) => `/api/public/ranks/${slug}` as const,
} as const;
```

In `packages/contracts/src/ranks.ts`, append after `BeltRankSchema`:

```ts
/**
 * Public response for `GET /api/public/ranks/:slug`. Embeds the rank itself
 * plus the system (so the page can compute BeltGraphic visuals) and a small
 * organisation summary (for footer attribution). Returned only when
 * `publiclyVisible=true`; the controller 404s otherwise.
 */
export const PublicRankResponseSchema = z
  .object({
    rank: BeltRankSchema,
    system: z.object({
      id: z.string().uuid(),
      code: z.string(),
      nameEn: z.string(),
      nameSv: z.string(),
      nameFi: z.string(),
    }),
    organisation: z
      .object({
        id: z.string().uuid(),
        shortCode: z.string(),
        nameEn: z.string(),
        nameSv: z.string(),
        nameFi: z.string(),
      })
      .nullable(),
  })
  .meta({
    id: 'PublicRankResponse',
    description: 'A publicly-visible rank plus its system and (optional) organisation summary.',
  });

export type PublicRankResponse = z.infer<typeof PublicRankResponseSchema>;
```

And extend the registry:

```ts
export const BeltRanksOpenApiRegistry = {
  BeltRank: BeltRankSchema,
  CreateBeltRankInput: CreateBeltRankSchema,
  UpdateBeltRankInput: UpdateBeltRankSchema,
  PublicRankResponse: PublicRankResponseSchema,
} as const;
```

In `packages/contracts/src/__tests__/ranks.test.ts`, append:

```ts
import { PublicRankResponseSchema } from '../ranks.js';

describe('PublicRankResponseSchema', () => {
  it('accepts a full payload with a non-null organisation', () => {
    expect(
      PublicRankResponseSchema.safeParse({
        rank: {
          id: UUID,
          organisationId: null,
          systemId: UUID,
          level: 1,
          sortOrder: 10,
          nameJa: null,
          nameRomaji: 'Jukyu',
          nameEn: '10th Kyu',
          nameSv: '10 Kyu',
          nameFi: '10. Kyu',
          beltColor: '#FFFFFF',
          imageUrl: null,
          descriptionEn: null,
          descriptionSv: null,
          descriptionFi: null,
          publiclyVisible: true,
          slug: 'jukyu',
          minAge: null,
          nextRankId: null,
          createdAt: ISO,
          updatedAt: ISO,
        },
        system: { id: UUID, code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu', nameFi: 'Kyu' },
        organisation: null,
      }).success,
    ).toBe(true);
  });
});
```

Build and test:

```
pnpm --filter @repo/contracts test
pnpm --filter @repo/contracts build
```

Expected: PASS.

- [ ] **Step 2: Extend the repository**

In `apps/backend/src/modules/belt-catalog/belt-ranks.repository.ts`, add the `organisations` and `beltSystems` imports (if not present) and the new method:

```ts
async findPublicBySlug(slug: string) {
  const rows = await this.db
    .select({
      // rank columns — flat, matching DbBeltRank field names
      id: beltRanks.id,
      organisationId: beltRanks.organisationId,
      systemId: beltRanks.systemId,
      level: beltRanks.level,
      sortOrder: beltRanks.sortOrder,
      nameJa: beltRanks.nameJa,
      nameRomaji: beltRanks.nameRomaji,
      nameEn: beltRanks.nameEn,
      nameSv: beltRanks.nameSv,
      nameFi: beltRanks.nameFi,
      beltColor: beltRanks.beltColor,
      imageUrl: beltRanks.imageUrl,
      descriptionEn: beltRanks.descriptionEn,
      descriptionSv: beltRanks.descriptionSv,
      descriptionFi: beltRanks.descriptionFi,
      publiclyVisible: beltRanks.publiclyVisible,
      slug: beltRanks.slug,
      minAge: beltRanks.minAge,
      nextRankId: beltRanks.nextRankId,
      createdAt: beltRanks.createdAt,
      updatedAt: beltRanks.updatedAt,
      // joined belt_system (aliased so the service can pluck `systemCode`, `systemNameEn`, etc.)
      systemCode: beltSystems.code,
      systemNameEn: beltSystems.nameEn,
      systemNameSv: beltSystems.nameSv,
      systemNameFi: beltSystems.nameFi,
      // joined organisations (left-joined — nullable when the rank is global)
      orgShortCode: organisations.shortCode,
      orgNameEn: organisations.nameEn,
      orgNameSv: organisations.nameSv,
      orgNameFi: organisations.nameFi,
    })
    .from(beltRanks)
    .innerJoin(beltSystems, eq(beltSystems.id, beltRanks.systemId))
    .leftJoin(organisations, eq(organisations.id, beltRanks.organisationId))
    .where(and(eq(beltRanks.slug, slug), eq(beltRanks.publiclyVisible, true)))
    .limit(1);
  return rows[0] ?? null;
}
```

The downstream service (Step 3 below) consumes the rank columns via `this.toApi(row)` and the aliased system/organisation columns directly. If the existing `toApi(row)` is typed strictly against `DbBeltRank` and TypeScript narrows on the wider joined row, add a `const { systemCode, systemNameEn, systemNameSv, systemNameFi, orgShortCode, orgNameEn, orgNameSv, orgNameFi, ...rankRow } = row;` destructure in the service and pass `rankRow` to `toApi`.

- [ ] **Step 3: Extend the service**

In `apps/backend/src/modules/belt-catalog/belt-ranks.service.ts`, add:

```ts
async findPublicBySlug(slug: string): Promise<PublicRankResponse> {
  const row = await this.repo.findPublicBySlug(slug);
  if (!row) {
    throw new NotFoundException({
      error: { code: 'NOT_FOUND', message: `Rank with slug "${slug}" not found.` },
    });
  }
  return {
    rank: this.toApi(row),
    system: {
      id: row.systemId,
      code: row.systemCode,
      nameEn: row.systemNameEn,
      nameSv: row.systemNameSv,
      nameFi: row.systemNameFi,
    },
    organisation: row.organisationId
      ? {
          id: row.organisationId,
          shortCode: row.orgShortCode,
          nameEn: row.orgNameEn,
          nameSv: row.orgNameSv,
          nameFi: row.orgNameFi,
        }
      : null,
  };
}
```

Import `type PublicRankResponse` from `@repo/contracts/ranks` at the top of the file.

- [ ] **Step 4: Add the controller handler**

In `apps/backend/src/modules/belt-catalog/belt-ranks.controller.ts`:

1. Import `Public` from `../../infrastructure/auth/public.decorator.js`.
2. Import `PublicRankResponseDto` (created in the next step).
3. Add a new handler at the BOTTOM of the class:

```ts
@Get()
@Public()
@ApiEndpoint({
  summary: 'Public rank lookup by slug.',
  operationId: 'BeltRanksController_publicBySlug',
  ok: PublicRankResponseDto,
  errorType: ErrorEnvelopeDto,
  errors: ['404'],
})
publicBySlug(): Promise<PublicRankResponse> {
  // NOTE: route uses the explicit `Controller('ranks')` prefix; we need the
  // public path under `/api/public/ranks/:slug`. The handler is therefore
  // declared on a SEPARATE controller in Step 4b.
  throw new Error('handled by PublicBeltRanksController');
}
```

**Step 4b — separate controller for the public path:**

Create `apps/backend/src/modules/belt-catalog/public-belt-ranks.controller.ts`:

```ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { PublicRankResponse } from '@repo/contracts/ranks';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { Public } from '../../infrastructure/auth/public.decorator.js';

import { PublicRankResponseDto } from './dto/public-rank-response.dto.js';
import { BeltRanksService } from './belt-ranks.service.js';

@ApiTags('public-ranks')
@Controller('public/ranks')
export class PublicBeltRanksController {
  constructor(private readonly ranks: BeltRanksService) {}

  @Get(':slug')
  @Public()
  @ApiParam({ name: 'slug', description: 'URL slug.' })
  @ApiEndpoint({
    summary: 'Public rank lookup by slug. Returns 404 when not publicly visible.',
    operationId: 'PublicBeltRanksController_findBySlug',
    ok: PublicRankResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['404'],
  })
  findBySlug(@Param('slug') slug: string): Promise<PublicRankResponse> {
    return this.ranks.findPublicBySlug(slug);
  }
}
```

Revert the `publicBySlug` stub in `belt-ranks.controller.ts`; only the separate `PublicBeltRanksController` is the real handler. (Remove the stub before committing.)

- [ ] **Step 5: Create the response DTO**

Create `apps/backend/src/modules/belt-catalog/dto/public-rank-response.dto.ts`:

```ts
import { PublicRankResponseSchema } from '@repo/contracts/ranks';
import { createZodDto } from 'nestjs-zod';

export class PublicRankResponseDto extends createZodDto(PublicRankResponseSchema) {}
```

- [ ] **Step 6: Wire the new controller into the module**

In `apps/backend/src/modules/belt-catalog/belt-catalog.module.ts`, add `PublicBeltRanksController` to the `controllers: [...]` list. Import it at the top.

- [ ] **Step 7: Extend the service spec**

In `apps/backend/src/modules/belt-catalog/belt-ranks.service.spec.ts`, add:

```ts
describe('BeltRanksService.findPublicBySlug', () => {
  it('throws NotFoundException for an unknown slug', async () => {
    repo.findPublicBySlug.mockResolvedValue(null);
    await expect(service.findPublicBySlug('does-not-exist')).rejects.toThrow(/NOT_FOUND/);
  });

  it('returns the hydrated payload when the rank exists and is publicly visible', async () => {
    repo.findPublicBySlug.mockResolvedValue({
      // ... flat row mock incl. systemCode / systemNameEn / etc. ...
    });
    const out = await service.findPublicBySlug('jukyu');
    expect(out.rank.slug).toBe('jukyu');
    expect(out.system.code).toBe('kyu');
  });
});
```

(The repo stub already exists in the existing spec setup — add `findPublicBySlug: vi.fn()` to it.)

- [ ] **Step 8: Run backend tests**

```
pnpm --filter backend test
```

Expected: PASS — both new cases plus all existing.

- [ ] **Step 9: Typecheck**

```
cd apps/backend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 10: Commit**

```
git add packages/contracts/src/routes.ts packages/contracts/src/ranks.ts packages/contracts/src/__tests__/ranks.test.ts apps/backend/src/modules/belt-catalog
git commit -m "feat(backend): public GET /api/public/ranks/:slug + PublicRankResponse contract"
```

---

### Task 19: Frontend — extend `entities/belt-rank` with `getPublicRank(slug)`

**Files:**

- Modify: `apps/frontend/src/entities/belt-rank/api/belt-rank.api.ts`
- Modify: `apps/frontend/src/entities/belt-rank/api/belt-rank.api.test.ts`
- Modify: `apps/frontend/src/entities/belt-rank/model/belt-rank.queries.ts`
- Modify: `apps/frontend/src/entities/belt-rank/index.ts`

- [ ] **Step 1: Extend the API module**

In `apps/frontend/src/entities/belt-rank/api/belt-rank.api.ts`, add at the bottom:

```ts
import {
  PublicRankResponseSchema,
  type PublicRankResponse,
} from '@repo/contracts/ranks';
import { PublicRoutes } from '@repo/contracts/routes';

export async function getPublicRank(slug: string): Promise<PublicRankResponse> {
  const raw = await httpClient(PublicRoutes.rankBySlug(slug));
  return PublicRankResponseSchema.parse(raw);
}
```

(Move all imports to the top of the file in normal style; the snippet above is illustrative.)

- [ ] **Step 2: Extend the API test**

Append to `apps/frontend/src/entities/belt-rank/api/belt-rank.api.test.ts`:

```ts
const PUBLIC_PAYLOAD = {
  rank: ROW,
  system: { id: 'sys-1', code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu', nameFi: 'Kyu' },
  organisation: null,
};

it('getPublicRank GETs /api/public/ranks/:slug', async () => {
  mockedHttp.mockResolvedValueOnce(PUBLIC_PAYLOAD);
  const out = await getPublicRank('jukyu');
  expect(mockedHttp).toHaveBeenCalledWith('/api/public/ranks/jukyu');
  expect(out.rank.nameRomaji).toBe('Jukyu');
});
```

Add `getPublicRank` to the import in the test file.

- [ ] **Step 3: Extend the query module**

In `apps/frontend/src/entities/belt-rank/model/belt-rank.queries.ts`:

1. Add `getPublicRank` to the imports from the api module.
2. Add a new key:

```ts
export const beltRankKeys = {
  all: ['belt-ranks'] as const,
  list: () => [...beltRankKeys.all, 'list'] as const,
  byId: (id: string) => [...beltRankKeys.all, 'byId', id] as const,
  publicBySlug: (slug: string) => [...beltRankKeys.all, 'public', slug] as const,
};
```

3. Add the query options factory:

```ts
export function publicRankQueryOptions(slug: string) {
  return queryOptions({
    queryKey: beltRankKeys.publicBySlug(slug),
    queryFn: () => getPublicRank(slug),
  });
}
```

- [ ] **Step 4: Re-export from the barrel**

In `apps/frontend/src/entities/belt-rank/index.ts`, add `getPublicRank` and `publicRankQueryOptions` to the exports, and `type PublicRankResponse` to the type re-exports.

- [ ] **Step 5: Run the test**

```
pnpm --filter frontend exec vitest run src/entities/belt-rank
```

Expected: PASS — all 6 cases.

- [ ] **Step 6: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/entities/belt-rank
git commit -m "feat(frontend): entities/belt-rank — getPublicRank + publicRankQueryOptions"
```

---

### Task 20: Page — `pages/public-rank/` (simplified port)

**Files:**

- Create: `apps/frontend/src/pages/public-rank/ui/PublicRankPage.tsx`
- Create: `apps/frontend/src/pages/public-rank/index.ts`

The taidohub version SKIPS requirements / techniques / patterns (no source data). Renders only: rank name (localised + Kanji + romaji), `BeltGraphic`, description, back link. Reuses the existing `_public.tsx` layout (which already mounts `<Header>` for non-auth pages).

- [ ] **Step 1: Create the page**

Create `apps/frontend/src/pages/public-rank/ui/PublicRankPage.tsx`:

```tsx
import { Link, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { publicRankQueryOptions } from '@/entities/belt-rank';
import { getBeltVisuals } from '@/shared/lib/belt-visuals';
import { type Lang } from '@/shared/lib/rank-label';
import { BeltGraphic } from '@/shared/ui/belt-graphic';

function pickDescription(
  rank: { descriptionEn: string | null; descriptionSv: string | null; descriptionFi: string | null },
  lang: string,
): string | null {
  return lang === 'fi' ? rank.descriptionFi : lang === 'sv' ? rank.descriptionSv : rank.descriptionEn;
}

export function PublicRankPage(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const params = useParams({ strict: false }) as { slug: string };
  const slug = params.slug;

  const query = useQuery(publicRankQueryOptions(slug));

  React.useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex';
    document.head.appendChild(tag);
    return () => {
      document.head.removeChild(tag);
    };
  }, []);

  if (query.isLoading) {
    return (
      <main className="container mx-auto max-w-3xl px-6 py-16 text-center text-on-surface-variant">
        {t('common.loading')}
      </main>
    );
  }

  if (!query.data) {
    return (
      <main className="container mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="font-headline text-3xl text-primary">
          {t('publicRank.notFoundTitle')}
        </h1>
        <p className="mt-4 text-on-surface-variant">{t('publicRank.notFoundBody')}</p>
        <Link to="/login" className="mt-8 inline-block text-primary underline">
          {t('publicRank.signIn')}
        </Link>
      </main>
    );
  }

  const { rank, system } = query.data;
  const lang = i18n.language as Lang;
  const visuals = getBeltVisuals(system.code, rank.level);
  const localised =
    lang === 'fi' ? rank.nameFi : lang === 'sv' ? rank.nameSv : rank.nameEn;
  const description = pickDescription(rank, lang);

  return (
    <main className="container mx-auto max-w-3xl px-6 py-10">
      <header className="mb-10">
        <div className="flex items-baseline gap-4">
          <div className="font-headline text-5xl text-primary">
            {localised || rank.nameRomaji}
          </div>
          {rank.nameJa ? (
            <div className="font-headline text-3xl italic text-on-surface-variant">
              {rank.nameJa}
            </div>
          ) : null}
        </div>
        {rank.nameRomaji && rank.nameRomaji !== localised ? (
          <div className="mt-2 text-lg text-on-surface-variant">{rank.nameRomaji}</div>
        ) : null}
        <BeltGraphic {...visuals} className="mt-6 w-full max-w-md" />
      </header>

      {description ? (
        <section className="mb-10 text-on-surface">
          <p>{description}</p>
        </section>
      ) : null}

      <p className="mt-12">
        <Link to="/" className="text-primary underline">
          {t('publicRank.backHome')}
        </Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Create the barrel**

Create `apps/frontend/src/pages/public-rank/index.ts`:

```ts
export { PublicRankPage } from './ui/PublicRankPage.js';
```

- [ ] **Step 3: Extend i18n with `publicRank.*` keys**

In each of `en.json`, `sv.json`, `fi.json`, add:

```json
  "publicRank": {
    "notFoundTitle": "Rank not available",
    "notFoundBody": "This rank is not public, or the link is invalid.",
    "signIn": "Sign in",
    "backHome": "Back to home",
    "loading": "Loading…"
  }
```

(Translate values in sv/fi.)

- [ ] **Step 4: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/pages/public-rank apps/frontend/src/i18n/locales
git commit -m "feat(frontend): pages/public-rank — simplified public rank page (hero + BeltGraphic + description)"
```

---

### Task 21: Route — `_public.ranks.$slug.tsx`

**Files:**

- Create: `apps/frontend/src/app/router/routes/_public.ranks.$slug.tsx`
- Modify: `apps/frontend/src/app/router/index.ts` (only if explicit `routeTree`)

- [ ] **Step 1: Create the route**

Create `apps/frontend/src/app/router/routes/_public.ranks.$slug.tsx`:

```tsx
import { createRoute } from '@tanstack/react-router';

import { PublicRankPage } from '@/pages/public-rank';

import { publicLayoutRoute } from './_public.js';

/**
 * Anonymous, public rank page. Mounted under the existing `_public` layout
 * (which already renders the global `Header` for non-auth public pages).
 * 404 is rendered by `PublicRankPage` itself when the slug is unknown or
 * the rank is not publicly visible — the backend returns 404 in both cases.
 */
export const publicRankRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/ranks/$slug',
  component: PublicRankPage,
});

export const Route = publicRankRoute;
```

- [ ] **Step 2: Wire into the router** (only if explicit `routeTree`)

- [ ] **Step 3: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```
git add apps/frontend/src/app/router/routes/_public.ranks.$slug.tsx apps/frontend/src/app/router/index.ts
git commit -m "feat(frontend): /ranks/:slug public route under _public layout"
```

---

### Task 22: OpenAPI regen

**Files:**

- Modify: `apps/backend/openapi.json` (generated)
- Possibly: other generated artifacts under `apps/backend/`

- [ ] **Step 1: Regenerate the OpenAPI document**

```
pnpm --filter backend openapi
```

(Run whichever script the backend exposes. If the project uses `pnpm --filter backend run swagger:export` or similar, use that — confirm by checking `apps/backend/package.json` scripts.)

Expected: the `openapi.json` (or equivalent) is rewritten to include the new `PublicBeltRanksController_findBySlug` operation and the `PublicRankResponse` schema.

- [ ] **Step 2: Commit**

```
git add apps/backend/openapi.json
git commit -m "chore(backend): regen OpenAPI document for public rank endpoint"
```

(If no generated file is tracked in the repo, skip the commit.)

---

### Task 23: Full pipeline verification

**Files:** — (no edits)

- [ ] **Step 1: Run the full turbo pipeline**

```
pnpm turbo run typecheck lint arch test build
```

Expected: every package PASSes — contracts, backend, frontend.

- [ ] **Step 2: Manual verification checklist** (sysadmin in dev)

1. Start backend (`pnpm --filter backend dev`) and frontend (`pnpm --filter frontend dev`).
2. Sign in as a sysadmin user.
3. Click "Belt catalog" in the sidebar → `/admin/belt-catalog` loads.
4. Confirm the three tabs render and switch correctly.
5. On "Systems" tab → click "Add system" → fill in `code=kyu`, three localised names → save. Row appears in the table.
6. On "Ranks" tab → click "Add rank" → select the new system, level=1, nameRomaji=Jukyu, beltColor=#FFFFFF, mark "Publicly visible", slug=jukyu → save. The live preview shows a white BeltGraphic during entry.
7. On "Shogo titles" tab → click "Add shogo title" → fill in code=renshi, localised names, pick the new rank as the minimum rank → save.
8. Open `/ranks/jukyu` in an incognito window (no session). The page renders without redirect to /login; hero shows the rank name; BeltGraphic visible.
9. Visit `/ranks/does-not-exist` in incognito → 404 fallback ("Rank not available").
10. Edit a rank to set `publiclyVisible: false`. Re-visit `/ranks/<its-slug>` → 404.

If any step fails, file the issue against the implementer's working branch and resolve before merging.

- [ ] **Step 3: Final commit (only if any fix was needed)** — otherwise this task is verification-only and produces no commit.

---

## Summary

This plan delivers Plan B in 23 atomic tasks:

- **Foundations (Tasks 1-2):** RHF deps + env-driven feature-flag infrastructure.
- **Entities (Tasks 3-5):** belt-system / belt-rank / shogo-title API + queries.
- **Shared (Tasks 6-9):** belt-visuals + rank-label + BeltGraphic + BeltBadge.
- **Admin forms (Tasks 10-12):** RHF + zodResolver forms for each resource.
- **Admin tables + hub (Tasks 13-16):** three tables, tabbed page, route, sidebar entry.
- **i18n (Task 17):** three locale files extended.
- **Public path (Tasks 18-21):** backend public endpoint + frontend entity extension + page + route.
- **Pipeline (Tasks 22-23):** OpenAPI regen + full turbo + manual verification.

Each task is self-contained and ends in a Conventional Commits commit. The plan deliberately mirrors the user-profile plan format (checkbox steps, FAIL-then-PASS test rhythm, explicit `pnpm --filter` invocations, Windows-friendly fallback noted in the header) so the agentic worker can execute it task-by-task without context loss.
