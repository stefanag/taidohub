# Grading-History Frontend (Self-Service + Admin Tab) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Plan C — the user-facing grading-history surface on top of the already-shipped backend (Plan A): a self-service `/grading-history` page with a vertical timeline and a single `<ClubCard>` right-rail companion, an Add/Edit form modal gated by the `grading-history` flag, Verify/Unverify actions gated by `grading-history-verification`, and a fourth "Grading history" tab on `<UserForm>` for the admin variant (followup D7 pulled forward).

**Architecture:** A new `entities/rank-history/` slice wraps the unified projection (`GET /api/grading-events/history/:userId`) and the five mutation endpoints (`POST/PATCH/DELETE /api/rank-history/...`, `POST .../verify|unverify`). A new `widgets/club-card/` renders the user's primary organisation + parent. A `features/grading-timeline/` feature owns the `<GradingTimeline>` + `<GradingTimelineEntry>` components (rendering rules per spec §9.6). A `features/rank-history-form/` feature owns the create/edit `<Dialog>` driven by `react-hook-form` + `zodResolver(CreateRankHistorySchema)`. A `pages/grading-history/` page composes them into a two-column layout under a new `_app.grading-history.tsx` route, surfaced in `<AppSidebar>` as "Grading history" for every authenticated user. The admin variant adds a fourth tab to the existing `<UserForm>` and reuses the same feature slices, bound to a different `subjectUserId`.

**Tech Stack:** React 19, Vite, TanStack Router/Query v5, Feature-Sliced Design, shadcn primitives (Radix-backed) from `@/shared/ui`, Tailwind, `react-hook-form` + `@hookform/resolvers` (introduced by Plan B), Zod 4 via `@repo/contracts/rank-history`, Vitest + Testing Library, `lucide-react` icons.

**Hard prerequisite — Plan B must land first:** This plan depends on the following Plan B tasks being merged before any task here starts:

- Plan B Task 1: `react-hook-form` + `@hookform/resolvers` deps installed in `apps/frontend/package.json`.
- Plan B Task 2: feature-flag infrastructure at `apps/frontend/src/shared/lib/feature-flags/` exposing `useFeatureFlag(code)` and `<FeatureFlag code>`; `<FeatureFlagsProvider>` mounted at the router root.
- Plan B Task 4: `entities/belt-rank/` exposing `getBeltRanks`, `listBeltRanksQueryOptions`, `beltRankKeys`, plus type re-exports `BeltRank`, `CreateBeltRankInput`, `UpdateBeltRankInput`.
- Plan B Task 5: `entities/shogo-title/` exposing `getShogoTitles`, `listShogoTitlesQueryOptions`, `shogoTitleKeys`, plus type re-exports `ShogoTitle`, `CreateShogoTitleInput`, `UpdateShogoTitleInput`.
- Plan B Task 3: `entities/belt-system/` exposing `getBeltSystems`, `listBeltSystemsQueryOptions`, `beltSystemKeys`, plus type re-exports `BeltSystem`.
- Plan B Task 6: `shared/lib/belt-visuals/` exposing `getBeltVisuals(systemCode, level, shogoTitle?)` + `BeltVisuals` / `BeltColor` types.
- Plan B Task 7: `shared/lib/rank-label/` exposing `rankLabel(rank, lang)` + `Lang` type.
- Plan B Task 8: `shared/ui/belt-graphic/` exposing `<BeltGraphic>` + `BeltGraphicProps`.
- Plan B Task 9: `shared/ui/belt-badge/` exposing `<BeltBadge>` (reused by the form Select option rendering).

If Plan B is not yet merged, STOP and merge it first. Every backend endpoint this plan consumes is live from Plan A; verify by reading `packages/contracts/src/routes.ts` — `RankHistoryRoutes` should already be exported.

**Implementer environment notes (Windows):**

- `pnpm --filter backend typecheck` and `pnpm --filter frontend typecheck` can hang on Windows. Fall back to `cd apps/backend && npx tsc --noEmit` / `cd apps/frontend && npx tsc --noEmit` if either hangs.
- Tests via `pnpm --filter frontend exec vitest run [path]` always work fine.
- Workspace filter names: `@repo/contracts` for the contracts package (note the `@repo/` scope), `backend` for the NestJS app, `frontend` for the Vite app.

---

### Task 1: Entity slice — `entities/rank-history/` (API)

**Files:**

- Create: `apps/frontend/src/entities/rank-history/api/rank-history.api.ts`
- Create: `apps/frontend/src/entities/rank-history/api/rank-history.api.test.ts`

- [ ] **Step 1: Write the failing API test**

Create `apps/frontend/src/entities/rank-history/api/rank-history.api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import {
  createRankHistory,
  deleteRankHistory,
  getGradingHistory,
  unverifyRankHistory,
  updateRankHistory,
  verifyRankHistory,
} from './rank-history.api.js';

import { httpClient } from '@/shared/api';

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  source: 'external' as const,
  userId: 'u-1',
  rankId: '22222222-2222-4222-8222-222222222222',
  shogoTitle: null,
  date: '2024-09-01',
  result: 'pass' as const,
  notes: null,
  examiner: 'Sensei Tanaka',
  organisationName: 'Kobe Dojo',
  verified: false,
  verifiedBy: null,
  verifiedAt: null,
  canVerify: true,
  canEdit: true,
  updatedAt: null,
  updatedByUserId: null,
};

const RH_FULL = {
  id: ROW.id,
  userId: ROW.userId,
  rankId: ROW.rankId,
  shogoTitle: null,
  date: ROW.date,
  result: 'pass' as const,
  source: 'external' as const,
  eventId: null,
  recordedByUserId: 'u-1',
  examinerName: ROW.examiner,
  organisationName: ROW.organisationName,
  notes: null,
  verified: false,
  verifiedByUserId: null,
  verifiedAt: null,
  createdAt: '2026-05-25T08:00:00.000Z',
  updatedAt: null,
  updatedByUserId: null,
};

const mockedHttp = vi.mocked(httpClient);

describe('rank-history api', () => {
  it('getGradingHistory GETs the unified projection', async () => {
    mockedHttp.mockResolvedValueOnce({ data: [ROW] });
    const out = await getGradingHistory('u-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/grading-events/history/u-1');
    expect(out.data[0]?.id).toBe(ROW.id);
  });

  it('createRankHistory POSTs to /api/rank-history/:userId', async () => {
    mockedHttp.mockResolvedValueOnce(RH_FULL);
    await createRankHistory('u-1', {
      rankId: ROW.rankId,
      date: '2024-09-01',
    });
    expect(mockedHttp).toHaveBeenCalledWith('/api/rank-history/u-1', {
      method: 'POST',
      body: { rankId: ROW.rankId, date: '2024-09-01' },
    });
  });

  it('updateRankHistory PATCHes /api/rank-history/:id', async () => {
    mockedHttp.mockResolvedValueOnce(RH_FULL);
    await updateRankHistory(ROW.id, { notes: 'fixed' });
    expect(mockedHttp).toHaveBeenCalledWith(`/api/rank-history/${ROW.id}`, {
      method: 'PATCH',
      body: { notes: 'fixed' },
    });
  });

  it('deleteRankHistory DELETEs /api/rank-history/:id', async () => {
    mockedHttp.mockResolvedValueOnce(undefined);
    await deleteRankHistory(ROW.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/rank-history/${ROW.id}`, {
      method: 'DELETE',
    });
  });

  it('verifyRankHistory POSTs /api/rank-history/:id/verify', async () => {
    mockedHttp.mockResolvedValueOnce(RH_FULL);
    await verifyRankHistory(ROW.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/rank-history/${ROW.id}/verify`, {
      method: 'POST',
    });
  });

  it('unverifyRankHistory POSTs /api/rank-history/:id/unverify', async () => {
    mockedHttp.mockResolvedValueOnce(RH_FULL);
    await unverifyRankHistory(ROW.id);
    expect(mockedHttp).toHaveBeenCalledWith(`/api/rank-history/${ROW.id}/unverify`, {
      method: 'POST',
    });
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/entities/rank-history/api/rank-history.api.test.ts
```

Expected: FAIL — `Failed to resolve import "./rank-history.api.js"`; the module does not exist yet.

- [ ] **Step 3: Create the API module**

Create `apps/frontend/src/entities/rank-history/api/rank-history.api.ts`:

```ts
import {
  CreateRankHistorySchema,
  GradingHistoryResponseSchema,
  RankHistorySchema,
  UpdateRankHistorySchema,
  type CreateRankHistoryInput,
  type GradingHistoryResponse,
  type RankHistory,
  type UpdateRankHistoryInput,
} from '@repo/contracts/rank-history';
import { RankHistoryRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the RankHistory entity. */

/**
 * Fetch the unified grading-history projection for `userId`. The response is
 * `{ data: GradingHistoryRow[] }`; rows already carry per-actor `canVerify` /
 * `canEdit` flags hydrated by the backend.
 */
export async function getGradingHistory(userId: string): Promise<GradingHistoryResponse> {
  const raw = await httpClient(RankHistoryRoutes.unifiedForUser(userId));
  return GradingHistoryResponseSchema.parse(raw);
}

/** Create an external rank-history entry on behalf of `userId`. */
export async function createRankHistory(
  userId: string,
  input: CreateRankHistoryInput,
): Promise<RankHistory> {
  // Parse on the way in too — the form submits raw values, this guards the wire.
  const body = CreateRankHistorySchema.parse(input);
  const raw = await httpClient(RankHistoryRoutes.byUser(userId), {
    method: 'POST',
    body,
  });
  return RankHistorySchema.parse(raw);
}

/** Patch an external rank-history row. Touching `rankId`/`date`/`shogoTitle` on a verified row clears its verification atomically (service-layer rule). */
export async function updateRankHistory(
  id: string,
  input: UpdateRankHistoryInput,
): Promise<RankHistory> {
  const body = UpdateRankHistorySchema.parse(input);
  const raw = await httpClient(RankHistoryRoutes.byId(id), {
    method: 'PATCH',
    body,
  });
  return RankHistorySchema.parse(raw);
}

/** Delete an external rank-history row. Event-sourced rows are rejected server-side with `SOURCE_EVENT`. */
export async function deleteRankHistory(id: string): Promise<void> {
  await httpClient(RankHistoryRoutes.byId(id), { method: 'DELETE' });
}

/** Verify an external row. Recorder ≠ verifier; event rows rejected. Returns the updated row. */
export async function verifyRankHistory(id: string): Promise<RankHistory> {
  const raw = await httpClient(RankHistoryRoutes.verify(id), { method: 'POST' });
  return RankHistorySchema.parse(raw);
}

/** Unverify an external row. Recorder ≠ verifier; event rows rejected. Returns the updated row. */
export async function unverifyRankHistory(id: string): Promise<RankHistory> {
  const raw = await httpClient(RankHistoryRoutes.unverify(id), { method: 'POST' });
  return RankHistorySchema.parse(raw);
}
```

- [ ] **Step 4: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/entities/rank-history/api/rank-history.api.test.ts
```

Expected: PASS — all 6 cases pass.

- [ ] **Step 5: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/entities/rank-history/api
git commit -m "feat(frontend): entities/rank-history/api — unified projection + 5 mutations"
```

---

### Task 2: Entity slice — `entities/rank-history/` (queries + mutations + barrel)

**Files:**

- Create: `apps/frontend/src/entities/rank-history/model/rank-history.queries.ts`
- Create: `apps/frontend/src/entities/rank-history/index.ts`

- [ ] **Step 1: Create the query/mutation module**

Create `apps/frontend/src/entities/rank-history/model/rank-history.queries.ts`:

```ts
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import {
  createRankHistory,
  deleteRankHistory,
  getGradingHistory,
  unverifyRankHistory,
  updateRankHistory,
  verifyRankHistory,
} from '../api/rank-history.api.js';

import { authClient } from '@/features/auth-by-email';

import type {
  CreateRankHistoryInput,
  GradingHistoryResponse,
  RankHistory,
  UpdateRankHistoryInput,
} from '@repo/contracts/rank-history';

/**
 * Cache key registry for the rank-history entity. `unified(userId)` keys the
 * `GET /api/grading-events/history/:userId` projection; `all` is the umbrella
 * for blanket invalidation after mutations.
 */
export const rankHistoryKeys = {
  all: ['rank-history'] as const,
  unified: (userId: string) => [...rankHistoryKeys.all, 'unified', userId] as const,
};

export function gradingHistoryQueryOptions(userId: string) {
  return queryOptions({
    queryKey: rankHistoryKeys.unified(userId),
    queryFn: () => getGradingHistory(userId),
    enabled: Boolean(userId),
  });
}

/**
 * After any mutation that might affect the shogo recompute (verify, unverify,
 * or an edit that changed the shogo on a verified row), refetch the
 * better-auth session so a synced `user.shogoTitle` (followup D4) is reflected
 * in the sidebar / header without a full reload. Today this is a no-op on the
 * shogo-title field but the refresh is cheap and forward-compatible.
 */
function refreshSession(): void {
  void authClient.getSession();
}

/** Variables for the `useCreateRankHistory` mutation — `subjectUserId` is the user the entry is recorded for. */
export interface CreateRankHistoryVariables {
  subjectUserId: string;
  input: CreateRankHistoryInput;
}

/**
 * onSuccess composition: spread caller `options` FIRST, then define the
 * invalidating `onSuccess` AFTER, so a caller-supplied `onSuccess` cannot
 * overwrite the invalidation. Mirrors `useUpdateMyProfile`.
 */
export function useCreateRankHistory(
  options?: Omit<UseMutationOptions<RankHistory, Error, CreateRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subjectUserId, input }: CreateRankHistoryVariables) =>
      createRankHistory(subjectUserId, input),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      options?.onSuccess?.(...args);
    },
  });
}

/** Variables for the `useUpdateRankHistory` mutation — `subjectUserId` powers cache invalidation. */
export interface UpdateRankHistoryVariables {
  id: string;
  subjectUserId: string;
  input: UpdateRankHistoryInput;
}

export function useUpdateRankHistory(
  options?: Omit<UseMutationOptions<RankHistory, Error, UpdateRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateRankHistoryVariables) => updateRankHistory(id, input),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      refreshSession();
      options?.onSuccess?.(...args);
    },
  });
}

export interface DeleteRankHistoryVariables {
  id: string;
  subjectUserId: string;
}

export function useDeleteRankHistory(
  options?: Omit<UseMutationOptions<void, Error, DeleteRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteRankHistoryVariables) => deleteRankHistory(id),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      refreshSession();
      options?.onSuccess?.(...args);
    },
  });
}

export interface VerifyRankHistoryVariables {
  id: string;
  subjectUserId: string;
}

export function useVerifyRankHistory(
  options?: Omit<UseMutationOptions<RankHistory, Error, VerifyRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: VerifyRankHistoryVariables) => verifyRankHistory(id),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      refreshSession();
      options?.onSuccess?.(...args);
    },
  });
}

export function useUnverifyRankHistory(
  options?: Omit<UseMutationOptions<RankHistory, Error, VerifyRankHistoryVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: VerifyRankHistoryVariables) => unverifyRankHistory(id),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: rankHistoryKeys.unified(variables.subjectUserId),
      });
      refreshSession();
      options?.onSuccess?.(...args);
    },
  });
}

export type { GradingHistoryResponse };
```

- [ ] **Step 2: Create the barrel**

Create `apps/frontend/src/entities/rank-history/index.ts`:

```ts
export type {
  CreateRankHistoryInput,
  GradingHistoryResponse,
  GradingHistoryRow,
  RankHistory,
  RankHistoryResult,
  RankHistorySource,
  UpdateRankHistoryInput,
} from '@repo/contracts/rank-history';

export {
  createRankHistory,
  deleteRankHistory,
  getGradingHistory,
  unverifyRankHistory,
  updateRankHistory,
  verifyRankHistory,
} from './api/rank-history.api.js';

export {
  gradingHistoryQueryOptions,
  rankHistoryKeys,
  useCreateRankHistory,
  useDeleteRankHistory,
  useUnverifyRankHistory,
  useUpdateRankHistory,
  useVerifyRankHistory,
  type CreateRankHistoryVariables,
  type DeleteRankHistoryVariables,
  type UpdateRankHistoryVariables,
  type VerifyRankHistoryVariables,
} from './model/rank-history.queries.js';
```

- [ ] **Step 3: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0; the queries module compiles, the barrel re-exports resolve.

- [ ] **Step 4: Run the entity test suite**

```
pnpm --filter frontend exec vitest run src/entities/rank-history
```

Expected: PASS — the 6 cases from Task 1 still pass (no test for `queries.ts`; the consumer tests in Tasks 3-5 exercise the hooks).

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/entities/rank-history/model apps/frontend/src/entities/rank-history/index.ts
git commit -m "feat(frontend): entities/rank-history — queries + 5 mutation hooks + barrel"
```

---

### Task 3: Widget — `widgets/club-card/`

**Files:**

- Create: `apps/frontend/src/widgets/club-card/ui/ClubCard.tsx`
- Create: `apps/frontend/src/widgets/club-card/ui/ClubCard.test.tsx`
- Create: `apps/frontend/src/widgets/club-card/index.ts`
- Modify: `apps/frontend/steiger.config.js` — add a public-API sidestep override for the new test file's deep-path mock.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/widgets/club-card/ui/ClubCard.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClubCard } from './ClubCard.js';

import i18n from '@/i18n';

// Deep mocks — the query-options factories capture references at import time.
vi.mock('@/entities/membership/api/membership.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/membership/api/membership.api.js')>();
  return {
    ...actual,
    listMemberships: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'm-1',
          userId: 'u-1',
          organisationId: 'org-club-1',
          role: 'instructor',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
    }),
  };
});
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return {
    ...actual,
    listOrganisations: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'org-club-1',
          type: 'club',
          shortCode: 'KOB',
          slug: 'kobe-dojo',
          country: 'JPN',
          nameEn: 'Kobe Dojo',
          nameSv: 'Kobe Dojo',
          nameFi: 'Kobe Dojo',
          nameJa: '神戸道場',
          parentId: 'org-nat-1',
          headInstructorId: null,
          contactEmail: null,
          logoUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'org-nat-1',
          type: 'nationalFederation',
          shortCode: 'JPN',
          slug: 'japan',
          country: 'JPN',
          nameEn: 'Japan Taido Federation',
          nameSv: 'Japan Taido Federation',
          nameFi: 'Japan Taido Federation',
          nameJa: null,
          parentId: null,
          headInstructorId: null,
          contactEmail: null,
          logoUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 2,
    }),
  };
});

function renderCard(userId = 'u-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ClubCard userId={userId} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe('<ClubCard>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the user\'s club name and parent federation', async () => {
    renderCard();
    expect(await screen.findByText('Kobe Dojo')).toBeInTheDocument();
    expect(screen.getByText('Japan Taido Federation')).toBeInTheDocument();
  });

  it('renders the section heading "Club"', async () => {
    renderCard();
    expect(await screen.findByText(/club/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/widgets/club-card/ui/ClubCard.test.tsx
```

Expected: FAIL — `Failed to resolve import "./ClubCard.js"`.

- [ ] **Step 3: Create the widget**

Create `apps/frontend/src/widgets/club-card/ui/ClubCard.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listMembershipsQueryOptions } from '@/entities/membership';
import { displayName, listOrganisationsQueryOptions, type Organisation } from '@/entities/organisation';

export interface ClubCardProps {
  /** The user whose primary club is displayed. */
  userId: string;
  className?: string;
}

/**
 * ClubCard — the right-rail companion on `/grading-history` and on the admin
 * grading-history tab. Renders the user's primary club (the first `type='club'`
 * membership; if none, the first membership of any type) and the parent
 * federation's name. Pure presentational once the two queries resolve.
 *
 * Ported visually from the Taidopass `components/history/ClubCard.tsx`; the
 * MD3 surface-container-high / on-surface-variant tokens are the same ones
 * already used by the dashboard cards (see `apps/frontend/src/shared/ui/card.tsx`).
 */
export function ClubCard({ userId, className }: ClubCardProps): React.ReactElement | null {
  const { t, i18n } = useTranslation();
  const membershipsQuery = useQuery(listMembershipsQueryOptions({ userId }));
  const orgsQuery = useQuery(listOrganisationsQueryOptions());

  if (membershipsQuery.isPending || orgsQuery.isPending) {
    return (
      <aside
        className={[
          'rounded-sm bg-surface-container-high p-7 text-sm text-on-surface-variant',
          className ?? '',
        ].join(' ')}
      >
        {t('common.loading')}
      </aside>
    );
  }

  const memberships = membershipsQuery.data?.data ?? [];
  if (memberships.length === 0) return null;

  const allOrgs = orgsQuery.data?.data ?? [];
  const orgById = new Map<string, Organisation>(allOrgs.map((o) => [o.id, o]));

  // Prefer a club membership when present; otherwise take the first row.
  const primary =
    memberships.find((m) => orgById.get(m.organisationId)?.type === 'club') ?? memberships[0];
  if (!primary) return null;

  const club = orgById.get(primary.organisationId);
  if (!club) return null;

  const parent = club.parentId ? orgById.get(club.parentId) ?? null : null;
  const orgName = displayName(club, i18n.language);
  const parentName = parent ? displayName(parent, i18n.language) : null;

  return (
    <aside className={['rounded-sm bg-surface-container-high p-7', className ?? ''].join(' ')}>
      <h4 className="mb-4 text-[0.65rem] font-extrabold uppercase tracking-[0.2em] text-on-surface-variant">
        {t('gradingHistory.clubCard.heading', { defaultValue: 'Club' })}
      </h4>
      <div className="text-sm font-bold tracking-tight text-on-surface">{orgName}</div>
      {parentName ? <div className="mt-1 text-sm text-on-surface-variant">{parentName}</div> : null}
    </aside>
  );
}
```

- [ ] **Step 4: Create the barrel**

Create `apps/frontend/src/widgets/club-card/index.ts`:

```ts
export { ClubCard, type ClubCardProps } from './ui/ClubCard.js';
```

- [ ] **Step 5: Steiger override for the test file's deep mocks**

Modify `apps/frontend/steiger.config.js` — append a new override block before the closing `]`:

```js
  {
    // The club-card widget test mocks the membership and organisation entity
    // API modules by their deep paths because the query-options factories
    // capture the fetchers directly from those modules (not via the barrel).
    // Mocking the barrels wouldn't reach those imports, so `vi.mock` MUST
    // target the deep paths. Allow the public-API sidestep for this test file
    // only.
    files: ['src/widgets/club-card/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
```

- [ ] **Step 6: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/widgets/club-card/ui/ClubCard.test.tsx
```

Expected: PASS — both cases pass.

- [ ] **Step 7: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```
git add apps/frontend/src/widgets/club-card apps/frontend/steiger.config.js
git commit -m "feat(frontend): widgets/club-card — primary-club summary for grading-history right rail"
```

---

### Task 4: Feature — `features/grading-timeline/` (timeline rendering)

**Files:**

- Create: `apps/frontend/src/features/grading-timeline/ui/GradingTimeline.tsx`
- Create: `apps/frontend/src/features/grading-timeline/ui/GradingTimelineEntry.tsx`
- Create: `apps/frontend/src/features/grading-timeline/ui/GradingTimeline.test.tsx`
- Create: `apps/frontend/src/features/grading-timeline/index.ts`
- Modify: `apps/frontend/steiger.config.js` — add a public-API sidestep override for the new test file's deep mock.

- [ ] **Step 1: Write the failing component test**

Create `apps/frontend/src/features/grading-timeline/ui/GradingTimeline.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GradingTimeline } from './GradingTimeline.js';

import type { BeltRank } from '@/entities/belt-rank';
import type { ShogoTitle } from '@/entities/shogo-title';
import type { GradingHistoryRow } from '@/entities/rank-history';

import { DEFAULT_FLAGS, FeatureFlagsProvider, type FeatureFlagMap } from '@/shared/lib/feature-flags';
import i18n from '@/i18n';

const RANK: BeltRank = {
  id: 'rank-shodan',
  organisationId: null,
  systemId: 'sys-dan',
  level: 1,
  sortOrder: 100,
  nameJa: '初段',
  nameRomaji: 'Shodan',
  nameEn: '1st Dan',
  nameSv: '1 Dan',
  nameFi: '1. Dan',
  beltColor: '#000000',
  imageUrl: null,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const SHOGO: ShogoTitle = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: 'rank-yondan',
  sortOrder: 1,
};

const rankMap = new Map<string, BeltRank>([[RANK.id, RANK]]);
const systemCodeMap = new Map<string, string>([[RANK.systemId, 'dan']]);
const shogoTitleMap = new Map<string, ShogoTitle>([[SHOGO.code, SHOGO]]);

const baseRow: GradingHistoryRow = {
  id: '11111111-1111-4111-8111-111111111111',
  source: 'external',
  userId: 'u-1',
  rankId: RANK.id,
  shogoTitle: null,
  date: '2024-09-01',
  result: 'pass',
  notes: 'Great grading.',
  examiner: 'Sensei Tanaka',
  organisationName: 'Kobe Dojo',
  verified: false,
  verifiedBy: null,
  verifiedAt: null,
  canVerify: false,
  canEdit: false,
  updatedAt: null,
  updatedByUserId: null,
};

function renderTimeline(
  entries: GradingHistoryRow[],
  flags: FeatureFlagMap = DEFAULT_FLAGS,
  callbacks: Partial<React.ComponentProps<typeof GradingTimeline>> = {},
) {
  return render(
    <FeatureFlagsProvider flags={flags}>
      <I18nextProvider i18n={i18n}>
        <GradingTimeline
          entries={entries}
          rankMap={rankMap}
          systemCodeMap={systemCodeMap}
          shogoTitleMap={shogoTitleMap}
          {...callbacks}
        />
      </I18nextProvider>
    </FeatureFlagsProvider>,
  );
}

describe('<GradingTimeline>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders an empty-state message when no entries', () => {
    renderTimeline([]);
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
  });

  it('renders rows with EXTERNAL badge for external rows', () => {
    renderTimeline([baseRow]);
    expect(screen.getByText('Shodan — 1st Dan 初段', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/external/i)).toBeInTheDocument();
  });

  it('renders a FAILED badge for fail rows', () => {
    renderTimeline([{ ...baseRow, result: 'fail' }]);
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });

  it('hides Pending verification badge when flag is off', () => {
    renderTimeline([baseRow]);
    expect(screen.queryByText(/pending verification/i)).not.toBeInTheDocument();
  });

  it('shows Pending verification badge for external unverified rows when flag is on', () => {
    renderTimeline([baseRow], { ...DEFAULT_FLAGS, 'grading-history-verification': true });
    expect(screen.getByText(/pending verification/i)).toBeInTheDocument();
  });

  it('shows Verified shield for verified rows when flag is on', () => {
    renderTimeline(
      [
        {
          ...baseRow,
          verified: true,
          verifiedBy: { id: 'u-sys', name: 'Admin' },
          verifiedAt: '2026-05-25T08:00:00.000Z',
        },
      ],
      { ...DEFAULT_FLAGS, 'grading-history-verification': true },
    );
    expect(screen.getByTitle(/verified by admin/i)).toBeInTheDocument();
  });

  it('hides the Edit button when grading-history flag is off', () => {
    renderTimeline([{ ...baseRow, canEdit: true }]);
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('shows the Edit button when flag is on and canEdit && external', async () => {
    const onEdit = vi.fn();
    renderTimeline([{ ...baseRow, canEdit: true }], { ...DEFAULT_FLAGS, 'grading-history': true }, { onEdit });
    const editBtn = screen.getByRole('button', { name: /edit/i });
    expect(editBtn).toBeInTheDocument();
    await userEvent.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: baseRow.id }));
  });

  it('hides Verify/Unverify when verification flag is off', () => {
    renderTimeline([{ ...baseRow, canVerify: true }]);
    expect(screen.queryByRole('button', { name: /verify/i })).not.toBeInTheDocument();
  });

  it('shows Verify when verification flag is on and canVerify && !verified', async () => {
    const onVerify = vi.fn();
    renderTimeline(
      [{ ...baseRow, canVerify: true }],
      { ...DEFAULT_FLAGS, 'grading-history-verification': true },
      { onVerify },
    );
    const verifyBtn = screen.getByRole('button', { name: /^verify$/i });
    await userEvent.click(verifyBtn);
    expect(onVerify).toHaveBeenCalledWith(baseRow.id);
  });

  it('shows Unverify when verification flag is on and canVerify && verified', async () => {
    const onUnverify = vi.fn();
    renderTimeline(
      [
        {
          ...baseRow,
          canVerify: true,
          verified: true,
          verifiedBy: { id: 'u-sys', name: 'Admin' },
          verifiedAt: '2026-05-25T08:00:00.000Z',
        },
      ],
      { ...DEFAULT_FLAGS, 'grading-history-verification': true },
      { onUnverify },
    );
    const unverifyBtn = screen.getByRole('button', { name: /unverify/i });
    await userEvent.click(unverifyBtn);
    expect(onUnverify).toHaveBeenCalledWith(baseRow.id);
  });

  it('renders rows in date-descending order (latest first)', () => {
    const older: GradingHistoryRow = { ...baseRow, id: 'older', date: '2020-01-01' };
    const newer: GradingHistoryRow = { ...baseRow, id: 'newer', date: '2024-09-01' };
    renderTimeline([older, newer]);
    const dateCells = screen.getAllByText(/\d{4}-\d{2}-\d{2}/);
    expect(dateCells[0]?.textContent).toBe('2024-09-01');
    expect(dateCells[1]?.textContent).toBe('2020-01-01');
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/features/grading-timeline/ui/GradingTimeline.test.tsx
```

Expected: FAIL — `Failed to resolve import "./GradingTimeline.js"`.

- [ ] **Step 3: Create `<GradingTimelineEntry>`**

Create `apps/frontend/src/features/grading-timeline/ui/GradingTimelineEntry.tsx`:

```tsx
import { Award, BadgeCheck, Pencil, Shield, ShieldCheck, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { BeltRank } from '@/entities/belt-rank';
import type { GradingHistoryRow } from '@/entities/rank-history';
import type { ShogoTitle } from '@/entities/shogo-title';

import { getBeltVisuals, type BeltColor } from '@/shared/lib/belt-visuals';
import { useFeatureFlag } from '@/shared/lib/feature-flags';
import { rankLabel, type Lang } from '@/shared/lib/rank-label';
import { Button } from '@/shared/ui';
import { BeltGraphic } from '@/shared/ui/belt-graphic';

/**
 * Shogo overlay paint on a black belt. `<BeltGraphic>` already supports
 * `overlayTopHalf`; we just pick the colour per title code.
 */
const SHOGO_OVERLAY: Record<string, BeltColor> = {
  renshi: 'magenta',
  kyoshi: 'green',
  hanshi: 'brown',
};

const SHOGO_NAME_FIELD: Record<Lang, keyof Pick<ShogoTitle, 'nameEn' | 'nameSv' | 'nameFi'>> = {
  en: 'nameEn',
  sv: 'nameSv',
  fi: 'nameFi',
};

export interface GradingTimelineEntryProps {
  entry: GradingHistoryRow;
  rank: BeltRank | undefined;
  systemCodeMap: Map<string, string>;
  shogoTitleMap: Map<string, ShogoTitle>;
  /** True when this row is the most recent passing grading; styled at full opacity. */
  isLatest: boolean;
  onEdit?: (entry: GradingHistoryRow) => void;
  onVerify?: (id: string) => void;
  onUnverify?: (id: string) => void;
}

/**
 * One row of the grading timeline. Rendering rules are spec §9.6 — preserved
 * verbatim from the Taidopass `GradingTimelineEntry`. Icon mappings:
 *   `Award01` → `lucide-react`'s `Award`
 *   `CheckVerified01` → `BadgeCheck`
 *   `XClose` → `X`
 *   `Shield01` → `Shield`
 *   `ShieldTick` → `ShieldCheck`
 *   `Edit01` → `Pencil`
 *   `MessageChatCircle` is intentionally omitted — no feedback thread on
 *   taidohub v1 (instructor-feedback flag is out of scope for Plan C).
 */
export function GradingTimelineEntry({
  entry,
  rank,
  systemCodeMap,
  shogoTitleMap,
  isLatest,
  onEdit,
  onVerify,
  onUnverify,
}: GradingTimelineEntryProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const verificationEnabled = useFeatureFlag('grading-history-verification');
  const gradingHistoryEnabled = useFeatureFlag('grading-history');
  const lang = (i18n.language as Lang) ?? 'en';

  const isFail = entry.result === 'fail';
  const isExternal = entry.source === 'external';

  const localised = rank
    ? rankLabel(
        {
          nameRomaji: rank.nameRomaji,
          nameEn: rank.nameEn,
          nameSv: rank.nameSv,
          nameFi: rank.nameFi,
        },
        lang,
      )
    : '';
  // rankLabel returns "{romaji} — {localised}"; if `nameJa` exists, append it.
  const rankTitle = rank?.nameJa ? `${localised} ${rank.nameJa}`.trim() : localised;

  const systemCode = rank ? systemCodeMap.get(rank.systemId) ?? '' : '';
  const beltVisuals = rank && systemCode ? getBeltVisuals(systemCode, rank.level) : null;

  let nodeClass: string;
  let NodeIcon: React.ComponentType<{ className?: string }>;
  if (isFail) {
    nodeClass = 'bg-error-container border border-error/15';
    NodeIcon = X;
  } else if (isLatest) {
    nodeClass = 'bg-primary-container shadow-xs';
    NodeIcon = BadgeCheck;
  } else {
    nodeClass = 'bg-surface-container-high';
    NodeIcon = Award;
  }

  const iconColor = isFail
    ? 'text-error'
    : isLatest
      ? 'text-white'
      : 'text-on-surface-variant';

  const borderColor = isFail
    ? 'rgba(186,26,26,0.2)'
    : rank
      ? isLatest
        ? rank.beltColor
        : `${rank.beltColor}66`
      : '#c5c6cd';

  const examinerLine = [entry.examiner, entry.organisationName].filter(Boolean).join(' · ');

  const shogoRow = entry.shogoTitle ? shogoTitleMap.get(entry.shogoTitle) : null;
  const shogoLabel = shogoRow ? shogoRow[SHOGO_NAME_FIELD[lang]] || shogoRow.nameEn : null;
  const shogoOverlay = entry.shogoTitle ? SHOGO_OVERLAY[entry.shogoTitle] : null;

  const showEdit = gradingHistoryEnabled && entry.canEdit && isExternal;
  const showVerifyOrUnverify = verificationEnabled && entry.canVerify;
  const showActionRow = showEdit || showVerifyOrUnverify;

  return (
    <div className="relative flex items-start gap-10 pb-14 last:pb-0">
      <div
        className={`z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${nodeClass}`}
      >
        <NodeIcon className={`h-[22px] w-[22px] ${iconColor}`} />
      </div>

      <div className="flex-1 pt-1">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h3 className="font-headline text-xl font-bold text-primary">
            {rankTitle}
            {isFail ? (
              <span className="ml-3 inline-flex items-center gap-1 rounded-sm bg-error/8 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-error">
                {t('gradingHistory.timeline.failed', { defaultValue: 'Failed' })}
              </span>
            ) : null}
            {isExternal ? (
              <span className="ml-3 inline-flex items-center gap-1 rounded-sm bg-surface-container-high px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-on-surface-variant">
                {t('gradingHistory.timeline.external', { defaultValue: 'External' })}
              </span>
            ) : null}
            {verificationEnabled && entry.verified ? (
              <span
                className="ml-2 inline-flex items-center"
                title={
                  entry.verifiedBy
                    ? t('gradingHistory.timeline.verifiedBy', {
                        name: entry.verifiedBy.name,
                        date: entry.verifiedAt?.slice(0, 10) ?? '',
                        defaultValue: `verified by ${entry.verifiedBy.name} on ${entry.verifiedAt?.slice(0, 10) ?? ''}`,
                      })
                    : t('gradingHistory.timeline.verifiedFallback', { defaultValue: 'Verified' })
                }
              >
                <ShieldCheck className="h-4 w-4 text-primary" />
              </span>
            ) : null}
            {verificationEnabled && !entry.verified && isExternal ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-sm bg-amber-100 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-amber-900">
                <Shield className="h-3 w-3" />
                {t('gradingHistory.timeline.pendingVerification', {
                  defaultValue: 'Pending verification',
                })}
              </span>
            ) : null}
            {shogoLabel ? (
              <span className="ml-3 inline-flex items-center gap-1 rounded-sm bg-primary-container px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white">
                {shogoLabel}
              </span>
            ) : null}
          </h3>
          <span className="ml-4 shrink-0 text-sm font-semibold uppercase tracking-widest text-on-surface-variant">
            {entry.date}
          </span>
        </div>

        {showActionRow ? (
          <div className="mb-3 flex items-center gap-2">
            {showEdit ? (
              <Button variant="ghost" size="sm" onClick={() => onEdit?.(entry)}>
                <Pencil className="mr-1 h-[14px] w-[14px]" />
                {t('gradingHistory.timeline.edit', { defaultValue: 'Edit' })}
              </Button>
            ) : null}
            {showVerifyOrUnverify ? (
              entry.verified ? (
                <Button variant="ghost" size="sm" onClick={() => onUnverify?.(entry.id)}>
                  {t('gradingHistory.timeline.unverify', { defaultValue: 'Unverify' })}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => onVerify?.(entry.id)}>
                  <ShieldCheck className="mr-1 h-[14px] w-[14px]" />
                  {t('gradingHistory.timeline.verify', { defaultValue: 'Verify' })}
                </Button>
              )
            ) : null}
          </div>
        ) : null}

        {!isFail ? (
          shogoOverlay ? (
            <div className="mb-4">
              <BeltGraphic gradient="black" overlayTopHalf={shogoOverlay} className="w-48" />
            </div>
          ) : beltVisuals ? (
            <div className="mb-4">
              <BeltGraphic {...beltVisuals} className="w-48" />
            </div>
          ) : null
        ) : null}

        {examinerLine ? (
          <p className="mb-4 text-sm italic text-on-surface-variant">— {examinerLine}</p>
        ) : null}

        {entry.notes ? (
          <div
            className={`rounded-sm border-l-4 p-6 transition-colors ${
              isFail ? 'bg-error/3' : 'bg-surface-container-lowest hover:bg-white'
            }`}
            style={{ borderColor }}
          >
            <p className="text-sm leading-relaxed text-on-surface">{entry.notes}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `<GradingTimeline>`**

Create `apps/frontend/src/features/grading-timeline/ui/GradingTimeline.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { BeltRank } from '@/entities/belt-rank';
import type { GradingHistoryRow } from '@/entities/rank-history';
import type { ShogoTitle } from '@/entities/shogo-title';

import { GradingTimelineEntry } from './GradingTimelineEntry.js';

export interface GradingTimelineProps {
  /** Rows to render. The component re-sorts by date DESC internally. */
  entries: GradingHistoryRow[];
  rankMap: Map<string, BeltRank>;
  systemCodeMap: Map<string, string>;
  shogoTitleMap: Map<string, ShogoTitle>;
  onEdit?: (entry: GradingHistoryRow) => void;
  onVerify?: (id: string) => void;
  onUnverify?: (id: string) => void;
}

/**
 * Vertical timeline of grading entries. Re-sorts on every render (cheap; the
 * list is short). The latest pass index is computed once and passed down so
 * one row gets full-opacity styling.
 */
export function GradingTimeline({
  entries,
  rankMap,
  systemCodeMap,
  shogoTitleMap,
  onEdit,
  onVerify,
  onUnverify,
}: GradingTimelineProps): React.ReactElement {
  const { t } = useTranslation();
  const sorted = React.useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );

  if (sorted.length === 0) {
    return (
      <p className="py-8 text-sm text-on-surface-variant">
        {t('gradingHistory.timeline.noEntriesYet', { defaultValue: 'No entries yet.' })}
      </p>
    );
  }

  const latestPassIdx = sorted.findIndex((e) => e.result === 'pass');

  return (
    <div className="relative">
      <div className="absolute bottom-0 left-6 top-0 w-px bg-outline-variant/25" />
      <div className="space-y-0">
        {sorted.map((entry, i) => (
          <GradingTimelineEntry
            key={entry.id}
            entry={entry}
            rank={rankMap.get(entry.rankId)}
            systemCodeMap={systemCodeMap}
            shogoTitleMap={shogoTitleMap}
            isLatest={i === latestPassIdx}
            onEdit={onEdit}
            onVerify={onVerify}
            onUnverify={onUnverify}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the barrel**

Create `apps/frontend/src/features/grading-timeline/index.ts`:

```ts
export { GradingTimeline, type GradingTimelineProps } from './ui/GradingTimeline.js';
export {
  GradingTimelineEntry,
  type GradingTimelineEntryProps,
} from './ui/GradingTimelineEntry.js';
```

- [ ] **Step 6: Steiger override for the test file**

The test does NOT deep-mock any API module (it injects rows directly via props), so no `no-public-api-sidestep` override is needed. Verify by running `pnpm --filter frontend arch` after Step 7; if Steiger complains, append a block mirroring Task 3 Step 5.

- [ ] **Step 7: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/features/grading-timeline/ui/GradingTimeline.test.tsx
```

Expected: PASS — all 11 cases pass.

- [ ] **Step 8: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 9: Commit**

```
git add apps/frontend/src/features/grading-timeline
git commit -m "feat(frontend): features/grading-timeline — vertical timeline with flag-gated verify/edit actions"
```

---

### Task 5: Feature — `features/rank-history-form/` (create/edit modal)

**Files:**

- Create: `apps/frontend/src/features/rank-history-form/ui/RankHistoryFormDialog.tsx`
- Create: `apps/frontend/src/features/rank-history-form/ui/RankHistoryFormDialog.test.tsx`
- Create: `apps/frontend/src/features/rank-history-form/index.ts`
- Modify: `apps/frontend/steiger.config.js` — add a public-API sidestep override for the new test file's deep mock.

- [ ] **Step 1: Write the failing component test**

Create `apps/frontend/src/features/rank-history-form/ui/RankHistoryFormDialog.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RankHistoryFormDialog } from './RankHistoryFormDialog.js';

import type { GradingHistoryRow } from '@/entities/rank-history';

import i18n from '@/i18n';

vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return {
    ...actual,
    getBeltRanks: vi.fn().mockResolvedValue([
      {
        id: 'rank-shodan',
        organisationId: null,
        systemId: 'sys-dan',
        level: 1,
        sortOrder: 100,
        nameJa: '初段',
        nameRomaji: 'Shodan',
        nameEn: '1st Dan',
        nameSv: '1 Dan',
        nameFi: '1. Dan',
        beltColor: '#000000',
        imageUrl: null,
        descriptionEn: null,
        descriptionSv: null,
        descriptionFi: null,
        publiclyVisible: false,
        slug: null,
        minAge: null,
        nextRankId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
  };
});

vi.mock('@/entities/shogo-title/api/shogo-title.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/shogo-title/api/shogo-title.api.js')>();
  return {
    ...actual,
    getShogoTitles: vi.fn().mockResolvedValue([
      {
        code: 'renshi',
        nameEn: 'Renshi',
        nameSv: 'Renshi',
        nameFi: 'Renshi',
        nameJa: '錬士',
        minRankId: 'rank-yondan',
        sortOrder: 1,
      },
    ]),
  };
});

vi.mock('@/entities/rank-history/api/rank-history.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/rank-history/api/rank-history.api.js')>();
  return {
    ...actual,
    createRankHistory: vi.fn().mockResolvedValue({
      id: 'new-row',
      userId: 'u-1',
      rankId: 'rank-shodan',
      shogoTitle: null,
      date: '2024-09-01',
      result: 'pass',
      source: 'external',
      eventId: null,
      recordedByUserId: 'u-1',
      examinerName: null,
      organisationName: null,
      notes: null,
      verified: false,
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: '2026-05-25T08:00:00.000Z',
      updatedAt: null,
      updatedByUserId: null,
    }),
    updateRankHistory: vi.fn().mockResolvedValue({
      id: 'existing-row',
      userId: 'u-1',
      rankId: 'rank-shodan',
      shogoTitle: null,
      date: '2024-09-01',
      result: 'pass',
      source: 'external',
      eventId: null,
      recordedByUserId: 'u-1',
      examinerName: null,
      organisationName: null,
      notes: 'fixed',
      verified: false,
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: '2026-05-25T08:00:00.000Z',
      updatedAt: '2026-05-25T09:00:00.000Z',
      updatedByUserId: 'u-1',
    }),
  };
});

const VERIFIED_ROW: GradingHistoryRow = {
  id: 'existing-row',
  source: 'external',
  userId: 'u-1',
  rankId: 'rank-shodan',
  shogoTitle: null,
  date: '2024-09-01',
  result: 'pass',
  notes: 'orig notes',
  examiner: 'Sensei Tanaka',
  organisationName: 'Kobe Dojo',
  verified: true,
  verifiedBy: { id: 'u-sys', name: 'Admin' },
  verifiedAt: '2026-05-25T08:00:00.000Z',
  canVerify: true,
  canEdit: true,
  updatedAt: null,
  updatedByUserId: null,
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof RankHistoryFormDialog>> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <RankHistoryFormDialog
          mode={props.mode ?? 'create'}
          open
          onOpenChange={onOpenChange}
          subjectUserId={props.subjectUserId ?? 'u-1'}
          entry={props.entry}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onOpenChange, user: userEvent.setup() };
}

describe('<RankHistoryFormDialog>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('opens in create mode with empty rank/date inputs', async () => {
    renderDialog({ mode: 'create' });
    expect(await screen.findByLabelText(/date/i)).toHaveValue('');
  });

  it('opens in edit mode with seeded values', async () => {
    renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    expect(await screen.findByLabelText(/date/i)).toHaveValue('2024-09-01');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('orig notes');
  });

  it('does not show the amber warning when only notes are dirty on a verified row', async () => {
    const { user } = renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    const notes = await screen.findByLabelText(/notes/i);
    await user.clear(notes);
    await user.type(notes, 'updated notes');
    expect(screen.queryByText(/clears the verification/i)).not.toBeInTheDocument();
  });

  it('shows the amber warning when date is changed on a verified row', async () => {
    const { user } = renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    const date = await screen.findByLabelText(/date/i);
    await user.clear(date);
    await user.type(date, '2024-10-01');
    await waitFor(() =>
      expect(screen.getByText(/clears the verification by admin/i)).toBeInTheDocument(),
    );
  });

  it('submits a create via the mutation hook', async () => {
    const { user } = renderDialog({ mode: 'create' });
    await user.click(await screen.findByRole('combobox', { name: /rank/i }));
    await user.click(screen.getByRole('option', { name: /shodan/i }));
    const date = screen.getByLabelText(/date/i);
    await user.type(date, '2024-09-01');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    const { createRankHistory } = await import('@/entities/rank-history/api/rank-history.api.js');
    await waitFor(() =>
      expect(createRankHistory).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({ rankId: 'rank-shodan', date: '2024-09-01' }),
      ),
    );
  });

  it('submits an edit patch via the mutation hook', async () => {
    const { user } = renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    const notes = await screen.findByLabelText(/notes/i);
    await user.clear(notes);
    await user.type(notes, 'fixed');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    const { updateRankHistory } = await import('@/entities/rank-history/api/rank-history.api.js');
    await waitFor(() =>
      expect(updateRankHistory).toHaveBeenCalledWith(
        'existing-row',
        expect.objectContaining({ notes: 'fixed' }),
      ),
    );
  });

  it('surfaces server errors inline', async () => {
    const { updateRankHistory } = await import('@/entities/rank-history/api/rank-history.api.js');
    vi.mocked(updateRankHistory).mockRejectedValueOnce(new Error('boom'));
    const { user } = renderDialog({ mode: 'edit', entry: VERIFIED_ROW });
    const notes = await screen.findByLabelText(/notes/i);
    await user.clear(notes);
    await user.type(notes, 'fixed');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend exec vitest run src/features/rank-history-form/ui/RankHistoryFormDialog.test.tsx
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create the dialog component**

Create `apps/frontend/src/features/rank-history-form/ui/RankHistoryFormDialog.tsx`:

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions } from '@/entities/belt-rank';
import { listShogoTitlesQueryOptions } from '@/entities/shogo-title';
import {
  useCreateRankHistory,
  useUpdateRankHistory,
  type GradingHistoryRow,
} from '@/entities/rank-history';

import { HttpError } from '@/shared/api';
import { rankLabel, type Lang } from '@/shared/lib/rank-label';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  FormMessage,
  Input,
  Label,
} from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

import {
  CreateRankHistorySchema,
  type CreateRankHistoryInput,
} from '@repo/contracts/rank-history';

type Mode = 'create' | 'edit';

export interface RankHistoryFormDialogProps {
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user the entry is recorded for. Self-service passes the current user; admin passes the edited user. */
  subjectUserId: string;
  /** Required when `mode='edit'`. The row being edited. */
  entry?: GradingHistoryRow;
}

interface FormValues {
  rankId: string;
  shogoTitle: string;
  date: string;
  examinerName: string;
  organisationName: string;
  notes: string;
}

const EMPTY: FormValues = {
  rankId: '',
  shogoTitle: '',
  date: '',
  examinerName: '',
  organisationName: '',
  notes: '',
};

function entryToValues(entry: GradingHistoryRow | undefined): FormValues {
  if (!entry) return EMPTY;
  return {
    rankId: entry.rankId,
    shogoTitle: entry.shogoTitle ?? '',
    date: entry.date,
    examinerName: entry.examiner ?? '',
    organisationName: entry.organisationName ?? '',
    notes: entry.notes ?? '',
  };
}

/** Strip empty strings → null so the wire payload matches the Zod schema. */
function valuesToInput(values: FormValues): CreateRankHistoryInput {
  return {
    rankId: values.rankId,
    date: values.date,
    shogoTitle: values.shogoTitle ? values.shogoTitle : null,
    examinerName: values.examinerName ? values.examinerName : null,
    organisationName: values.organisationName ? values.organisationName : null,
    notes: values.notes ? values.notes : null,
  };
}

/**
 * Create/edit modal for external grading-history entries. Uses
 * `react-hook-form` + `zodResolver(CreateRankHistorySchema)`. Edit mode
 * seeds the form from the passed `entry` and submits a partial patch.
 *
 * When editing a verified row, an amber warning appears above the submit
 * button if any of `rankId` / `date` / `shogoTitle` is dirty — these are the
 * three fields the backend clears verification for (spec §5 rule 3).
 */
export function RankHistoryFormDialog({
  mode,
  open,
  onOpenChange,
  subjectUserId,
  entry,
}: RankHistoryFormDialogProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as Lang) ?? 'en';

  const ranksQuery = useQuery(listBeltRanksQueryOptions());
  const shogoQuery = useQuery(listShogoTitlesQueryOptions());

  const defaultValues = React.useMemo(() => entryToValues(entry), [entry]);

  const form = useForm<FormValues>({
    defaultValues,
    // Drives validation on save click; the resolver maps FormValues through
    // CreateRankHistorySchema (after `valuesToInput` strips empty strings).
    resolver: zodResolver(CreateRankHistorySchema, undefined, {
      mode: 'sync',
      raw: false,
    }),
  });

  // Re-seed the form whenever `entry` changes (e.g. when the admin tab
  // switches subject between users).
  React.useEffect(() => {
    form.reset(defaultValues);
  }, [defaultValues, form]);

  const [submitError, setSubmitError] = React.useState<string | undefined>();

  const createMutation = useCreateRankHistory({
    onSuccess: () => {
      setSubmitError(undefined);
      onOpenChange(false);
    },
    onError: (err) => setSubmitError(err instanceof Error ? err.message : String(err)),
  });
  const updateMutation = useUpdateRankHistory({
    onSuccess: () => {
      setSubmitError(undefined);
      onOpenChange(false);
    },
    onError: (err) => setSubmitError(err instanceof Error ? err.message : String(err)),
  });

  // Sort ranks for the Select (global sortOrder ASC).
  const sortedRanks = React.useMemo(
    () => [...(ranksQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [ranksQuery.data],
  );
  const sortedShogo = React.useMemo(
    () => [...(shogoQuery.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [shogoQuery.data],
  );

  // RHF watch — used both for dirty-detection on verified rows and for
  // disabling the submit button on missing required fields.
  const watched = form.watch();
  const dirtyFields = form.formState.dirtyFields;
  const isVerifiedEdit = mode === 'edit' && entry?.verified === true;
  const dirtyContentChanged =
    Boolean(dirtyFields.rankId) || Boolean(dirtyFields.date) || Boolean(dirtyFields.shogoTitle);
  const showWarning = isVerifiedEdit && dirtyContentChanged;

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(undefined);
    const input = valuesToInput(values);
    try {
      if (mode === 'create') {
        await createMutation.mutateAsync({ subjectUserId, input });
      } else if (entry) {
        await updateMutation.mutateAsync({ id: entry.id, subjectUserId, input });
      }
    } catch (err) {
      if (err instanceof HttpError) {
        setSubmitError(err.payload.message || err.message);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError(t('common.unknownError'));
      }
    }
  });

  const title =
    mode === 'edit'
      ? t('gradingHistory.form.editTitle', { defaultValue: 'Edit past grading' })
      : t('gradingHistory.form.createTitle', { defaultValue: 'Add past grading' });

  const verifierName = entry?.verifiedBy?.name ?? '';
  const verifierDate = entry?.verifiedAt?.slice(0, 10) ?? '';
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {showWarning ? (
            <div className="rounded-sm border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('gradingHistory.form.clearsVerification', {
                name: verifierName,
                date: verifierDate,
                defaultValue: `Saving will clear the verification by ${verifierName} on ${verifierDate}.`,
              })}
            </div>
          ) : null}

          <FormField>
            <Label htmlFor="rh-rank">
              {t('gradingHistory.form.rank', { defaultValue: 'Rank' })}
            </Label>
            <Select
              value={watched.rankId}
              onValueChange={(v) => form.setValue('rankId', v, { shouldDirty: true })}
            >
              <SelectTrigger
                id="rh-rank"
                aria-label={t('gradingHistory.form.rank', { defaultValue: 'Rank' })}
              >
                <SelectValue
                  placeholder={t('gradingHistory.form.rankPlaceholder', { defaultValue: 'Select…' })}
                />
              </SelectTrigger>
              <SelectContent>
                {sortedRanks.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {rankLabel(
                      {
                        nameRomaji: r.nameRomaji,
                        nameEn: r.nameEn,
                        nameSv: r.nameSv,
                        nameFi: r.nameFi,
                      },
                      lang,
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage message={form.formState.errors.rankId?.message} />
          </FormField>

          <FormField>
            <Label htmlFor="rh-shogo">
              {t('gradingHistory.form.shogoTitle', { defaultValue: 'Shogo title (optional)' })}
            </Label>
            <Select
              value={watched.shogoTitle || '__none__'}
              onValueChange={(v) =>
                form.setValue('shogoTitle', v === '__none__' ? '' : v, { shouldDirty: true })
              }
            >
              <SelectTrigger
                id="rh-shogo"
                aria-label={t('gradingHistory.form.shogoTitle', {
                  defaultValue: 'Shogo title (optional)',
                })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t('gradingHistory.form.shogoNone', { defaultValue: 'None' })}
                </SelectItem>
                {sortedShogo.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {(
                      { en: s.nameEn, sv: s.nameSv, fi: s.nameFi } as Record<string, string>
                    )[lang] || s.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField>
            <Label htmlFor="rh-date">
              {t('gradingHistory.form.date', { defaultValue: 'Date' })}
            </Label>
            <Input id="rh-date" type="date" {...form.register('date')} />
            <FormMessage message={form.formState.errors.date?.message} />
          </FormField>

          <FormField>
            <Label htmlFor="rh-examiner">
              {t('gradingHistory.form.examinerName', { defaultValue: 'Examiner' })}
            </Label>
            <Input id="rh-examiner" {...form.register('examinerName')} />
          </FormField>

          <FormField>
            <Label htmlFor="rh-org">
              {t('gradingHistory.form.organisationName', { defaultValue: 'Organisation' })}
            </Label>
            <Input id="rh-org" {...form.register('organisationName')} />
          </FormField>

          <FormField>
            <Label htmlFor="rh-notes">
              {t('gradingHistory.form.notes', { defaultValue: 'Notes' })}
            </Label>
            <textarea
              id="rh-notes"
              rows={3}
              className="w-full rounded-sm border border-outline-variant/40 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              {...form.register('notes')}
            />
            <FormMessage message={form.formState.errors.notes?.message} />
          </FormField>

          <FormMessage message={submitError} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !watched.rankId || !watched.date}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create the barrel**

Create `apps/frontend/src/features/rank-history-form/index.ts`:

```ts
export {
  RankHistoryFormDialog,
  type RankHistoryFormDialogProps,
} from './ui/RankHistoryFormDialog.js';
```

- [ ] **Step 5: Steiger override for the test file**

Modify `apps/frontend/steiger.config.js` — append before the closing `]`:

```js
  {
    // The rank-history-form test mocks the belt-rank, shogo-title, and
    // rank-history entity API modules by their deep paths because the
    // query-options / mutation factories capture the fetchers directly from
    // those modules (not via the barrel). Mocking the barrels wouldn't reach
    // those imports, so `vi.mock` MUST target the deep paths. Allow the
    // public-API sidestep for this test file only.
    files: ['src/features/rank-history-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
```

- [ ] **Step 6: Confirm `@/shared/ui` exports `Dialog` parts and `FormField`**

Read `apps/frontend/src/shared/ui/index.ts`; the existing barrel must re-export `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` (from `dialog.tsx`) and `FormField`, `FormMessage` (from `form.tsx`). If any are missing, add the re-export there:

```ts
export {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog.js';
export { FormField, FormMessage } from './form.js';
```

Skip this sub-step if those re-exports already exist.

- [ ] **Step 7: Run the test — expect PASS**

```
pnpm --filter frontend exec vitest run src/features/rank-history-form/ui/RankHistoryFormDialog.test.tsx
```

Expected: PASS — all 7 cases pass.

- [ ] **Step 8: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 9: Commit**

```
git add apps/frontend/src/features/rank-history-form apps/frontend/steiger.config.js apps/frontend/src/shared/ui/index.ts
git commit -m "feat(frontend): features/rank-history-form — RHF dialog with zodResolver + verified-edit warning"
```

---

### Task 6: Page — `pages/grading-history/`

**Files:**

- Create: `apps/frontend/src/pages/grading-history/ui/GradingHistoryPage.tsx`
- Create: `apps/frontend/src/pages/grading-history/index.ts`

- [ ] **Step 1: Create the page**

Create `apps/frontend/src/pages/grading-history/ui/GradingHistoryPage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { listBeltRanksQueryOptions, type BeltRank } from '@/entities/belt-rank';
import { listBeltSystemsQueryOptions } from '@/entities/belt-system';
import { gradingHistoryQueryOptions, type GradingHistoryRow } from '@/entities/rank-history';
import { listShogoTitlesQueryOptions, type ShogoTitle } from '@/entities/shogo-title';

import { useSession } from '@/features/auth-by-email';
import { GradingTimeline } from '@/features/grading-timeline';
import { RankHistoryFormDialog } from '@/features/rank-history-form';

import { FeatureFlag, useFeatureFlag } from '@/shared/lib/feature-flags';
import { Button } from '@/shared/ui';

import { ClubCard } from '@/widgets/club-card';

import {
  useUnverifyRankHistory,
  useVerifyRankHistory,
} from '@/entities/rank-history';

/**
 * Self-service grading-history page. Two-column layout:
 *   left  = `<GradingTimeline />` over the unified projection
 *   right = `<ClubCard />` (single card for v1)
 *
 * The Add/Edit modal is shared with the admin variant (`UserForm` 4th tab) —
 * gating differs only in the source of `subjectUserId`.
 */
export function GradingHistoryPage(): React.ReactElement {
  const { t } = useTranslation();
  const session = useSession();
  const userId = session.data?.user?.id ?? '';

  const historyQuery = useQuery(gradingHistoryQueryOptions(userId));
  const ranksQuery = useQuery(listBeltRanksQueryOptions());
  const systemsQuery = useQuery(listBeltSystemsQueryOptions());
  const shogoQuery = useQuery(listShogoTitlesQueryOptions());

  // The verify/unverify hooks need `subjectUserId` for cache invalidation.
  const verifyMutation = useVerifyRankHistory();
  const unverifyMutation = useUnverifyRankHistory();

  const [dialogState, setDialogState] = React.useState<
    { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; entry: GradingHistoryRow }
  >({ kind: 'closed' });

  const gradingHistoryEnabled = useFeatureFlag('grading-history');

  const rankMap = React.useMemo(() => {
    const m = new Map<string, BeltRank>();
    for (const r of ranksQuery.data ?? []) m.set(r.id, r);
    return m;
  }, [ranksQuery.data]);
  const systemCodeMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of systemsQuery.data ?? []) m.set(s.id, s.code);
    return m;
  }, [systemsQuery.data]);
  const shogoTitleMap = React.useMemo(() => {
    const m = new Map<string, ShogoTitle>();
    for (const s of shogoQuery.data ?? []) m.set(s.code, s);
    return m;
  }, [shogoQuery.data]);

  const entries = historyQuery.data?.data ?? [];

  return (
    <main className="mx-auto max-w-[1100px] space-y-8 p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary">
            {t('gradingHistory.title', { defaultValue: 'Grading history' })}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
            {t('gradingHistory.description', {
              defaultValue:
                'Every grading you have recorded or that has been mirrored from an event. Add past gradings to keep the picture complete.',
            })}
          </p>
        </div>
        <FeatureFlag code="grading-history">
          <Button
            variant="default"
            size="sm"
            onClick={() => setDialogState({ kind: 'create' })}
            disabled={!userId}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {t('gradingHistory.addPastGrading', { defaultValue: 'Add past grading' })}
          </Button>
        </FeatureFlag>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          {historyQuery.isPending ? (
            <p className="text-on-surface-variant">{t('common.loading')}</p>
          ) : historyQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {historyQuery.error instanceof Error
                ? historyQuery.error.message
                : t('common.unknownError')}
            </p>
          ) : (
            <GradingTimeline
              entries={entries}
              rankMap={rankMap}
              systemCodeMap={systemCodeMap}
              shogoTitleMap={shogoTitleMap}
              onEdit={(entry) => setDialogState({ kind: 'edit', entry })}
              onVerify={(id) => verifyMutation.mutate({ id, subjectUserId: userId })}
              onUnverify={(id) => unverifyMutation.mutate({ id, subjectUserId: userId })}
            />
          )}
        </section>

        <aside className="space-y-6">
          {userId ? <ClubCard userId={userId} /> : null}
        </aside>
      </div>

      {gradingHistoryEnabled && dialogState.kind !== 'closed' ? (
        <RankHistoryFormDialog
          mode={dialogState.kind}
          open
          onOpenChange={(o) => {
            if (!o) setDialogState({ kind: 'closed' });
          }}
          subjectUserId={userId}
          entry={dialogState.kind === 'edit' ? dialogState.entry : undefined}
        />
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Create the barrel**

Create `apps/frontend/src/pages/grading-history/index.ts`:

```ts
export { GradingHistoryPage } from './ui/GradingHistoryPage.js';
```

- [ ] **Step 3: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 4: Commit**

```
git add apps/frontend/src/pages/grading-history
git commit -m "feat(frontend): pages/grading-history — two-column timeline + ClubCard + flag-gated Add modal"
```

---

### Task 7: Route — `_app.grading-history.tsx`

**Files:**

- Create: `apps/frontend/src/app/router/routes/_app.grading-history.tsx`
- Modify: `apps/frontend/src/app/router/routeTree.gen.ts` is auto-generated by `@tanstack/router-plugin`; the dev server / build regenerates it. No manual edit needed if the project uses the auto-generated tree. If the project uses a manual `router.ts`, add the new route to its `addChildren` list — verify by reading the file before this step.

- [ ] **Step 1: Create the route file**

Create `apps/frontend/src/app/router/routes/_app.grading-history.tsx`:

```tsx
import { createRoute } from '@tanstack/react-router';

import { GradingHistoryPage } from '@/pages/grading-history';

import { appLayoutRoute } from './_app.js';

/**
 * Authenticated `/grading-history` route. Mounts under the existing `_app`
 * layout (so the session check + sidebar shell are inherited).
 */
export const gradingHistoryRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/grading-history',
  component: GradingHistoryPage,
});

export const Route = gradingHistoryRoute;
```

- [ ] **Step 2: If the route tree is manually composed, register the new route**

Search for `addChildren` in `apps/frontend/src/app/router/`:

```
pnpm --filter frontend exec grep -rn "addChildren" src/app/router
```

If a match exists (e.g. `src/app/router/router.ts` or similar), import `gradingHistoryRoute` from `./routes/_app.grading-history.js` and add it to the list passed to `appLayoutRoute.addChildren([...])`. If no manual route tree exists, the file-based router picks the new file up automatically.

- [ ] **Step 3: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```
git add apps/frontend/src/app/router/routes/_app.grading-history.tsx apps/frontend/src/app/router
git commit -m "feat(frontend): _app.grading-history route — mounts GradingHistoryPage under the authenticated shell"
```

---

### Task 8: Sidebar entry — "Grading history"

**Files:**

- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`

- [ ] **Step 1: Add the NAV row**

In `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`, modify the `NAV` const + the `lucide-react` import:

```tsx
import {
  Award,
  Building2,
  History,
  LayoutDashboard,
  LogOut,
  UserRound,
  Users,
} from 'lucide-react';
```

And update the NAV array (append after `profile`):

```tsx
const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' as const },
  { to: '/profile', icon: UserRound, labelKey: 'nav.profile' as const },
  { to: '/grading-history', icon: Award, labelKey: 'nav.gradingHistory' as const },
] as const;
```

- [ ] **Step 2: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS. The `labelKey: 'nav.gradingHistory'` cast is a string-literal type; the typecheck only succeeds if the i18n key exists (it will after Task 11 adds it). If `typecheck` fails because of the missing key, defer this commit until after Task 11; otherwise commit now.

- [ ] **Step 3: Commit**

```
git add apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx
git commit -m "feat(frontend): sidebar — Grading history entry visible to every authenticated user"
```

---

### Task 9: Admin variant — fourth "Grading history" tab on `<UserForm>`

**Files:**

- Modify: `apps/frontend/src/features/user-form/ui/UserForm.tsx`
- Modify: `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`

- [ ] **Step 1: Modify `<UserForm>` to render a fourth tab**

In `apps/frontend/src/features/user-form/ui/UserForm.tsx`:

1. Update the component docstring at the top to mention the new tab:

```tsx
/**
 * Edit form for a user. Four tabs: Details (name + role), Memberships,
 * Profile (read-only view of the user's self-service profile), and
 * Grading history (timeline + admin-side Add/Edit/Verify/Unverify). Email is
 * read-only — better-auth owns it. The role select is disabled when an admin
 * edits their own row (the backend also rejects self-demotion).
 *
 * The Grading history tab reuses the `features/grading-timeline` and
 * `features/rank-history-form` slices bound to `user.id` (not `currentUserId`);
 * verify/unverify is gated server-side by the recorder ≠ verifier rule, so
 * sysadmins cannot verify rows they recorded themselves.
 */
```

2. Add the new imports near the existing imports:

```tsx
import { useQuery } from '@tanstack/react-query';
// existing imports...

import { listBeltRanksQueryOptions, type BeltRank } from '@/entities/belt-rank';
import { listBeltSystemsQueryOptions } from '@/entities/belt-system';
import {
  gradingHistoryQueryOptions,
  useUnverifyRankHistory,
  useVerifyRankHistory,
  type GradingHistoryRow,
} from '@/entities/rank-history';
import { listShogoTitlesQueryOptions, type ShogoTitle } from '@/entities/shogo-title';

import { GradingTimeline } from '@/features/grading-timeline';
import { RankHistoryFormDialog } from '@/features/rank-history-form';

import { FeatureFlag, useFeatureFlag } from '@/shared/lib/feature-flags';
```

3. Inside `UserForm`, add the queries + the new dialog state immediately after the existing `profileQuery` block:

```tsx
  const historyQuery = useQuery(gradingHistoryQueryOptions(user.id));
  const ranksQueryGH = useQuery(listBeltRanksQueryOptions());
  const systemsQueryGH = useQuery(listBeltSystemsQueryOptions());
  const shogoQueryGH = useQuery(listShogoTitlesQueryOptions());

  const verifyMutation = useVerifyRankHistory();
  const unverifyMutation = useUnverifyRankHistory();

  const [historyDialog, setHistoryDialog] = React.useState<
    { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; entry: GradingHistoryRow }
  >({ kind: 'closed' });
  const gradingHistoryEnabled = useFeatureFlag('grading-history');

  const rankMap = React.useMemo(() => {
    const m = new Map<string, BeltRank>();
    for (const r of ranksQueryGH.data ?? []) m.set(r.id, r);
    return m;
  }, [ranksQueryGH.data]);
  const systemCodeMap = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of systemsQueryGH.data ?? []) m.set(s.id, s.code);
    return m;
  }, [systemsQueryGH.data]);
  const shogoTitleMap = React.useMemo(() => {
    const m = new Map<string, ShogoTitle>();
    for (const s of shogoQueryGH.data ?? []) m.set(s.code, s);
    return m;
  }, [shogoQueryGH.data]);
```

4. Add a fourth `<TabsTrigger>` inside the `<TabsList>`:

```tsx
        <TabsTrigger value="grading-history">
          {t('gradingHistory.title', { defaultValue: 'Grading history' })}
        </TabsTrigger>
```

5. Add the matching `<TabsContent>` block immediately AFTER the existing `value="profile"` content:

```tsx
      <TabsContent value="grading-history" className="space-y-3">
        <div className="flex items-end justify-between">
          <p className="text-sm text-on-surface-variant">
            {t('gradingHistory.adminDescription', {
              defaultValue: 'Grading history recorded for this user.',
            })}
          </p>
          <FeatureFlag code="grading-history">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryDialog({ kind: 'create' })}
            >
              {t('gradingHistory.addPastGrading', { defaultValue: 'Add past grading' })}
            </Button>
          </FeatureFlag>
        </div>

        {historyQuery.isPending ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : historyQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {historyQuery.error instanceof Error
              ? historyQuery.error.message
              : t('common.unknownError')}
          </p>
        ) : (
          <GradingTimeline
            entries={historyQuery.data?.data ?? []}
            rankMap={rankMap}
            systemCodeMap={systemCodeMap}
            shogoTitleMap={shogoTitleMap}
            onEdit={(entry) => setHistoryDialog({ kind: 'edit', entry })}
            onVerify={(id) => verifyMutation.mutate({ id, subjectUserId: user.id })}
            onUnverify={(id) => unverifyMutation.mutate({ id, subjectUserId: user.id })}
          />
        )}

        {gradingHistoryEnabled && historyDialog.kind !== 'closed' ? (
          <RankHistoryFormDialog
            mode={historyDialog.kind}
            open
            onOpenChange={(o) => {
              if (!o) setHistoryDialog({ kind: 'closed' });
            }}
            subjectUserId={user.id}
            entry={historyDialog.kind === 'edit' ? historyDialog.entry : undefined}
          />
        ) : null}
      </TabsContent>
```

- [ ] **Step 2: Extend the UserForm test**

In `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`:

1. Add a new `vi.mock` block for the rank-history entity API (alongside the existing organisation/membership/profile mocks):

```tsx
vi.mock('@/entities/rank-history/api/rank-history.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/rank-history/api/rank-history.api.js')>();
  return {
    ...actual,
    getGradingHistory: vi.fn().mockResolvedValue({
      data: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          source: 'external',
          userId: '11111111-1111-4111-8111-111111111111',
          rankId: 'rank-shodan',
          shogoTitle: null,
          date: '2024-09-01',
          result: 'pass',
          notes: 'admin tab entry',
          examiner: 'Sensei Tanaka',
          organisationName: 'Kobe Dojo',
          verified: false,
          verifiedBy: null,
          verifiedAt: null,
          canVerify: true,
          canEdit: true,
          updatedAt: null,
          updatedByUserId: null,
        },
      ],
    }),
  };
});

vi.mock('@/entities/belt-rank/api/belt-rank.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-rank/api/belt-rank.api.js')>();
  return {
    ...actual,
    getBeltRanks: vi.fn().mockResolvedValue([
      {
        id: 'rank-shodan',
        organisationId: null,
        systemId: 'sys-dan',
        level: 1,
        sortOrder: 100,
        nameJa: '初段',
        nameRomaji: 'Shodan',
        nameEn: '1st Dan',
        nameSv: '1 Dan',
        nameFi: '1. Dan',
        beltColor: '#000000',
        imageUrl: null,
        descriptionEn: null,
        descriptionSv: null,
        descriptionFi: null,
        publiclyVisible: false,
        slug: null,
        minAge: null,
        nextRankId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
  };
});

vi.mock('@/entities/belt-system/api/belt-system.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/belt-system/api/belt-system.api.js')>();
  return {
    ...actual,
    getBeltSystems: vi.fn().mockResolvedValue([
      {
        id: 'sys-dan',
        code: 'dan',
        nameEn: 'Dan',
        nameSv: 'Dan',
        nameFi: 'Dan',
        organisationId: null,
        sortOrder: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
  };
});

vi.mock('@/entities/shogo-title/api/shogo-title.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/shogo-title/api/shogo-title.api.js')>();
  return {
    ...actual,
    getShogoTitles: vi.fn().mockResolvedValue([]),
  };
});
```

2. Add a new test case at the bottom of the `describe('<UserForm>', ...)` block:

```tsx
  it('renders the Grading history tab with timeline entries', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('tab', { name: /grading history/i }));
    expect(await screen.findByText('admin tab entry')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Steiger override is already in place**

The existing `apps/frontend/steiger.config.js` block already exempts `src/features/user-form/**/*.test.{ts,tsx}` from `fsd/no-public-api-sidestep`. No config change required.

- [ ] **Step 4: Run the UserForm test — expect PASS**

```
pnpm --filter frontend exec vitest run src/features/user-form/ui/UserForm.test.tsx
```

Expected: PASS — all previously-passing tests plus the new "renders the Grading history tab" case pass.

- [ ] **Step 5: Typecheck + arch**

```
pnpm --filter frontend typecheck
pnpm --filter frontend arch
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/features/user-form/ui/UserForm.tsx apps/frontend/src/features/user-form/ui/UserForm.test.tsx
git commit -m "feat(frontend): UserForm — Grading history tab (admin variant of pages/grading-history)"
```

---

### Task 10: i18n — English keys

**Files:**

- Modify: `apps/frontend/src/i18n/locales/en.json`

- [ ] **Step 1: Add the `gradingHistory.*` subtree + the `nav.gradingHistory` key**

In `apps/frontend/src/i18n/locales/en.json`:

1. Inside the existing `"nav"` object, add the new entry (keep alphabetic order):

```json
    "gradingHistory": "Grading history",
```

2. Add a new top-level `"gradingHistory"` block immediately after the existing `"profile"` block:

```json
  "gradingHistory": {
    "title": "Grading history",
    "description": "Every grading you have recorded or that has been mirrored from an event. Add past gradings to keep the picture complete.",
    "adminDescription": "Grading history recorded for this user.",
    "addPastGrading": "Add past grading",
    "clubCard": {
      "heading": "Club"
    },
    "timeline": {
      "noEntriesYet": "No entries yet.",
      "failed": "Failed",
      "external": "External",
      "pendingVerification": "Pending verification",
      "verifiedBy": "verified by {{name}} on {{date}}",
      "verifiedFallback": "Verified",
      "edit": "Edit",
      "verify": "Verify",
      "unverify": "Unverify"
    },
    "form": {
      "createTitle": "Add past grading",
      "editTitle": "Edit past grading",
      "rank": "Rank",
      "rankPlaceholder": "Select a rank…",
      "shogoTitle": "Shogo title (optional)",
      "shogoNone": "None",
      "date": "Date",
      "examinerName": "Examiner",
      "organisationName": "Organisation",
      "notes": "Notes",
      "clearsVerification": "Saving will clear the verification by {{name}} on {{date}}."
    }
  },
```

- [ ] **Step 2: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS — `t()` keys used in tasks 3-9 now exist; the sidebar `labelKey: 'nav.gradingHistory'` literal type narrows correctly.

- [ ] **Step 3: Commit**

```
git add apps/frontend/src/i18n/locales/en.json
git commit -m "feat(frontend): i18n — gradingHistory.* subtree + nav.gradingHistory (en)"
```

---

### Task 11: i18n — Swedish keys

**Files:**

- Modify: `apps/frontend/src/i18n/locales/sv.json`

- [ ] **Step 1: Add the matching Swedish subtree**

Mirror the English structure in `apps/frontend/src/i18n/locales/sv.json`:

1. Inside `"nav"`:

```json
    "gradingHistory": "Graderingshistorik",
```

2. Add the top-level `"gradingHistory"` block in the same position as in `en.json`:

```json
  "gradingHistory": {
    "title": "Graderingshistorik",
    "description": "Alla graderingar du har registrerat eller som har speglats från en gradering. Lägg till tidigare graderingar för att hålla bilden komplett.",
    "adminDescription": "Graderingshistorik registrerad för den här användaren.",
    "addPastGrading": "Lägg till tidigare gradering",
    "clubCard": {
      "heading": "Klubb"
    },
    "timeline": {
      "noEntriesYet": "Inga poster ännu.",
      "failed": "Underkänd",
      "external": "Extern",
      "pendingVerification": "Väntar på verifiering",
      "verifiedBy": "verifierad av {{name}} den {{date}}",
      "verifiedFallback": "Verifierad",
      "edit": "Redigera",
      "verify": "Verifiera",
      "unverify": "Avverifiera"
    },
    "form": {
      "createTitle": "Lägg till tidigare gradering",
      "editTitle": "Redigera tidigare gradering",
      "rank": "Grad",
      "rankPlaceholder": "Välj en grad…",
      "shogoTitle": "Shogo-titel (valfritt)",
      "shogoNone": "Ingen",
      "date": "Datum",
      "examinerName": "Examinator",
      "organisationName": "Organisation",
      "notes": "Anteckningar",
      "clearsVerification": "Att spara tar bort verifieringen av {{name}} från {{date}}."
    }
  },
```

- [ ] **Step 2: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```
git add apps/frontend/src/i18n/locales/sv.json
git commit -m "feat(frontend): i18n — gradingHistory.* subtree + nav.gradingHistory (sv)"
```

---

### Task 12: i18n — Finnish keys

**Files:**

- Modify: `apps/frontend/src/i18n/locales/fi.json`

- [ ] **Step 1: Add the matching Finnish subtree**

Mirror the English structure in `apps/frontend/src/i18n/locales/fi.json`:

1. Inside `"nav"`:

```json
    "gradingHistory": "Vyökoehistoria",
```

2. Add the top-level `"gradingHistory"` block in the same position as in `en.json`:

```json
  "gradingHistory": {
    "title": "Vyökoehistoria",
    "description": "Kaikki vyökokeesi: omat lisäykset ja tapahtumista peilatut. Lisää aikaisempia vyökokeita pitääksesi tiedot ajan tasalla.",
    "adminDescription": "Tälle käyttäjälle kirjattu vyökoehistoria.",
    "addPastGrading": "Lisää aikaisempi vyökoe",
    "clubCard": {
      "heading": "Seura"
    },
    "timeline": {
      "noEntriesYet": "Ei merkintöjä vielä.",
      "failed": "Hylätty",
      "external": "Ulkoinen",
      "pendingVerification": "Odottaa varmistusta",
      "verifiedBy": "varmentanut {{name}} {{date}}",
      "verifiedFallback": "Varmistettu",
      "edit": "Muokkaa",
      "verify": "Varmista",
      "unverify": "Peruuta varmistus"
    },
    "form": {
      "createTitle": "Lisää aikaisempi vyökoe",
      "editTitle": "Muokkaa aikaisempaa vyökoetta",
      "rank": "Aste",
      "rankPlaceholder": "Valitse aste…",
      "shogoTitle": "Shogo-arvonimi (valinnainen)",
      "shogoNone": "Ei mitään",
      "date": "Päivämäärä",
      "examinerName": "Tutkija",
      "organisationName": "Organisaatio",
      "notes": "Muistiinpanot",
      "clearsVerification": "Tallentaminen poistaa varmistuksen, jonka {{name}} teki {{date}}."
    }
  },
```

- [ ] **Step 2: Typecheck**

```
pnpm --filter frontend typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```
git add apps/frontend/src/i18n/locales/fi.json
git commit -m "feat(frontend): i18n — gradingHistory.* subtree + nav.gradingHistory (fi)"
```

---

### Task 13: Final pipeline — turbo typecheck + lint + arch + test + build

**Files:** none

- [ ] **Step 1: Run the full pipeline**

```
pnpm turbo run typecheck lint arch test build --filter=frontend
```

Expected: all 5 tasks PASS. If `pnpm --filter frontend typecheck` hangs on Windows, fall back to `cd apps/frontend && npx tsc --noEmit`; do the same for `arch` (`npx steiger ./src`) and `test` (`npx vitest run`). The `build` step must succeed (Vite generates `dist/`).

- [ ] **Step 2: Spot-check the contracts package is still green**

```
pnpm --filter @repo/contracts build
pnpm --filter @repo/contracts test
```

Expected: both PASS — this plan does not touch the contracts package, but a stale build can ghost-fail the frontend typecheck if the `dist/` artefacts drift.

- [ ] **Step 3: Manual verification checklist**

Boot the dev stack (`pnpm dev` from the repo root). Walk through:

1. Sign in as a non-admin user. The sidebar shows a new "Grading history" entry below "My profile". Click it; the page renders with:
   - Header "Grading history" + description.
   - Empty timeline ("No entries yet.") on the left.
   - `<ClubCard>` on the right showing the user's primary club + parent federation (if the user has a club membership; otherwise the aside is empty).
   - No "Add past grading" button (the `grading-history` flag defaults off).
2. Set `VITE_FEATURE_FLAGS={"grading-history":true,"grading-history-verification":true}` in `.env` and restart the dev server.
3. Reload the page; "Add past grading" appears. Click it; the modal opens.
4. Pick a rank, enter today's date, type an examiner name, click Save. The dialog closes, the timeline now shows one row with `EXTERNAL` + `Pending verification` badges.
5. Sign out, sign in as a sysadmin. Navigate to `/admin/users`, open the same user. The fourth tab "Grading history" shows the row.
6. Click Verify. The row re-renders with a green `ShieldCheck` shield; `Pending verification` is gone. The Verify button becomes Unverify.
7. Click Edit, change only the notes, save. The amber warning does NOT appear (notes is not a verification-content field). The row stays verified.
8. Click Edit again, change the date, save. The amber warning appears beforehand: "Saving will clear the verification by Admin on 2026-05-25."
9. After save, the row is back to `Pending verification`.
10. If the entry carried a shogo title, switch back to the user's Profile tab; once D4 (`user_profile.shogo_title`) lands the synced shogo will show. Until then the profile shogo field is absent, which is expected — Plan C doesn't ship the profile-side change.

Document any deviations as TODO comments in the relevant task and commit a follow-up.

- [ ] **Step 4: Final commit (only if any docs touched during the walkthrough)**

```
git status
# only commit if there are intentional doc updates
```

---

## Cross-cutting notes

### Type / name consistency

- The contract type names used throughout this plan are: `RankHistory`, `CreateRankHistoryInput`, `UpdateRankHistoryInput`, `GradingHistoryRow`, `GradingHistoryResponse`, `RankHistoryResult`, `RankHistorySource` — all exported from `@repo/contracts/rank-history`.
- Route helpers used: `RankHistoryRoutes.unifiedForUser`, `.byUser`, `.byId`, `.verify`, `.unverify` — all already in `packages/contracts/src/routes.ts`.
- Plan B types reused: `BeltRank`, `BeltSystem`, `ShogoTitle` from the respective entity barrels; `BeltColor`, `BeltVisuals` from `@/shared/lib/belt-visuals`; `BeltGraphicProps` from `@/shared/ui/belt-graphic`; `Lang`, `rankLabel` from `@/shared/lib/rank-label`.
- Hook variable shapes are stable across tasks: `useCreateRankHistory` takes `{ subjectUserId, input }`, `useUpdateRankHistory` takes `{ id, subjectUserId, input }`, the delete/verify/unverify hooks take `{ id, subjectUserId }`. The `subjectUserId` field powers cache invalidation in every case.

### Out of scope

- `<FeedbackThread>` / the `instructor-feedback` flag — not built on the taidohub side.
- `<TimeInGradeCard>`, `<NextRankCard>`, `<TrainingStatsGrid>` — depend on backend signals (`grading_events`, `requirements`, `sessions`) that taidohub doesn't have yet. Spec §6 right-rail layout is intentionally pared back to a single `<ClubCard>` for v1.
- A dedicated admin route `/admin/users/:id/grading-history` — the spec mentions it as a possible sibling, but the followup D7 sketch settled on the fourth tab on `<UserForm>` for cohesion with existing admin user editing. The tab covers the use case; a standalone admin route can land later if a "full-page" view is needed.
- Profile-side shogo display — depends on followup D4 (`user_profile.shogo_title` column). The shogo recompute path in the backend service is a no-op until then; the timeline still renders the shogo chip on individual rows.

### Filter names

Every `pnpm --filter` command in this plan uses one of:

- `frontend` for the React/Vite app at `apps/frontend/`.
- `backend` for the NestJS app at `apps/backend/`.
- `@repo/contracts` for the contracts package at `packages/contracts/`.

The plan does NOT touch the backend or the contracts package — they are assumed live from Plan A.
