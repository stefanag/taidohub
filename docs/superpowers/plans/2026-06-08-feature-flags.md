# Feature-Flag Service (D5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land a DB-backed backend feature-flag service that gates rank-history write endpoints, a sysadmin admin UI for live toggling, and switches the frontend from build-time `VITE_FEATURE_FLAGS` to a runtime `GET /api/feature-flags` fetch — single source of truth, no redeploy needed to flip a flag.

**Architecture:** One Postgres table (`feature_flag`) seeded with the three current flag codes. A `FeatureFlagsService` does per-request DB reads (no cache in Phase A — table is tiny, lookup is sub-millisecond). A globally-registered `FeatureFlagGuard` keyed on a `@RequireFeatureFlag('code')` decorator returns 404 when the flag is off. Public `GET /api/feature-flags` feeds the SPA; admin `GET/PATCH /api/admin/feature-flags*` (sysadmin only) drives the toggle UI and writes audit-log entries. Frontend provider switches to a Suspense-backed React Query fetch.

**Tech Stack:** Zod 4 (`@repo/contracts`), Drizzle ORM 0.45 + Postgres 15, NestJS 11 + CASL 6, React 19 + TanStack Router/Query + Vite, Vitest + Testing Library.

**Spec:** [`docs/superpowers/specs/2026-06-08-feature-flags-design.md`](../specs/2026-06-08-feature-flags-design.md)

**Windows env notes:**
- Use direct `cd apps/X && npx tsc --noEmit` instead of `pnpm --filter X typecheck` (latter hangs intermittently on this machine).
- Tests via `pnpm --filter <pkg> exec vitest run [path]` are reliable.

---

### Task 1: Contracts — feature-flags registry + schemas + CASL subject

**Files:**
- Create: `packages/contracts/src/feature-flags.ts`
- Create: `packages/contracts/src/__tests__/feature-flags.test.ts`
- Modify: `packages/contracts/src/casl.ts` (add `'FeatureFlag'` subject + shape)
- Modify: `packages/contracts/src/index.ts` (barrel)
- Modify: `packages/contracts/src/openapi.ts` (register registry)
- Modify: `packages/contracts/package.json` (subpath export)
- Modify: `packages/contracts/tsup.config.ts` (entry)

- [ ] **Step 1: Write the failing tests**

Create `packages/contracts/src/__tests__/feature-flags.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FLAGS,
  FEATURE_FLAG_CODES,
  FeatureFlagCodeSchema,
  FeatureFlagMapSchema,
  FeatureFlagSchema,
  UpdateFeatureFlagSchema,
} from '../feature-flags.js';

describe('FEATURE_FLAG_CODES', () => {
  it('exposes the three current codes', () => {
    expect(FEATURE_FLAG_CODES).toEqual([
      'grading-history',
      'grading-history-verification',
      'instructor-feedback',
    ]);
  });
});

describe('FeatureFlagCodeSchema', () => {
  it('accepts each known code', () => {
    for (const code of FEATURE_FLAG_CODES) {
      expect(FeatureFlagCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects unknown codes', () => {
    expect(FeatureFlagCodeSchema.safeParse('not-a-flag').success).toBe(false);
  });
});

describe('DEFAULT_FLAGS', () => {
  it('is an all-false map keyed by every known code', () => {
    expect(Object.keys(DEFAULT_FLAGS).sort()).toEqual([...FEATURE_FLAG_CODES].sort());
    for (const value of Object.values(DEFAULT_FLAGS)) {
      expect(value).toBe(false);
    }
  });
});

describe('FeatureFlagMapSchema', () => {
  it('accepts a fully-populated map', () => {
    const value = Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, true]));
    expect(FeatureFlagMapSchema.safeParse(value).success).toBe(true);
  });

  it('rejects when a known code is missing', () => {
    const value = Object.fromEntries(FEATURE_FLAG_CODES.slice(1).map((code) => [code, false]));
    expect(FeatureFlagMapSchema.safeParse(value).success).toBe(false);
  });

  it('rejects non-boolean values', () => {
    const value = Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, 'on']));
    expect(FeatureFlagMapSchema.safeParse(value).success).toBe(false);
  });
});

describe('FeatureFlagSchema', () => {
  const BASE = {
    code: 'grading-history' as const,
    enabled: true,
    updatedAt: '2026-06-08T10:00:00.000Z',
    updatedById: 'u-1',
  };

  it('accepts a row with all fields populated', () => {
    expect(FeatureFlagSchema.safeParse(BASE).success).toBe(true);
  });

  it('accepts updatedById: null (post user delete)', () => {
    expect(FeatureFlagSchema.safeParse({ ...BASE, updatedById: null }).success).toBe(true);
  });

  it('rejects an unknown code', () => {
    expect(FeatureFlagSchema.safeParse({ ...BASE, code: 'nope' }).success).toBe(false);
  });
});

describe('UpdateFeatureFlagSchema', () => {
  it('accepts { enabled: true }', () => {
    expect(UpdateFeatureFlagSchema.safeParse({ enabled: true }).success).toBe(true);
  });

  it('accepts { enabled: false }', () => {
    expect(UpdateFeatureFlagSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(UpdateFeatureFlagSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-boolean enabled', () => {
    expect(UpdateFeatureFlagSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
pnpm --filter @repo/contracts exec vitest run src/__tests__/feature-flags.test.ts
```

Expected: FAIL — `../feature-flags.js` doesn't exist.

- [ ] **Step 3: Create `packages/contracts/src/feature-flags.ts`**

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
  .meta({
    id: 'FeatureFlag',
    description: 'A row from the feature_flag table, used by the sysadmin admin endpoint.',
    example: {
      code: 'grading-history',
      enabled: false,
      updatedAt: '2026-06-08T10:00:00.000Z',
      updatedById: 'u-1',
    },
  });

export const UpdateFeatureFlagSchema = z
  .object({ enabled: z.boolean() })
  .meta({ id: 'UpdateFeatureFlagInput' });

export type FeatureFlagMap = z.infer<typeof FeatureFlagMapSchema>;
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type UpdateFeatureFlagInput = z.input<typeof UpdateFeatureFlagSchema>;

/** Registry for OpenAPI generation. */
export const FeatureFlagsOpenApiRegistry = {
  FeatureFlagMap: FeatureFlagMapSchema,
  FeatureFlag: FeatureFlagSchema,
  UpdateFeatureFlagInput: UpdateFeatureFlagSchema,
};
```

- [ ] **Step 4: Add `'FeatureFlag'` to CASL subject enum**

Open `packages/contracts/src/casl.ts`. Find the enum `SubjectSchema = z.enum([...])` (or equivalent). Insert `'FeatureFlag'` before `'all'` so the wildcard stays last:

```ts
export const SubjectSchema = z.enum([
  // … existing subjects …
  'Tag',
  'Category',
  'TagAttachment',
  'CategoryAttachment',
  'FeatureFlag',
  'all',
]);
```

The file also has typed subject shapes (`TagSubjectShape`, etc.). Add `FeatureFlagSubjectShape`:

```ts
export interface FeatureFlagSubjectShape {
  __caslSubjectType__: 'FeatureFlag';
  code: string;
}
```

And add it to the `AppSubject` union (same pattern as the other shapes).

- [ ] **Step 5: Update the package barrel + subpath export + tsup entry**

Append to `packages/contracts/src/index.ts`:

```ts
export * from './feature-flags.js';
```

In `packages/contracts/tsup.config.ts`, add `'feature-flags': 'src/feature-flags.ts',` to the `entry` object (alphabetical, after `labels` if present).

In `packages/contracts/package.json`, add the `./feature-flags` entry under `exports`. Mirror the shape of `./labels`:

```jsonc
"./feature-flags": {
  "import": {
    "types": "./dist/feature-flags.d.ts",
    "default": "./dist/feature-flags.js"
  },
  "require": {
    "types": "./dist/feature-flags.d.cts",
    "default": "./dist/feature-flags.cjs"
  }
}
```

- [ ] **Step 6: Register the OpenAPI block**

Open `packages/contracts/src/openapi.ts`. Find the imports + the `ContractRegistries` object. Add:

```ts
import { FeatureFlagsOpenApiRegistry } from './feature-flags.js';
```

And to the registries dict:

```ts
export const ContractRegistries = {
  // … existing entries …
  featureFlags: FeatureFlagsOpenApiRegistry,
};
```

Also add `FeatureFlagsOpenApiRegistry` to whatever default-export array `openapi.ts` uses to register schemas with the generator.

- [ ] **Step 7: Build + re-run tests + typecheck**

```
pnpm --filter @repo/contracts build
pnpm --filter @repo/contracts exec vitest run
cd packages/contracts && npx tsc --noEmit
```

Expected: build clean, all contracts tests green, tsc exit 0.

- [ ] **Step 8: Commit**

```
git add packages/contracts/
git commit -m "feat(contracts): feature-flag registry + schemas + CASL subject"
```

---

### Task 2: DB — `feature_flag` table + migration 0014 + seed

**Files:**
- Create: `apps/backend/src/infrastructure/database/schema/feature-flag.ts`
- Modify: `apps/backend/src/infrastructure/database/schema/index.ts`
- Generated: `apps/backend/drizzle/0014_<adjective_noun>.sql` (then hand-appended with seed INSERTs)
- Generated: `apps/backend/drizzle/meta/0014_snapshot.json`
- Modified: `apps/backend/drizzle/meta/_journal.json`

- [ ] **Step 1: Create the Drizzle schema**

```ts
// apps/backend/src/infrastructure/database/schema/feature-flag.ts
import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './users.js'; // adapt to the actual export — user (singular)

export const featureFlag = pgTable('feature_flag', {
  code: text('code').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedById: text('updated_by_id').references(() => user.id, {
    onDelete: 'set null',
  }),
});

export type DbFeatureFlag = typeof featureFlag.$inferSelect;
export type DbNewFeatureFlag = typeof featureFlag.$inferInsert;
```

- [ ] **Step 2: Add to schema barrel**

Append to `apps/backend/src/infrastructure/database/schema/index.ts`:

```ts
export * from './feature-flag.js';
```

- [ ] **Step 3: Generate the migration**

```
pnpm --filter backend exec drizzle-kit generate
```

Drizzle-kit will produce `apps/backend/drizzle/0014_<adjective_noun>.sql` with a single `CREATE TABLE "feature_flag" (...)` + FK constraint. Inspect:

```
cat apps/backend/drizzle/0014_*.sql
```

Expected: only `CREATE TABLE "feature_flag"` + `ALTER TABLE "feature_flag" ADD CONSTRAINT … REFERENCES "user"…`. No drops, no other tables touched.

- [ ] **Step 4: Append seed INSERTs to the generated SQL**

Drizzle-kit doesn't generate seed rows. We hand-append the three seed inserts to the bottom of the same migration file so the seed is atomic with the schema add. Edit `apps/backend/drizzle/0014_*.sql` and append:

```sql
-- Seed: register each currently-known feature flag code with enabled=false.
-- Adding a new code = bump packages/contracts/src/feature-flags.ts, write a
-- new migration that INSERTs the row with ON CONFLICT DO NOTHING.
INSERT INTO "feature_flag" ("code") VALUES
  ('grading-history'),
  ('grading-history-verification'),
  ('instructor-feedback');
```

(The `enabled`, `updated_at`, `updated_by_id` columns use their defaults.)

- [ ] **Step 5: Direct typecheck**

```
cd apps/backend && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/infrastructure/database/schema/feature-flag.ts apps/backend/src/infrastructure/database/schema/index.ts apps/backend/drizzle/0014_*.sql apps/backend/drizzle/meta/0014_snapshot.json apps/backend/drizzle/meta/_journal.json
git commit -m "feat(db): feature_flag table + migration 0014 + seed for 3 codes"
```

---

### Task 3: Backend — `FeatureFlagsRepository` + `FeatureFlagsService` + spec

**Files:**
- Create: `apps/backend/src/modules/feature-flags/feature-flags.repository.ts`
- Create: `apps/backend/src/modules/feature-flags/feature-flags.service.ts`
- Create: `apps/backend/src/modules/feature-flags/feature-flags.service.spec.ts`

- [ ] **Step 1: Read first**

Before writing, confirm:
- The DB injection token + type from `apps/backend/src/infrastructure/database/client.js` (per the labels series notes, it's the `DRIZZLE` Symbol + `DrizzleDb` type — not `DATABASE_CONNECTION`).
- Sibling modules use relative imports (no `@/` alias).
- The `AuthenticatedUser` type from `apps/backend/src/infrastructure/auth/auth.types.ts`.

- [ ] **Step 2: Create `feature-flags.repository.ts`**

```ts
import { eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';

import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { featureFlag } from '../../infrastructure/database/schema/feature-flag.js';
import type { FeatureFlagCode } from '@repo/contracts/feature-flags';

export type FeatureFlagRow = typeof featureFlag.$inferSelect;

@Injectable()
export class FeatureFlagsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async list(): Promise<FeatureFlagRow[]> {
    return this.db.select().from(featureFlag);
  }

  async findByCode(code: FeatureFlagCode): Promise<FeatureFlagRow | undefined> {
    const rows = await this.db.select().from(featureFlag).where(eq(featureFlag.code, code)).limit(1);
    return rows[0];
  }

  async updateEnabled(
    code: FeatureFlagCode,
    enabled: boolean,
    updatedByUserId: string,
  ): Promise<FeatureFlagRow> {
    const [row] = await this.db
      .update(featureFlag)
      .set({ enabled, updatedAt: new Date(), updatedById: updatedByUserId })
      .where(eq(featureFlag.code, code))
      .returning();
    if (!row) throw new Error(`Feature flag row vanished mid-update: ${code}`);
    return row;
  }
}
```

- [ ] **Step 3: Create `feature-flags.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';

import {
  DEFAULT_FLAGS,
  FEATURE_FLAG_CODES,
  type FeatureFlagCode,
  type FeatureFlagMap,
} from '@repo/contracts/feature-flags';

import { FeatureFlagsRepository, type FeatureFlagRow } from './feature-flags.repository.js';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly repo: FeatureFlagsRepository) {}

  /** Returns the resolved map. Unknown rows in DB are dropped (forward-compat). */
  async resolveMap(): Promise<FeatureFlagMap> {
    const rows = await this.repo.list();
    const map = { ...DEFAULT_FLAGS };
    for (const row of rows) {
      if ((FEATURE_FLAG_CODES as readonly string[]).includes(row.code)) {
        map[row.code as FeatureFlagCode] = row.enabled;
      }
    }
    return map;
  }

  /** Single-flag lookup used by the guard. */
  async isEnabled(code: FeatureFlagCode): Promise<boolean> {
    const row = await this.repo.findByCode(code);
    return row?.enabled ?? false;
  }

  /** Returns every row (full shape) for the sysadmin admin endpoint. */
  async listRows(): Promise<FeatureFlagRow[]> {
    return this.repo.list();
  }

  /** Sysadmin-only mutation; throws 404 if the code isn't seeded. */
  async setEnabled(
    code: FeatureFlagCode,
    enabled: boolean,
    actingUserId: string,
  ): Promise<FeatureFlagRow> {
    const existing = await this.repo.findByCode(code);
    if (!existing) throw new NotFoundException(`Unknown feature flag: ${code}`);
    return this.repo.updateEnabled(code, enabled, actingUserId);
  }
}
```

- [ ] **Step 4: Write `feature-flags.service.spec.ts`**

```ts
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FeatureFlagsRepository,
  type FeatureFlagRow,
} from './feature-flags.repository.js';
import { FeatureFlagsService } from './feature-flags.service.js';

function row(overrides: Partial<FeatureFlagRow> = {}): FeatureFlagRow {
  return {
    code: 'grading-history',
    enabled: false,
    updatedAt: new Date(),
    updatedById: null,
    ...overrides,
  } as FeatureFlagRow;
}

describe('FeatureFlagsService', () => {
  let repo: { [K in keyof FeatureFlagsRepository]: ReturnType<typeof vi.fn> };
  let service: FeatureFlagsService;

  beforeEach(() => {
    repo = {
      list: vi.fn(),
      findByCode: vi.fn(),
      updateEnabled: vi.fn(),
    };
    service = new FeatureFlagsService(repo as unknown as FeatureFlagsRepository);
  });

  describe('resolveMap', () => {
    it('returns the DEFAULT_FLAGS shape when the DB is empty', async () => {
      repo.list.mockResolvedValue([]);
      const map = await service.resolveMap();
      expect(map).toEqual({
        'grading-history': false,
        'grading-history-verification': false,
        'instructor-feedback': false,
      });
    });

    it('overrides known codes from DB rows', async () => {
      repo.list.mockResolvedValue([
        row({ code: 'grading-history', enabled: true }),
        row({ code: 'grading-history-verification', enabled: false }),
      ]);
      const map = await service.resolveMap();
      expect(map['grading-history']).toBe(true);
      expect(map['grading-history-verification']).toBe(false);
      expect(map['instructor-feedback']).toBe(false);
    });

    it('ignores DB rows for unknown codes (forward-compat)', async () => {
      repo.list.mockResolvedValue([row({ code: 'unknown-future-flag', enabled: true })]);
      const map = await service.resolveMap();
      expect(Object.keys(map).sort()).toEqual([
        'grading-history',
        'grading-history-verification',
        'instructor-feedback',
      ]);
    });
  });

  describe('isEnabled', () => {
    it('returns true when the row is enabled', async () => {
      repo.findByCode.mockResolvedValue(row({ enabled: true }));
      expect(await service.isEnabled('grading-history')).toBe(true);
    });

    it('returns false when the row is disabled', async () => {
      repo.findByCode.mockResolvedValue(row({ enabled: false }));
      expect(await service.isEnabled('grading-history')).toBe(false);
    });

    it('returns false when the row is missing (treat unknown as off)', async () => {
      repo.findByCode.mockResolvedValue(undefined);
      expect(await service.isEnabled('grading-history')).toBe(false);
    });
  });

  describe('setEnabled', () => {
    it('updates an existing flag', async () => {
      repo.findByCode.mockResolvedValue(row());
      repo.updateEnabled.mockResolvedValue(row({ enabled: true, updatedById: 'u-1' }));
      const out = await service.setEnabled('grading-history', true, 'u-1');
      expect(out.enabled).toBe(true);
      expect(repo.updateEnabled).toHaveBeenCalledWith('grading-history', true, 'u-1');
    });

    it('throws NotFound when the code is not seeded', async () => {
      repo.findByCode.mockResolvedValue(undefined);
      await expect(
        service.setEnabled('grading-history', true, 'u-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
```

- [ ] **Step 5: Run + typecheck**

```
pnpm --filter backend exec vitest run src/modules/feature-flags/feature-flags.service.spec.ts
cd apps/backend && npx tsc --noEmit
```

Expected: all green, tsc exit 0.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/modules/feature-flags/feature-flags.repository.ts apps/backend/src/modules/feature-flags/feature-flags.service.ts apps/backend/src/modules/feature-flags/feature-flags.service.spec.ts
git commit -m "feat(feature-flags): repository + service + spec"
```

---

### Task 4: Backend — `@RequireFeatureFlag` decorator + `FeatureFlagGuard` + spec

**Files:**
- Create: `apps/backend/src/modules/feature-flags/require-feature-flag.decorator.ts`
- Create: `apps/backend/src/modules/feature-flags/feature-flag.guard.ts`
- Create: `apps/backend/src/modules/feature-flags/feature-flag.guard.spec.ts`

- [ ] **Step 1: Create the decorator**

```ts
// apps/backend/src/modules/feature-flags/require-feature-flag.decorator.ts
import { SetMetadata } from '@nestjs/common';

import type { FeatureFlagCode } from '@repo/contracts/feature-flags';

export const FEATURE_FLAG_KEY = 'feature-flag';

/**
 * Marks a route handler as gated by a feature flag. When the flag is off,
 * `FeatureFlagGuard` throws `NotFoundException` (404) — same response as a
 * route that doesn't exist, deliberately not 403, to avoid leaking roadmap.
 */
export const RequireFeatureFlag = (code: FeatureFlagCode) => SetMetadata(FEATURE_FLAG_KEY, code);
```

- [ ] **Step 2: Create the guard**

```ts
// apps/backend/src/modules/feature-flags/feature-flag.guard.ts
import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { FeatureFlagCode } from '@repo/contracts/feature-flags';

import { FeatureFlagsService } from './feature-flags.service.js';
import { FEATURE_FLAG_KEY } from './require-feature-flag.decorator.js';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const code = this.reflector.get<FeatureFlagCode | undefined>(
      FEATURE_FLAG_KEY,
      ctx.getHandler(),
    );
    if (!code) return true; // route is not gated
    const enabled = await this.flags.isEnabled(code);
    if (!enabled) throw new NotFoundException();
    return true;
  }
}
```

- [ ] **Step 3: Write the guard spec**

```ts
// apps/backend/src/modules/feature-flags/feature-flag.guard.spec.ts
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureFlagGuard } from './feature-flag.guard.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { FEATURE_FLAG_KEY } from './require-feature-flag.decorator.js';

function fakeCtx(): ExecutionContext {
  return {
    getHandler: () => (() => undefined) as unknown as () => void,
    getClass: () => class Fake {},
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}), getNext: () => undefined }),
    switchToWs: () => ({}) as ReturnType<ExecutionContext['switchToWs']>,
    switchToRpc: () => ({}) as ReturnType<ExecutionContext['switchToRpc']>,
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard', () => {
  let reflector: { get: ReturnType<typeof vi.fn> };
  let service: { isEnabled: ReturnType<typeof vi.fn> };
  let guard: FeatureFlagGuard;

  beforeEach(() => {
    reflector = { get: vi.fn() };
    service = { isEnabled: vi.fn() };
    guard = new FeatureFlagGuard(
      reflector as unknown as Reflector,
      service as unknown as FeatureFlagsService,
    );
  });

  it('passes through when the route is not gated', async () => {
    reflector.get.mockReturnValue(undefined);
    await expect(guard.canActivate(fakeCtx())).resolves.toBe(true);
    expect(service.isEnabled).not.toHaveBeenCalled();
  });

  it('reads the metadata using the FEATURE_FLAG_KEY', async () => {
    reflector.get.mockReturnValue('grading-history');
    service.isEnabled.mockResolvedValue(true);
    await guard.canActivate(fakeCtx());
    expect(reflector.get.mock.calls[0]![0]).toBe(FEATURE_FLAG_KEY);
  });

  it('returns true when the flag is on', async () => {
    reflector.get.mockReturnValue('grading-history');
    service.isEnabled.mockResolvedValue(true);
    await expect(guard.canActivate(fakeCtx())).resolves.toBe(true);
  });

  it('throws NotFoundException when the flag is off', async () => {
    reflector.get.mockReturnValue('grading-history');
    service.isEnabled.mockResolvedValue(false);
    await expect(guard.canActivate(fakeCtx())).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 4: Run + typecheck**

```
pnpm --filter backend exec vitest run src/modules/feature-flags/feature-flag.guard.spec.ts
cd apps/backend && npx tsc --noEmit
```

Expected: 4/4 green, tsc clean.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/modules/feature-flags/require-feature-flag.decorator.ts apps/backend/src/modules/feature-flags/feature-flag.guard.ts apps/backend/src/modules/feature-flags/feature-flag.guard.spec.ts
git commit -m "feat(feature-flags): RequireFeatureFlag decorator + global guard + spec"
```

---

### Task 5: Backend — Apply the guard to rank-history write endpoints

**Files:**
- Modify: `apps/backend/src/modules/rank-history/rank-history.controller.ts`
- Modify: `apps/backend/src/modules/rank-history/rank-history.controller.spec.ts` (or wherever the existing controller spec lives — find via `grep -rn "rank-history.controller"` in `apps/backend`)

- [ ] **Step 1: Add the decorator imports + annotations**

Open `rank-history.controller.ts`. Add the import:

```ts
import { RequireFeatureFlag } from '../feature-flags/require-feature-flag.decorator.js';
```

Annotate the five write endpoints. The exact method names will vary — locate by HTTP verb + path. Add `@RequireFeatureFlag(...)` ABOVE the existing decorators (CASL, ZodValidationPipe, etc.):

```ts
@Post()
@RequireFeatureFlag('grading-history')
create(@AuthUser() user, @ZodBody(...) body) { ... }

@Patch(':id')
@RequireFeatureFlag('grading-history')
update(@AuthUser() user, @Param('id') id, @ZodBody(...) body) { ... }

@Delete(':id')
@HttpCode(HttpStatus.NO_CONTENT)
@RequireFeatureFlag('grading-history')
remove(@AuthUser() user, @Param('id') id) { ... }

@Post(':id/verify')
@RequireFeatureFlag('grading-history-verification')
verify(@AuthUser() user, @Param('id') id) { ... }

@Post(':id/unverify')
@RequireFeatureFlag('grading-history-verification')
unverify(@AuthUser() user, @Param('id') id) { ... }
```

(If the controller doesn't have a `DELETE` for rank-history, drop the third decorator — only add to endpoints that exist.)

- [ ] **Step 2: Update the controller spec**

The existing spec exercises each endpoint without the new guard. We don't add new test cases for the guard's behaviour here (that's covered in Task 4); we just want existing tests to keep passing.

If the existing tests mount the controller via NestJS's `Test.createTestingModule` and the global guard is bound via `APP_GUARD` (set up in Task 6 below), the existing tests will pass without changes — the test module override path naturally skips global guards. If the tests use a different mounting strategy, they may need to provide a mock `Reflector` / mock `FeatureFlagsService`. Pattern:

```ts
const moduleRef = await Test.createTestingModule({
  controllers: [RankHistoryController],
  providers: [
    { provide: RankHistoryService, useValue: mockService },
    // … existing mocks …
  ],
}).compile();
```

If the tests start failing because of missing DI, add a `FeatureFlagsService` mock to the providers list with `isEnabled` returning `true`.

- [ ] **Step 3: Run the rank-history specs + the new feature-flags specs**

```
pnpm --filter backend exec vitest run src/modules/rank-history src/modules/feature-flags
cd apps/backend && npx tsc --noEmit
```

Expected: all green, tsc clean.

- [ ] **Step 4: Commit**

```
git add apps/backend/src/modules/rank-history/
git commit -m "feat(rank-history): gate write endpoints behind grading-history + grading-history-verification flags"
```

---

### Task 6: Backend — `FeatureFlagsController` + `FeatureFlagsModule` + ability rules + AppModule wiring

**Files:**
- Create: `apps/backend/src/modules/feature-flags/feature-flags.controller.ts`
- Create: `apps/backend/src/modules/feature-flags/feature-flags.ability-rules.ts`
- Create: `apps/backend/src/modules/feature-flags/feature-flags.ability-rules.spec.ts`
- Create: `apps/backend/src/modules/feature-flags/feature-flags.module.ts`
- Modify: `apps/backend/src/app.module.ts` (import module + register guard globally)
- Modify: `apps/backend/src/infrastructure/ability/ability.factory.ts` (inject FeatureFlagsAbilityRules)
- Modify: `apps/backend/src/infrastructure/ability/ability.module.ts` (provider list)

- [ ] **Step 1: Read first**

Look at one existing controller that has both a public and an admin endpoint (e.g. `apps/backend/src/modules/belt-catalog/public-belt-ranks.controller.ts` for the public-no-auth pattern, and `apps/backend/src/modules/organisations/organisations.controller.ts` for the admin-CASL pattern).

Look at `apps/backend/src/modules/labels/labels.ability-rules.ts` for the most recent ability-rules contributor pattern.

- [ ] **Step 2: Create the controller**

```ts
// apps/backend/src/modules/feature-flags/feature-flags.controller.ts
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../../infrastructure/auth/auth.guard.js'; // adapt name
import { AuthUser } from '../../infrastructure/auth/auth-user.decorator.js'; // adapt name
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe.js'; // adapt name
import {
  FeatureFlagCodeSchema,
  UpdateFeatureFlagSchema,
  type FeatureFlagCode,
  type UpdateFeatureFlagInput,
} from '@repo/contracts/feature-flags';

import { FeatureFlagsService } from './feature-flags.service.js';

/** Public, unauthenticated — feeds the SPA's FeatureFlagsProvider at boot. */
@Controller('feature-flags')
export class FeatureFlagsPublicController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get()
  resolveMap() {
    return this.service.resolveMap();
  }
}

/** Sysadmin-only — list every row + toggle a flag. Mounted under /api/admin. */
@UseGuards(AuthGuard)
@Controller('admin/feature-flags')
export class FeatureFlagsAdminController {
  constructor(private readonly service: FeatureFlagsService) {}

  @Get()
  listRows(@AuthUser() user: AuthenticatedUser) {
    this.assertSysadmin(user);
    return this.service.listRows();
  }

  @Patch(':code')
  async update(
    @AuthUser() user: AuthenticatedUser,
    @Param('code', new ZodValidationPipe(FeatureFlagCodeSchema)) code: FeatureFlagCode,
    @Body(new ZodValidationPipe(UpdateFeatureFlagSchema)) body: UpdateFeatureFlagInput,
  ) {
    this.assertSysadmin(user);
    return this.service.setEnabled(code, body.enabled, user.id);
  }

  private assertSysadmin(user: AuthenticatedUser): void {
    if (user.role !== 'sysadmin') {
      throw new ForbiddenException('Only sysadmins may manage feature flags.');
    }
  }
}
```

(Adapt `AuthGuard`, `AuthUser`, `ZodValidationPipe` to whatever the existing controllers actually use — check `apps/backend/src/modules/labels/labels.controller.ts` for the most recent reference.)

We do the sysadmin check inline rather than via CASL because the resource (a single flag row) doesn't carry organisation context. The CASL rules in step 4 mirror this so other modules can still ask `ability.can('manage', 'FeatureFlag')`.

- [ ] **Step 3: Hook the admin PATCH into the audit log**

Read `apps/backend/src/modules/audit-log/` to find the audit-log integration pattern (likely an `AuditLogService` injected into other modules + a `record({ subjectType, subjectId, action, before, after, userId })` method). Inject it into `FeatureFlagsService.setEnabled`:

```ts
constructor(
  private readonly repo: FeatureFlagsRepository,
  private readonly auditLog: AuditLogService, // injected
) {}

async setEnabled(code, enabled, actingUserId) {
  const existing = await this.repo.findByCode(code);
  if (!existing) throw new NotFoundException(...);
  const next = await this.repo.updateEnabled(code, enabled, actingUserId);
  await this.auditLog.record({
    subjectType: 'FeatureFlag',
    subjectId: code,
    action: 'update',
    before: { enabled: existing.enabled },
    after: { enabled: next.enabled },
    userId: actingUserId,
  });
  return next;
}
```

Update the service spec (Task 3) to also assert the audit-log call. Add a `auditLog: { record: vi.fn() }` to the `beforeEach` mocks and verify it's called once on success and zero times when NotFound is thrown.

(If `AuditLogService.record`'s parameter shape differs from above, adapt — the goal is "one audit-log entry per successful flip".)

- [ ] **Step 4: Create the ability-rules file**

```ts
// apps/backend/src/modules/feature-flags/feature-flags.ability-rules.ts
import { Injectable } from '@nestjs/common';
import type { AbilityBuilder } from '@casl/ability';

import type {
  AbilityRuleContributor,
  AppAbility,
} from '../../infrastructure/ability/ability.types.js';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

@Injectable()
export class FeatureFlagsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    if (user.role === 'sysadmin') {
      builder.can('manage', 'FeatureFlag');
    }
    // Regular users: nothing. They read the resolved map via the public
    // endpoint, which doesn't go through CASL.
  }
}
```

- [ ] **Step 5: Write the ability-rules spec**

```ts
// apps/backend/src/modules/feature-flags/feature-flags.ability-rules.spec.ts
import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { describe, expect, it } from 'vitest';

import type { AppAbility } from '../../infrastructure/ability/ability.types.js';
import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { FeatureFlagsAbilityRules } from './feature-flags.ability-rules.js';

function build(user: AuthenticatedUser | null): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  new FeatureFlagsAbilityRules().contributeTo(builder, user);
  return builder.build();
}

describe('FeatureFlagsAbilityRules', () => {
  it('grants sysadmin manage on FeatureFlag', () => {
    const ability = build({ id: 'a-1', role: 'sysadmin', memberships: [] } as AuthenticatedUser);
    expect(ability.can('manage', 'FeatureFlag')).toBe(true);
  });

  it('forbids regular users', () => {
    const ability = build({
      id: 'u-1',
      role: 'user',
      memberships: [],
    } as AuthenticatedUser);
    expect(ability.can('manage', 'FeatureFlag')).toBe(false);
    expect(ability.can('read', 'FeatureFlag')).toBe(false);
  });

  it('forbids the anonymous viewer', () => {
    const ability = build(null);
    expect(ability.can('read', 'FeatureFlag')).toBe(false);
  });
});
```

- [ ] **Step 6: Create the module**

```ts
// apps/backend/src/modules/feature-flags/feature-flags.module.ts
import { Module } from '@nestjs/common';

import { AuditLogModule } from '../audit-log/audit-log.module.js'; // adapt name

import {
  FeatureFlagsAdminController,
  FeatureFlagsPublicController,
} from './feature-flags.controller.js';
import { FeatureFlagsAbilityRules } from './feature-flags.ability-rules.js';
import { FeatureFlagsRepository } from './feature-flags.repository.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { FeatureFlagGuard } from './feature-flag.guard.js';

@Module({
  imports: [AuditLogModule],
  controllers: [FeatureFlagsPublicController, FeatureFlagsAdminController],
  providers: [
    FeatureFlagsRepository,
    FeatureFlagsService,
    FeatureFlagsAbilityRules,
    FeatureFlagGuard,
  ],
  exports: [FeatureFlagsService, FeatureFlagsAbilityRules, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
```

- [ ] **Step 7: Register FeatureFlagsAbilityRules in AbilityFactory + AbilityModule**

In `apps/backend/src/infrastructure/ability/ability.factory.ts`, add `@Optional() FeatureFlagsAbilityRules` to the constructor, append to the contributors list — same pattern as the labels series.

In `apps/backend/src/infrastructure/ability/ability.module.ts`, add `FeatureFlagsAbilityRules` to the providers.

- [ ] **Step 8: Register the module + global guard in AppModule**

In `apps/backend/src/app.module.ts`:

```ts
import { APP_GUARD } from '@nestjs/core';

import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module.js';
import { FeatureFlagGuard } from './modules/feature-flags/feature-flag.guard.js';

@Module({
  imports: [
    // … existing modules …
    FeatureFlagsModule,
  ],
  providers: [
    // … existing global providers …
    { provide: APP_GUARD, useClass: FeatureFlagGuard },
  ],
})
export class AppModule {}
```

Order: register `APP_GUARD` for `FeatureFlagGuard` AFTER the existing auth + CASL guards (NestJS runs APP_GUARD providers in registration order; auth → CASL → feature-flag is the right sequence so unauthenticated callers don't get a 404 instead of 401).

- [ ] **Step 9: Run the backend suite + typecheck**

```
pnpm --filter backend exec vitest run
cd apps/backend && npx tsc --noEmit
```

Expected: all pre-existing tests still green; new feature-flag specs (Tasks 3, 4, 6) pass.

- [ ] **Step 10: Commit**

```
git add apps/backend/src/modules/feature-flags/ apps/backend/src/app.module.ts apps/backend/src/infrastructure/ability/
git commit -m "feat(feature-flags): controller + module + CASL rules + global guard registration"
```

---

### Task 7: Regenerate OpenAPI

**Files:**
- Modify: `packages/contracts/openapi/openapi.json`
- Modify: `packages/contracts/openapi/openapi.yaml`

- [ ] **Step 1: Regenerate**

```
pnpm openapi:generate
```

- [ ] **Step 2: Inspect**

```
git diff packages/contracts/openapi | head -80
```

Expected: additions for the `FeatureFlag`, `FeatureFlagMap`, `UpdateFeatureFlagInput` schemas + the three new paths (`/api/feature-flags`, `/api/admin/feature-flags`, `/api/admin/feature-flags/{code}`). The rank-history paths should be unchanged structurally — the `@RequireFeatureFlag` decorator doesn't emit OpenAPI metadata.

If unrelated schemas show churn, STOP and investigate.

- [ ] **Step 3: Commit**

```
git add packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "chore(contracts): regen OpenAPI after feature-flags module"
```

---

### Task 8: Frontend entities — API client + admin React Query hooks

**Files:**
- Create: `apps/frontend/src/entities/feature-flag/index.ts`
- Create: `apps/frontend/src/entities/feature-flag/api/feature-flags.api.ts`
- Create: `apps/frontend/src/entities/feature-flag/api/feature-flags.api.test.ts`
- Create: `apps/frontend/src/entities/feature-flag/lib/hooks.ts`

- [ ] **Step 1: Read first**

Look at `apps/frontend/src/entities/label/` for the most recent pattern (API client + hooks). Same shape; just swap the resource.

The shared fetch helper is `httpClient` (per the labels series notes), imported from `@/shared/api`.

- [ ] **Step 2: Create the API client**

```ts
// apps/frontend/src/entities/feature-flag/api/feature-flags.api.ts
import { z } from 'zod';

import {
  FeatureFlagMapSchema,
  FeatureFlagSchema,
  type FeatureFlag,
  type FeatureFlagCode,
  type FeatureFlagMap,
  type UpdateFeatureFlagInput,
} from '@repo/contracts/feature-flags';

import { httpClient } from '@/shared/api';

const FeatureFlagListSchema = z.array(FeatureFlagSchema);

export async function getFeatureFlags(): Promise<FeatureFlagMap> {
  const raw = await httpClient('/api/feature-flags');
  return FeatureFlagMapSchema.parse(raw);
}

export async function getAdminFeatureFlags(): Promise<FeatureFlag[]> {
  const raw = await httpClient('/api/admin/feature-flags');
  return FeatureFlagListSchema.parse(raw);
}

export async function updateFeatureFlag(
  code: FeatureFlagCode,
  input: UpdateFeatureFlagInput,
): Promise<FeatureFlag> {
  const raw = await httpClient(`/api/admin/feature-flags/${code}`, {
    method: 'PATCH',
    body: input,
  });
  return FeatureFlagSchema.parse(raw);
}
```

- [ ] **Step 3: API smoke test**

```ts
// apps/frontend/src/entities/feature-flag/api/feature-flags.api.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAdminFeatureFlags,
  getFeatureFlags,
  updateFeatureFlag,
} from './feature-flags.api.js';

const ROW = {
  code: 'grading-history',
  enabled: true,
  updatedAt: '2026-06-08T10:00:00.000Z',
  updatedById: 'u-1',
};

const MAP = {
  'grading-history': true,
  'grading-history-verification': false,
  'instructor-feedback': false,
};

beforeEach(() => {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/feature-flags' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify(MAP), { status: 200 });
    }
    if (url === '/api/admin/feature-flags' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify([ROW]), { status: 200 });
    }
    if (url === '/api/admin/feature-flags/grading-history' && init?.method === 'PATCH') {
      return new Response(JSON.stringify(ROW), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url} ${init?.method ?? 'GET'}`);
  }) as unknown as typeof fetch;
});

afterEach(() => vi.restoreAllMocks());

describe('feature-flags API', () => {
  it('getFeatureFlags parses + returns the resolved map', async () => {
    const map = await getFeatureFlags();
    expect(map['grading-history']).toBe(true);
  });

  it('getAdminFeatureFlags returns the row list', async () => {
    const rows = await getAdminFeatureFlags();
    expect(rows[0]?.code).toBe('grading-history');
  });

  it('updateFeatureFlag PATCHes the row', async () => {
    const row = await updateFeatureFlag('grading-history', { enabled: true });
    expect(row.enabled).toBe(true);
  });
});
```

- [ ] **Step 4: Create the React Query hooks**

```ts
// apps/frontend/src/entities/feature-flag/lib/hooks.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '../api/feature-flags.api.js';

export const featureFlagsKeys = {
  all: ['feature-flags'] as const,
  admin: ['feature-flags', 'admin'] as const,
};

export function useAdminFeatureFlagsQuery() {
  return useQuery({
    queryKey: featureFlagsKeys.admin,
    queryFn: api.getAdminFeatureFlags,
  });
}

export function useUpdateFeatureFlagMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      code,
      input,
    }: {
      code: import('@repo/contracts/feature-flags').FeatureFlagCode;
      input: import('@repo/contracts/feature-flags').UpdateFeatureFlagInput;
    }) => api.updateFeatureFlag(code, input),
    onSuccess: () => {
      // Invalidate both the admin row list and the public-map query that the
      // SPA provider uses, so a toggle propagates everywhere immediately.
      void qc.invalidateQueries({ queryKey: featureFlagsKeys.admin });
      void qc.invalidateQueries({ queryKey: featureFlagsKeys.all });
    },
  });
}
```

Note: there's NO `useFeatureFlagsQuery()` for the public map. That's the provider's job (Task 9), not a feature-tier hook.

- [ ] **Step 5: Barrel**

```ts
// apps/frontend/src/entities/feature-flag/index.ts
export * from './api/feature-flags.api.js';
export * from './lib/hooks.js';
```

- [ ] **Step 6: Run + typecheck**

```
pnpm --filter frontend exec vitest run src/entities/feature-flag
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/entities/feature-flag/
git commit -m "feat(entities-feature-flag): typed API client + admin React Query hooks"
```

---

### Task 9: Frontend provider — switch from `VITE_FEATURE_FLAGS` to Suspense API fetch

**Files:**
- Modify: `apps/frontend/src/shared/lib/feature-flags/flags.ts` (becomes thin re-export)
- Modify: `apps/frontend/src/shared/lib/feature-flags/provider.tsx`
- Modify: `apps/frontend/src/shared/lib/feature-flags/useFeatureFlag.test.tsx` (existing provider spec — adapt the env-driven case)
- Modify: `apps/frontend/src/app/router/routes/__root.tsx` (Suspense boundary)

- [ ] **Step 1: Thin out `flags.ts`**

Replace contents with a re-export from contracts:

```ts
// apps/frontend/src/shared/lib/feature-flags/flags.ts
export {
  FEATURE_FLAG_CODES,
  DEFAULT_FLAGS,
  type FeatureFlagCode,
  type FeatureFlagMap,
} from '@repo/contracts/feature-flags';
```

The old `parseFlagsFromEnv` is removed — env is no longer the source of truth.

- [ ] **Step 2: Rewrite the provider**

```tsx
// apps/frontend/src/shared/lib/feature-flags/provider.tsx
import { useSuspenseQuery } from '@tanstack/react-query';
import * as React from 'react';

import { getFeatureFlags } from '@/entities/feature-flag/api/feature-flags.api.js';

import { DEFAULT_FLAGS, type FeatureFlagMap } from './flags.js';

export const FeatureFlagsContext = React.createContext<FeatureFlagMap>(DEFAULT_FLAGS);

export interface FeatureFlagsProviderProps {
  children: React.ReactNode;
  /**
   * Optional override — primarily for tests / Storybook to inject a specific
   * map without hitting the API. Production callers omit this and the
   * provider fetches from `GET /api/feature-flags`.
   */
  flags?: FeatureFlagMap;
}

/**
 * Production path: suspends at app boot while the SPA fetches the resolved
 * flag map. The Suspense boundary lives at the router root (see
 * `app/router/routes/__root.tsx`).
 *
 * Test/Storybook path: pass `flags={{...}}` to skip the fetch entirely.
 */
export function FeatureFlagsProvider({
  children,
  flags,
}: FeatureFlagsProviderProps): React.ReactElement {
  if (flags) {
    return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
  }
  return <FetchingProvider>{children}</FetchingProvider>;
}

function FetchingProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { data } = useSuspenseQuery({
    queryKey: ['feature-flags'],
    queryFn: () => getFeatureFlags(),
    staleTime: Infinity, // refetch only when the admin mutation invalidates
  });
  return <FeatureFlagsContext.Provider value={data}>{children}</FeatureFlagsContext.Provider>;
}
```

- [ ] **Step 3: Wrap `__root.tsx` in a Suspense boundary**

Open `apps/frontend/src/app/router/routes/__root.tsx`. Find the existing root component. Wrap the `<Outlet />` (or the `<FeatureFlagsProvider>` if it's already mounted at root) in `<React.Suspense fallback={<AppLoading />} />`. Use whatever lightweight loading component the project already has (look for `AppLoading`, `PageSpinner`, or similar); if none exists, fall back to a minimal placeholder:

```tsx
<React.Suspense fallback={<div className="container py-12 text-center text-on-surface-variant">Loading…</div>}>
  <FeatureFlagsProvider>
    <Outlet />
  </FeatureFlagsProvider>
</React.Suspense>
```

The existing `FeatureFlagsProvider` mount-point may already live elsewhere (`app/providers/FeatureFlagsProvider.tsx`); inspect to confirm and adapt the Suspense boundary placement.

- [ ] **Step 4: Update the provider spec**

Open `apps/frontend/src/shared/lib/feature-flags/useFeatureFlag.test.tsx`. The existing test that exercises the env-driven path needs to change — env is gone. The new tests should:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FeatureFlagsProvider } from './provider.js';
import { useFeatureFlag } from './useFeatureFlag.js';

function Probe({ code }: { code: 'grading-history' }) {
  const value = useFeatureFlag(code);
  return <span data-testid="value">{String(value)}</span>;
}

describe('FeatureFlagsProvider', () => {
  it('uses the flags prop when provided (test override path)', () => {
    render(
      <FeatureFlagsProvider
        flags={{
          'grading-history': true,
          'grading-history-verification': false,
          'instructor-feedback': false,
        }}
      >
        <Probe code="grading-history" />
      </FeatureFlagsProvider>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('true');
  });

  it('fetches from /api/feature-flags when no override is supplied', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          'grading-history': true,
          'grading-history-verification': false,
          'instructor-feedback': false,
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <React.Suspense fallback={<span data-testid="fallback">…</span>}>
          <FeatureFlagsProvider>
            <Probe code="grading-history" />
          </FeatureFlagsProvider>
        </React.Suspense>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('value')).toHaveTextContent('true');
  });
});
```

- [ ] **Step 5: Run + typecheck**

```
pnpm --filter frontend exec vitest run src/shared/lib/feature-flags
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/shared/lib/feature-flags/ apps/frontend/src/app/router/routes/__root.tsx apps/frontend/src/app/providers/
git commit -m "feat(feature-flags): provider switches from VITE_FEATURE_FLAGS to Suspense API fetch"
```

---

### Task 10: Frontend — `/admin/feature-flags` page + `/settings` hub link

**Files:**
- Create: `apps/frontend/src/pages/admin-feature-flags/index.ts`
- Create: `apps/frontend/src/pages/admin-feature-flags/ui/AdminFeatureFlagsPage.tsx`
- Create: `apps/frontend/src/pages/admin-feature-flags/ui/AdminFeatureFlagsPage.test.tsx`
- Create: `apps/frontend/src/app/router/routes/_app.admin.feature-flags.tsx`
- Modify: `apps/frontend/src/pages/settings/ui/SettingsPage.tsx` (add link)

- [ ] **Step 1: Page component**

```tsx
// apps/frontend/src/pages/admin-feature-flags/ui/AdminFeatureFlagsPage.tsx
import { formatDistanceToNow } from 'date-fns';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useAdminFeatureFlagsQuery,
  useUpdateFeatureFlagMutation,
} from '@/entities/feature-flag';
import { Button } from '@/shared/ui';

export function AdminFeatureFlagsPage(): React.ReactElement {
  const { t } = useTranslation();
  const { data: rows = [], isLoading } = useAdminFeatureFlagsQuery();
  const updateMut = useUpdateFeatureFlagMutation();

  if (isLoading) return <p className="container py-8">{t('common.loading')}</p>;

  return (
    <main className="container py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        {t('admin.featureFlags.title')}
      </h1>
      <table className="mt-6 w-full">
        <thead>
          <tr className="text-left text-sm text-on-surface-variant">
            <th className="py-2">{t('admin.featureFlags.code')}</th>
            <th className="py-2">{t('admin.featureFlags.enabled')}</th>
            <th className="py-2">{t('admin.featureFlags.lastUpdated')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} className="border-t border-outline-variant">
              <td className="py-3 font-mono text-sm">{row.code}</td>
              <td className="py-3">
                <Button
                  size="sm"
                  variant={row.enabled ? 'default' : 'outline'}
                  onClick={() =>
                    updateMut.mutate({ code: row.code, input: { enabled: !row.enabled } })
                  }
                  disabled={updateMut.isPending}
                  aria-pressed={row.enabled}
                >
                  {row.enabled ? t('admin.featureFlags.on') : t('admin.featureFlags.off')}
                </Button>
              </td>
              <td className="py-3 text-sm text-on-surface-variant">
                {row.updatedById
                  ? `${row.updatedById} · ${formatDistanceToNow(new Date(row.updatedAt))} ago`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

(If `date-fns` isn't already a dep, fall back to a simpler `new Date(row.updatedAt).toLocaleString()`. Check `apps/frontend/package.json` — date-fns may already be present from prior work.)

- [ ] **Step 2: Page barrel**

```ts
// apps/frontend/src/pages/admin-feature-flags/index.ts
export { AdminFeatureFlagsPage } from './ui/AdminFeatureFlagsPage.js';
```

- [ ] **Step 3: Route**

```ts
// apps/frontend/src/app/router/routes/_app.admin.feature-flags.tsx
import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminFeatureFlagsPage } from '@/pages/admin-feature-flags';

import { appLayoutRoute } from './_app.js';

export const adminFeatureFlagsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/feature-flags',
  beforeLoad: async () => {
    let role: string | undefined;
    try {
      const result = await authClient.getSession();
      role = (result.data?.user as { role?: string } | undefined)?.role;
    } catch {
      /* swallow — `role` stays undefined */
    }
    if (role !== 'sysadmin') {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: AdminFeatureFlagsPage,
});

export const Route = adminFeatureFlagsRoute;
```

The TanStack Router plugin regenerates `routeTree.gen.ts` on next dev/build.

- [ ] **Step 4: Page smoke test**

```tsx
// apps/frontend/src/pages/admin-feature-flags/ui/AdminFeatureFlagsPage.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/entities/feature-flag', () => ({
  useAdminFeatureFlagsQuery: () => ({
    data: [
      {
        code: 'grading-history',
        enabled: false,
        updatedAt: '2026-06-08T10:00:00.000Z',
        updatedById: 'u-1',
      },
    ],
    isLoading: false,
  }),
  useUpdateFeatureFlagMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AdminFeatureFlagsPage } from './AdminFeatureFlagsPage.js';

describe('<AdminFeatureFlagsPage>', () => {
  it('renders a row per flag with toggle + last-updated cell', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <AdminFeatureFlagsPage />
      </QueryClientProvider>,
    );
    expect(screen.getByText('grading-history')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /off/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Add `/settings` hub link**

Open `apps/frontend/src/pages/settings/ui/SettingsPage.tsx`. Find the `<ul>` of `<SectionLink>`-style cards. Add a second `<li>` matching the existing Labels card:

```tsx
import { Flag, Tag } from 'lucide-react';
// … other imports …

// inside the existing <ul>, after the Labels <li>:
<li>
  <Link
    to="/admin/feature-flags"
    className="flex items-center gap-3 rounded-lg border border-outline-variant p-4 hover:border-primary hover:bg-surface-container"
  >
    <Flag className="size-5 text-on-surface-variant" aria-hidden />
    <span className="font-medium">{t('admin.featureFlags.title')}</span>
  </Link>
</li>
```

Sysadmin-only visibility: wrap the `<li>` in a session-role check so only sysadmins see the link:

```tsx
import { useSession } from '@/features/auth-by-email';
// …
const session = useSession();
const isSysadmin = (session.data?.user as { role?: string } | undefined)?.role === 'sysadmin';
// …
{isSysadmin ? (
  <li>
    {/* the Flag <Link> above */}
  </li>
) : null}
```

- [ ] **Step 6: Run + typecheck**

```
pnpm --filter frontend exec vitest run src/pages/admin-feature-flags src/pages/settings
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/pages/admin-feature-flags/ apps/frontend/src/pages/settings/ apps/frontend/src/app/router/routes/_app.admin.feature-flags.tsx
git commit -m "feat(admin-feature-flags): sysadmin page + settings hub link"
```

---

### Task 11: i18n keys — en/sv/fi

**Files:**
- Modify: `apps/frontend/src/i18n/locales/en.json`
- Modify: `apps/frontend/src/i18n/locales/sv.json`
- Modify: `apps/frontend/src/i18n/locales/fi.json`

- [ ] **Step 1: Add to `en.json`**

Inside the existing `admin` block, append a `featureFlags` child:

```jsonc
{
  "admin": {
    // … existing keys preserved …
    "featureFlags": {
      "title": "Feature flags",
      "code": "Code",
      "enabled": "Enabled",
      "lastUpdated": "Last updated",
      "on": "On",
      "off": "Off"
    }
  }
}
```

- [ ] **Step 2: Add to `sv.json`**

```jsonc
{
  "admin": {
    "featureFlags": {
      "title": "Funktionsflaggor",
      "code": "Kod",
      "enabled": "Aktiverad",
      "lastUpdated": "Senast uppdaterad",
      "on": "På",
      "off": "Av"
    }
  }
}
```

- [ ] **Step 3: Add to `fi.json`**

```jsonc
{
  "admin": {
    "featureFlags": {
      "title": "Ominaisuusliput",
      "code": "Koodi",
      "enabled": "Käytössä",
      "lastUpdated": "Viimeksi päivitetty",
      "on": "Päällä",
      "off": "Pois"
    }
  }
}
```

(Preserve existing keys; insert only the `featureFlags` child.)

- [ ] **Step 4: Run + typecheck**

```
pnpm --filter frontend exec vitest run src/pages/admin-feature-flags
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/i18n/locales/
git commit -m "feat(i18n): admin.featureFlags keys (en/sv/fi)"
```

---

### Task 12: Cleanup — remove `VITE_FEATURE_FLAGS`

**Files:**
- Modify: `apps/frontend/.env.example`
- Modify: `apps/frontend/vitest.config.ts`

- [ ] **Step 1: Remove from `.env.example`**

```
sed -i '/VITE_FEATURE_FLAGS/d' apps/frontend/.env.example
```

(Or hand-edit — delete the `VITE_FEATURE_FLAGS={}` line and the comment above it if any.)

- [ ] **Step 2: Remove from `vitest.config.ts`**

Open `apps/frontend/vitest.config.ts`. Find the `env` block under `test`:

```ts
env: {
  VITE_API_URL: 'http://localhost:3001',
  // VITE_FEATURE_FLAGS: '{}',   ← if this line exists, remove it
},
```

Leave the `VITE_API_URL` line untouched.

- [ ] **Step 3: Search the repo for any other `VITE_FEATURE_FLAGS` reference**

```
grep -rn "VITE_FEATURE_FLAGS" apps/frontend
```

Expected: no matches. If any remain (e.g. a forgotten import in `provider.tsx`), remove them.

- [ ] **Step 4: Run + typecheck**

```
pnpm --filter frontend exec vitest run
cd apps/frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```
git add apps/frontend/.env.example apps/frontend/vitest.config.ts
git commit -m "chore(feature-flags): drop VITE_FEATURE_FLAGS from env + vitest config"
```

---

### Task 13: Full pipeline + clean tree confirmation

- [ ] **Step 1: Frontend full suite**

```
cd apps/frontend && npx vitest run
```

- [ ] **Step 2: Backend full suite**

```
pnpm --filter backend exec vitest run
```

- [ ] **Step 3: Contracts full suite**

```
pnpm --filter @repo/contracts exec vitest run
```

- [ ] **Step 4: Typechecks**

```
cd apps/frontend && npx tsc --noEmit
cd ../backend && npx tsc --noEmit
cd ../../packages/contracts && npx tsc --noEmit
```

- [ ] **Step 5: Steiger arch lint**

```
cd apps/frontend && npm run arch
```

Expected: 0 errors. Pre-existing `fsd/insignificant-slice` warnings are fine.

- [ ] **Step 6: Frontend build**

```
cd apps/frontend && npx vite build
```

Expected: `built in N.NN s`.

- [ ] **Step 7: Confirm clean working tree**

```
git status --short
```

Expected: empty.

- [ ] **Step 8: (Optional) Manual verification**

Apply migration 0014 to dev:

```
pnpm --filter backend exec drizzle-kit migrate
```

Then exercise:
1. Sign in as sysadmin → `/admin/feature-flags` → toggle `grading-history-verification` ON → verify the Verify/Unverify buttons reappear on a rank-history row.
2. Toggle it OFF → call `POST /api/rank-history/<id>/verify` directly → expect 404.
3. Toggle `grading-history` OFF → call `POST /api/rank-history` directly → expect 404. Existing rank-history rows still render (GET endpoints unaffected).

---

## Notes

- **Deploy order: backend first.** The new frontend `FeatureFlagsProvider` does a Suspense fetch on `GET /api/feature-flags`. If the frontend deploys ahead of the backend, the fetch returns 404 and the entire SPA fails to render. Ship the backend, verify the endpoint serves `200 { ... }`, then ship the frontend.
- **No cache.** Per-request DB lookup is fine at the table size (≤ a dozen rows). If a benchmark shows the per-request roundtrip is a hot path, add a 30s TTL in-memory cache to `FeatureFlagsService`. The interface (`isEnabled(code): Promise<boolean>`) stays the same.
- **Adding a new flag** = (a) add the code to `FEATURE_FLAG_CODES` in `@repo/contracts/feature-flags`; (b) write a tiny migration `INSERT INTO feature_flag (code) VALUES ('new-code') ON CONFLICT DO NOTHING;`. The admin UI auto-discovers it.
- **Audit-log entries.** Every successful PATCH writes one row to the audit log via the existing `AuditLogService`. The flag row itself also carries `updated_by_id` for direct attribution.
- **`grading-history` reads stay open** even when the flag is off. Decommissioning a feature shouldn't make historical data invisible to the admins who need to migrate it away.
- **Open considerations** from the spec (caching strategy, per-org overrides) are documented as Phase B+ work; nothing in Phase A's interface blocks adding them later.
