# Belt-Catalog + Rank-History Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend half of the belt-catalog + rank-history surface — `belt_systems`, `belt_ranks`, `shogo_titles`, and `rank_history` tables; admin CRUD for the three catalog resources; a self-service rank-history surface with verification flow; a unified grading-history projection; and a seeder stub for the starter catalog.

**Architecture:** Three new NestJS modules (`BeltCatalogModule`, `RankHistoryModule`, `GradingHistoryProjectionModule`) mirroring the `memberships/` and `profile/` shape. Authorisation is split: CASL gates the class-level surface (four new subjects); cross-join predicates (head-instructor, org-shared, recorder ≠ verifier) live in a dedicated `RankHistoryAuthService` that batches role lookups once per request. Contracts ship four new subpath exports (`./belt-systems`, `./ranks`, `./shogo-titles`, `./rank-history`) and one CASL extension.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, Zod 4 (`@repo/contracts`), Vitest, CASL.

**Dependency posture:** Followup items D1 (`grading_events`), D2 (`instructor_students`), D3 (`grading_officers*`), and parts of D4 (`user_profile.current_rank_id`) are deferred. `RankHistoryAuthService` fails closed on the predicates that depend on them — the verify endpoints exist and route correctly, but the only verifier roles that resolve to `true` in this phase are sysadmin and head-instructor-of-subject's-org. The shogo recompute path is operative because Task 4 adds `user_profile.shogo_title`.

---

### Task 1: Contracts — belt-catalog schemas (`belt-systems`, `ranks`, `shogo-titles`)

**Files:**
- Create: `packages/contracts/src/belt-systems.ts`
- Create: `packages/contracts/src/ranks.ts`
- Create: `packages/contracts/src/shogo-titles.ts`
- Create: `packages/contracts/src/__tests__/belt-systems.test.ts`
- Create: `packages/contracts/src/__tests__/ranks.test.ts`
- Create: `packages/contracts/src/__tests__/shogo-titles.test.ts`
- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/tsup.config.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing contract tests**

Create `packages/contracts/src/__tests__/belt-systems.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  BeltSystemSchema,
  CreateBeltSystemSchema,
  UpdateBeltSystemSchema,
} from '../belt-systems.js';

const UUID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO = '2026-05-24T08:00:00.000Z';

const VALID_ROW = {
  id: UUID,
  code: 'kyu',
  nameEn: 'Kyu',
  nameSv: 'Kyu',
  nameFi: 'Kyu',
  organisationId: null,
  sortOrder: 1,
  createdAt: ISO,
  updatedAt: ISO,
};

describe('BeltSystemSchema', () => {
  it('accepts a valid row', () => {
    expect(BeltSystemSchema.safeParse(VALID_ROW).success).toBe(true);
  });

  it('rejects a non-uuid id', () => {
    expect(BeltSystemSchema.safeParse({ ...VALID_ROW, id: 'nope' }).success).toBe(false);
  });
});

describe('CreateBeltSystemSchema', () => {
  it('accepts a minimal global system', () => {
    expect(
      CreateBeltSystemSchema.safeParse({
        code: 'kyu',
        nameEn: 'Kyu',
        nameSv: 'Kyu',
        nameFi: 'Kyu',
      }).success,
    ).toBe(true);
  });

  it('rejects a missing localised name', () => {
    expect(
      CreateBeltSystemSchema.safeParse({ code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu' }).success,
    ).toBe(false);
  });

  it('rejects a code longer than 3 chars', () => {
    expect(
      CreateBeltSystemSchema.safeParse({
        code: 'kyus',
        nameEn: 'Kyu',
        nameSv: 'Kyu',
        nameFi: 'Kyu',
      }).success,
    ).toBe(false);
  });

  it('accepts an explicit null organisationId', () => {
    expect(
      CreateBeltSystemSchema.safeParse({
        code: 'kyu',
        nameEn: 'Kyu',
        nameSv: 'Kyu',
        nameFi: 'Kyu',
        organisationId: null,
      }).success,
    ).toBe(true);
  });
});

describe('UpdateBeltSystemSchema', () => {
  it('accepts an empty patch', () => {
    expect(UpdateBeltSystemSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single-field patch', () => {
    expect(UpdateBeltSystemSchema.safeParse({ sortOrder: 5 }).success).toBe(true);
  });
});
```

Create `packages/contracts/src/__tests__/ranks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  BeltRankSchema,
  CreateBeltRankSchema,
  UpdateBeltRankSchema,
} from '../ranks.js';

const UUID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO = '2026-05-24T08:00:00.000Z';

const VALID_CREATE = {
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
  publiclyVisible: false,
  slug: null,
  minAge: null,
  nextRankId: null,
  organisationId: null,
};

describe('CreateBeltRankSchema', () => {
  it('accepts a minimal rank', () => {
    expect(
      CreateBeltRankSchema.safeParse({
        systemId: UUID,
        level: 1,
        nameRomaji: 'Jukyu',
        beltColor: '#FFFFFF',
      }).success,
    ).toBe(true);
  });

  it('accepts a fully-populated rank', () => {
    expect(CreateBeltRankSchema.safeParse(VALID_CREATE).success).toBe(true);
  });

  it('rejects a non-positive level', () => {
    expect(
      CreateBeltRankSchema.safeParse({ ...VALID_CREATE, level: 0 }).success,
    ).toBe(false);
  });

  it('rejects a non-hex beltColor', () => {
    expect(
      CreateBeltRankSchema.safeParse({ ...VALID_CREATE, beltColor: 'red' }).success,
    ).toBe(false);
  });

  it('rejects publiclyVisible:true with no slug', () => {
    expect(
      CreateBeltRankSchema.safeParse({
        ...VALID_CREATE,
        publiclyVisible: true,
        slug: null,
      }).success,
    ).toBe(false);
  });

  it('accepts publiclyVisible:true with a valid slug', () => {
    expect(
      CreateBeltRankSchema.safeParse({
        ...VALID_CREATE,
        publiclyVisible: true,
        slug: 'jukyu',
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid slug shape', () => {
    expect(
      CreateBeltRankSchema.safeParse({
        ...VALID_CREATE,
        publiclyVisible: true,
        slug: 'Jukyu!',
      }).success,
    ).toBe(false);
  });
});

describe('UpdateBeltRankSchema', () => {
  it('accepts an empty patch', () => {
    expect(UpdateBeltRankSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single-field patch', () => {
    expect(UpdateBeltRankSchema.safeParse({ sortOrder: 50 }).success).toBe(true);
  });

  it('rejects publiclyVisible:true with no slug when both are present', () => {
    expect(
      UpdateBeltRankSchema.safeParse({ publiclyVisible: true, slug: null }).success,
    ).toBe(false);
  });
});

describe('BeltRankSchema', () => {
  it('accepts a full read row', () => {
    expect(
      BeltRankSchema.safeParse({
        ...VALID_CREATE,
        id: UUID,
        createdAt: ISO,
        updatedAt: ISO,
      }).success,
    ).toBe(true);
  });
});
```

Create `packages/contracts/src/__tests__/shogo-titles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  CreateShogoTitleSchema,
  ShogoTitleSchema,
  UpdateShogoTitleSchema,
} from '../shogo-titles.js';

const UUID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

const VALID = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: UUID,
  sortOrder: 1,
};

describe('ShogoTitleSchema', () => {
  it('accepts a valid row', () => {
    expect(ShogoTitleSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects a missing nameJa', () => {
    expect(
      ShogoTitleSchema.safeParse({ ...VALID, nameJa: undefined }).success,
    ).toBe(false);
  });
});

describe('CreateShogoTitleSchema', () => {
  it('accepts a minimal create', () => {
    expect(CreateShogoTitleSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects a code longer than 30 chars', () => {
    expect(
      CreateShogoTitleSchema.safeParse({ ...VALID, code: 'a'.repeat(31) }).success,
    ).toBe(false);
  });
});

describe('UpdateShogoTitleSchema', () => {
  it('accepts an empty patch', () => {
    expect(UpdateShogoTitleSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single-field patch', () => {
    expect(UpdateShogoTitleSchema.safeParse({ sortOrder: 9 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```
pnpm --filter @repo/contracts test
```

Expected: FAIL — each new spec fails to import its missing module (`belt-systems.js`, `ranks.js`, `shogo-titles.js`).

- [ ] **Step 3: Create `belt-systems.ts`**

Create `packages/contracts/src/belt-systems.ts`:

```ts
import { z } from './zod-openapi.js';

const ISO_DATETIME_EXAMPLE = '2026-05-24T08:00:00.000Z';
const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

/**
 * A belt system — a family of ranks (Kyu, Dan, Mon). `organisationId` NULL
 * means the system is global (every organisation may use it); non-null scopes
 * it to one organisation. `code` is unique per scope.
 */
export const BeltSystemSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().min(1).max(3),
    nameEn: z.string().min(1).max(100),
    nameSv: z.string().min(1).max(100),
    nameFi: z.string().min(1).max(100),
    organisationId: z.string().uuid().nullable(),
    sortOrder: z.number().int().min(0),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({
    id: 'BeltSystem',
    description: 'A family of belt ranks (Kyu, Dan, Mon).',
    example: {
      id: UUID_EXAMPLE,
      code: 'kyu',
      nameEn: 'Kyu',
      nameSv: 'Kyu',
      nameFi: 'Kyu',
      organisationId: null,
      sortOrder: 1,
      createdAt: ISO_DATETIME_EXAMPLE,
      updatedAt: ISO_DATETIME_EXAMPLE,
    },
  });

export type BeltSystem = z.infer<typeof BeltSystemSchema>;

export const CreateBeltSystemSchema = z
  .object({
    code: z.string().min(1).max(3),
    nameEn: z.string().min(1).max(100),
    nameSv: z.string().min(1).max(100),
    nameFi: z.string().min(1).max(100),
    organisationId: z.string().uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .meta({
    id: 'CreateBeltSystemInput',
    description: 'Create-belt-system payload.',
  });

export type CreateBeltSystemInput = z.infer<typeof CreateBeltSystemSchema>;

export const UpdateBeltSystemSchema = z
  .object({
    code: z.string().min(1).max(3).optional(),
    nameEn: z.string().min(1).max(100).optional(),
    nameSv: z.string().min(1).max(100).optional(),
    nameFi: z.string().min(1).max(100).optional(),
    organisationId: z.string().uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .meta({
    id: 'UpdateBeltSystemInput',
    description: 'Update-belt-system patch — omit a field to leave it unchanged.',
  });

export type UpdateBeltSystemInput = z.infer<typeof UpdateBeltSystemSchema>;

export const BeltSystemsOpenApiRegistry = {
  BeltSystem: BeltSystemSchema,
  CreateBeltSystemInput: CreateBeltSystemSchema,
  UpdateBeltSystemInput: UpdateBeltSystemSchema,
} as const;
```

- [ ] **Step 4: Create `ranks.ts`**

Create `packages/contracts/src/ranks.ts`:

```ts
import { z } from './zod-openapi.js';

const ISO_DATETIME_EXAMPLE = '2026-05-24T08:00:00.000Z';
const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

const SLUG_REGEX = /^[a-z0-9-]+$/;
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const slugRequiredWhenPublic = (
  v: { publiclyVisible?: boolean; slug?: string | null | undefined },
): boolean => {
  if (v.publiclyVisible !== true) return true;
  return typeof v.slug === 'string' && v.slug.length > 0;
};

const SLUG_RULE_MSG = 'Slug required when publicly visible.';

/**
 * A specific rank inside a belt system (5th Kyu, 3rd Dan). `level` ascends
 * within the system (1 = lowest). `sortOrder` is the global display order
 * across systems. `nextRankId` is an explicit "next in ladder" override.
 */
export const CreateBeltRankSchema = z
  .object({
    organisationId: z.string().uuid().nullable().optional(),
    systemId: z.string().uuid(),
    level: z.number().int().positive(),
    sortOrder: z.number().int().min(0).default(0),
    nameJa: z.string().max(100).nullable().default(null),
    nameRomaji: z.string().min(1).max(100),
    nameEn: z.string().max(100).default(''),
    nameSv: z.string().max(100).default(''),
    nameFi: z.string().max(100).default(''),
    beltColor: z.string().regex(HEX_COLOR_REGEX, 'Must be a six-digit hex colour, e.g. #FFD700.'),
    imageUrl: z.string().url().nullable().optional(),
    descriptionEn: z.string().nullable().default(null),
    descriptionSv: z.string().nullable().default(null),
    descriptionFi: z.string().nullable().default(null),
    publiclyVisible: z.boolean().default(false),
    slug: z.string().regex(SLUG_REGEX, 'Slug must be lowercase letters, digits, and hyphens only.').nullable().optional(),
    minAge: z.number().int().min(0).nullable().optional(),
    nextRankId: z.string().uuid().nullable().optional(),
  })
  .refine(slugRequiredWhenPublic, { path: ['slug'], message: SLUG_RULE_MSG })
  .meta({
    id: 'CreateBeltRankInput',
    description: 'Create-belt-rank payload.',
  });

export type CreateBeltRankInput = z.infer<typeof CreateBeltRankSchema>;

export const UpdateBeltRankSchema = z
  .object({
    organisationId: z.string().uuid().nullable().optional(),
    systemId: z.string().uuid().optional(),
    level: z.number().int().positive().optional(),
    sortOrder: z.number().int().min(0).optional(),
    nameJa: z.string().max(100).nullable().optional(),
    nameRomaji: z.string().min(1).max(100).optional(),
    nameEn: z.string().max(100).optional(),
    nameSv: z.string().max(100).optional(),
    nameFi: z.string().max(100).optional(),
    beltColor: z.string().regex(HEX_COLOR_REGEX, 'Must be a six-digit hex colour, e.g. #FFD700.').optional(),
    imageUrl: z.string().url().nullable().optional(),
    descriptionEn: z.string().nullable().optional(),
    descriptionSv: z.string().nullable().optional(),
    descriptionFi: z.string().nullable().optional(),
    publiclyVisible: z.boolean().optional(),
    slug: z.string().regex(SLUG_REGEX, 'Slug must be lowercase letters, digits, and hyphens only.').nullable().optional(),
    minAge: z.number().int().min(0).nullable().optional(),
    nextRankId: z.string().uuid().nullable().optional(),
  })
  .refine(slugRequiredWhenPublic, { path: ['slug'], message: SLUG_RULE_MSG })
  .meta({
    id: 'UpdateBeltRankInput',
    description: 'Update-belt-rank patch — omit a field to leave it unchanged.',
  });

export type UpdateBeltRankInput = z.infer<typeof UpdateBeltRankSchema>;

export const BeltRankSchema = z
  .object({
    id: z.string().uuid(),
    organisationId: z.string().uuid().nullable(),
    systemId: z.string().uuid(),
    level: z.number().int().positive(),
    sortOrder: z.number().int().min(0),
    nameJa: z.string().nullable(),
    nameRomaji: z.string(),
    nameEn: z.string(),
    nameSv: z.string(),
    nameFi: z.string(),
    beltColor: z.string(),
    imageUrl: z.string().nullable(),
    descriptionEn: z.string().nullable(),
    descriptionSv: z.string().nullable(),
    descriptionFi: z.string().nullable(),
    publiclyVisible: z.boolean(),
    slug: z.string().nullable(),
    minAge: z.number().int().nullable(),
    nextRankId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({
    id: 'BeltRank',
    description: 'A specific rank inside a belt system.',
    example: {
      id: UUID_EXAMPLE,
      organisationId: null,
      systemId: UUID_EXAMPLE,
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
      createdAt: ISO_DATETIME_EXAMPLE,
      updatedAt: ISO_DATETIME_EXAMPLE,
    },
  });

export type BeltRank = z.infer<typeof BeltRankSchema>;

export const BeltRanksOpenApiRegistry = {
  BeltRank: BeltRankSchema,
  CreateBeltRankInput: CreateBeltRankSchema,
  UpdateBeltRankInput: UpdateBeltRankSchema,
} as const;
```

- [ ] **Step 5: Create `shogo-titles.ts`**

Create `packages/contracts/src/shogo-titles.ts`:

```ts
import { z } from './zod-openapi.js';

const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';

/**
 * Honorary titles overlaid on Dan ranks (Renshi, Kyoshi, Hanshi). `code` is
 * the stable identifier; `sortOrder` defines the "highest verified" ordering
 * used by the shogo recompute path (renshi < kyoshi < hanshi).
 */
export const ShogoTitleSchema = z
  .object({
    code: z.string().min(1).max(30),
    nameEn: z.string().min(1).max(100),
    nameSv: z.string().min(1).max(100),
    nameFi: z.string().min(1).max(100),
    nameJa: z.string().min(1).max(100),
    minRankId: z.string().uuid(),
    sortOrder: z.number().int().min(0),
  })
  .meta({
    id: 'ShogoTitle',
    description: 'Honorary title (Renshi / Kyoshi / Hanshi).',
    example: {
      code: 'renshi',
      nameEn: 'Renshi',
      nameSv: 'Renshi',
      nameFi: 'Renshi',
      nameJa: '錬士',
      minRankId: UUID_EXAMPLE,
      sortOrder: 1,
    },
  });

export type ShogoTitle = z.infer<typeof ShogoTitleSchema>;

export const CreateShogoTitleSchema = z
  .object({
    code: z.string().min(1).max(30),
    nameEn: z.string().min(1).max(100),
    nameSv: z.string().min(1).max(100),
    nameFi: z.string().min(1).max(100),
    nameJa: z.string().min(1).max(100),
    minRankId: z.string().uuid(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .meta({
    id: 'CreateShogoTitleInput',
    description: 'Create-shogo-title payload.',
  });

export type CreateShogoTitleInput = z.infer<typeof CreateShogoTitleSchema>;

export const UpdateShogoTitleSchema = z
  .object({
    nameEn: z.string().min(1).max(100).optional(),
    nameSv: z.string().min(1).max(100).optional(),
    nameFi: z.string().min(1).max(100).optional(),
    nameJa: z.string().min(1).max(100).optional(),
    minRankId: z.string().uuid().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .meta({
    id: 'UpdateShogoTitleInput',
    description: 'Update-shogo-title patch — omit a field to leave it unchanged.',
  });

export type UpdateShogoTitleInput = z.infer<typeof UpdateShogoTitleSchema>;

export const ShogoTitlesOpenApiRegistry = {
  ShogoTitle: ShogoTitleSchema,
  CreateShogoTitleInput: CreateShogoTitleSchema,
  UpdateShogoTitleInput: UpdateShogoTitleSchema,
} as const;
```

- [ ] **Step 6: Add the three subpath exports to `package.json`**

In `packages/contracts/package.json`, inside the `"exports"` map, add the three entries immediately after the existing `"./profile"` block:

```json
    "./belt-systems": {
      "import": {
        "types": "./dist/belt-systems.d.ts",
        "default": "./dist/belt-systems.js"
      },
      "require": {
        "types": "./dist/belt-systems.d.cts",
        "default": "./dist/belt-systems.cjs"
      }
    },
    "./ranks": {
      "import": {
        "types": "./dist/ranks.d.ts",
        "default": "./dist/ranks.js"
      },
      "require": {
        "types": "./dist/ranks.d.cts",
        "default": "./dist/ranks.cjs"
      }
    },
    "./shogo-titles": {
      "import": {
        "types": "./dist/shogo-titles.d.ts",
        "default": "./dist/shogo-titles.js"
      },
      "require": {
        "types": "./dist/shogo-titles.d.cts",
        "default": "./dist/shogo-titles.cjs"
      }
    }
```

- [ ] **Step 7: Add the three entries to `tsup.config.ts`**

In `packages/contracts/tsup.config.ts`, add three lines to the `entry` object after the `profile` line:

```ts
    profile: 'src/profile.ts',
    'belt-systems': 'src/belt-systems.ts',
    ranks: 'src/ranks.ts',
    'shogo-titles': 'src/shogo-titles.ts',
```

- [ ] **Step 8: Re-export from the package root**

In `packages/contracts/src/index.ts`, add three lines after the `profile` re-export:

```ts
export * from './profile.js';
export * from './belt-systems.js';
export * from './ranks.js';
export * from './shogo-titles.js';
```

- [ ] **Step 9: Build the contracts package**

```
pnpm --filter @repo/contracts build
```

Expected: PASS — tsup writes `dist/belt-systems.{js,cjs,d.ts,d.cts}`, `dist/ranks.*`, `dist/shogo-titles.*`; build exits 0.

- [ ] **Step 10: Run the tests — expect PASS**

```
pnpm --filter @repo/contracts test
```

Expected: PASS — all three new test files green; the full contracts suite stays green.

- [ ] **Step 11: Commit**

```
git add packages/contracts/src/belt-systems.ts packages/contracts/src/ranks.ts packages/contracts/src/shogo-titles.ts packages/contracts/src/__tests__/belt-systems.test.ts packages/contracts/src/__tests__/ranks.test.ts packages/contracts/src/__tests__/shogo-titles.test.ts packages/contracts/package.json packages/contracts/tsup.config.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): belt-systems, ranks, shogo-titles schemas + subpath exports"
```

---


### Task 2: Contracts — rank-history schemas

**Files:**
- Create: `packages/contracts/src/rank-history.ts`
- Create: `packages/contracts/src/__tests__/rank-history.test.ts`
- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/tsup.config.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/__tests__/rank-history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  CreateRankHistorySchema,
  GradingHistoryResponseSchema,
  GradingHistoryRowSchema,
  RankHistorySchema,
  UpdateRankHistorySchema,
} from '../rank-history.js';

const UUID = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO = '2026-05-24T08:00:00.000Z';

describe('CreateRankHistorySchema', () => {
  it('accepts a minimal external entry', () => {
    expect(
      CreateRankHistorySchema.safeParse({
        rankId: UUID,
        date: '2024-09-01',
      }).success,
    ).toBe(true);
  });

  it('accepts a full external entry', () => {
    expect(
      CreateRankHistorySchema.safeParse({
        rankId: UUID,
        shogoTitle: 'kyoshi',
        date: '2024-09-01',
        examinerName: 'Sensei Tanaka',
        organisationName: 'Kobe Dojo',
        notes: 'Strong performance on kata.',
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      CreateRankHistorySchema.safeParse({ rankId: UUID, date: '2024-13-99' }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid rankId', () => {
    expect(
      CreateRankHistorySchema.safeParse({ rankId: 'nope', date: '2024-09-01' }).success,
    ).toBe(false);
  });

  it('rejects notes longer than 5000 chars', () => {
    expect(
      CreateRankHistorySchema.safeParse({
        rankId: UUID,
        date: '2024-09-01',
        notes: 'x'.repeat(5001),
      }).success,
    ).toBe(false);
  });
});

describe('UpdateRankHistorySchema', () => {
  it('accepts an empty patch', () => {
    expect(UpdateRankHistorySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a notes-only patch', () => {
    expect(UpdateRankHistorySchema.safeParse({ notes: 'updated' }).success).toBe(true);
  });

  it('accepts an explicit null on a nullable field', () => {
    expect(UpdateRankHistorySchema.safeParse({ shogoTitle: null }).success).toBe(true);
  });
});

describe('RankHistorySchema', () => {
  it('accepts a full read row', () => {
    expect(
      RankHistorySchema.safeParse({
        id: UUID,
        userId: 'u-1',
        rankId: UUID,
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
        createdAt: ISO,
        updatedAt: null,
        updatedByUserId: null,
      }).success,
    ).toBe(true);
  });
});

describe('GradingHistoryRowSchema', () => {
  it('accepts a fully-hydrated projection row', () => {
    expect(
      GradingHistoryRowSchema.safeParse({
        id: UUID,
        source: 'external',
        userId: 'u-1',
        rankId: UUID,
        shogoTitle: null,
        date: '2024-09-01',
        result: 'pass',
        notes: null,
        examiner: 'Sensei Tanaka',
        organisationName: 'Kobe Dojo',
        verified: true,
        verifiedBy: { id: 'u-sys', name: 'Sysadmin' },
        verifiedAt: ISO,
        canVerify: false,
        canEdit: true,
        updatedAt: null,
        updatedByUserId: null,
      }).success,
    ).toBe(true);
  });
});

describe('GradingHistoryResponseSchema', () => {
  it('accepts an empty response', () => {
    expect(GradingHistoryResponseSchema.safeParse({ data: [] }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter @repo/contracts test
```

Expected: FAIL — `rank-history.test.ts` can't import `../rank-history.js`.

- [ ] **Step 3: Create `rank-history.ts`**

Create `packages/contracts/src/rank-history.ts`:

```ts
import { z } from './zod-openapi.js';

const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO_DATETIME_EXAMPLE = '2026-05-24T08:00:00.000Z';

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD form.')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Date is not a real calendar date.');

export const RankHistoryResultSchema = z.enum(['pass', 'fail']).meta({
  id: 'RankHistoryResult',
  description: 'Outcome of a grading: pass or fail.',
});

export type RankHistoryResult = z.infer<typeof RankHistoryResultSchema>;

export const RankHistorySourceSchema = z.enum(['event', 'external']).meta({
  id: 'RankHistorySource',
  description: 'Origin of a rank-history row: a grading event or a manual external entry.',
});

export type RankHistorySource = z.infer<typeof RankHistorySourceSchema>;

/**
 * Payload for creating a manual external rank-history entry. The server
 * stamps `source='external'`, `result='pass'`, `recordedByUserId=actor`,
 * `verified=false`, and `eventId=null`.
 */
export const CreateRankHistorySchema = z
  .object({
    rankId: z.string().uuid(),
    shogoTitle: z.string().min(1).max(50).nullable().optional(),
    date: DateStringSchema,
    examinerName: z.string().max(200).nullable().optional(),
    organisationName: z.string().max(200).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .meta({
    id: 'CreateRankHistoryInput',
    description: 'Create-external-rank-history payload.',
  });

export type CreateRankHistoryInput = z.infer<typeof CreateRankHistorySchema>;

/**
 * Patch for updating an external rank-history entry. Touching `rankId`,
 * `date`, or `shogoTitle` on a verified row clears its verification atomically
 * (service-layer rule).
 */
export const UpdateRankHistorySchema = z
  .object({
    rankId: z.string().uuid().optional(),
    shogoTitle: z.string().min(1).max(50).nullable().optional(),
    date: DateStringSchema.optional(),
    examinerName: z.string().max(200).nullable().optional(),
    organisationName: z.string().max(200).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .meta({
    id: 'UpdateRankHistoryInput',
    description: 'Update-external-rank-history patch.',
  });

export type UpdateRankHistoryInput = z.infer<typeof UpdateRankHistorySchema>;

/**
 * Full read-row shape for a single `rank_history` record. Used by the
 * direct `GET /api/rank-history/:userId` admin endpoint (no projection
 * hydration). The unified projection uses `GradingHistoryRowSchema` instead.
 */
export const RankHistorySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string(),
    rankId: z.string().uuid(),
    shogoTitle: z.string().nullable(),
    date: DateStringSchema,
    result: RankHistoryResultSchema,
    source: RankHistorySourceSchema,
    eventId: z.string().uuid().nullable(),
    recordedByUserId: z.string(),
    examinerName: z.string().nullable(),
    organisationName: z.string().nullable(),
    notes: z.string().nullable(),
    verified: z.boolean(),
    verifiedByUserId: z.string().nullable(),
    verifiedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().nullable(),
    updatedByUserId: z.string().nullable(),
  })
  .meta({
    id: 'RankHistory',
    description: 'A single grading record (external or event-sourced).',
    example: {
      id: UUID_EXAMPLE,
      userId: 'u-1',
      rankId: UUID_EXAMPLE,
      shogoTitle: null,
      date: '2024-09-01',
      result: 'pass',
      source: 'external',
      eventId: null,
      recordedByUserId: 'u-1',
      examinerName: 'Sensei Tanaka',
      organisationName: 'Kobe Dojo',
      notes: null,
      verified: false,
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: ISO_DATETIME_EXAMPLE,
      updatedAt: null,
      updatedByUserId: null,
    },
  });

export type RankHistory = z.infer<typeof RankHistorySchema>;

/**
 * One row of the unified `GET /api/grading-events/history/:userId` projection.
 * Examiner and organisationName are hydrated server-side (from the event
 * join when `source='event'`; from row columns when `source='external'`).
 * `canVerify` / `canEdit` are per-row capability flags computed for the
 * current actor.
 */
export const GradingHistoryRowSchema = z
  .object({
    id: z.string().uuid(),
    source: RankHistorySourceSchema,
    userId: z.string(),
    rankId: z.string().uuid(),
    shogoTitle: z.string().nullable(),
    date: DateStringSchema,
    result: RankHistoryResultSchema,
    notes: z.string().nullable(),
    examiner: z.string().nullable(),
    organisationName: z.string().nullable(),
    verified: z.boolean(),
    verifiedBy: z
      .object({ id: z.string(), name: z.string() })
      .nullable(),
    verifiedAt: z.string().datetime().nullable(),
    canVerify: z.boolean(),
    canEdit: z.boolean(),
    updatedAt: z.string().datetime().nullable(),
    updatedByUserId: z.string().nullable(),
  })
  .meta({
    id: 'GradingHistoryRow',
    description: 'One unified-projection row including per-actor capability flags.',
  });

export type GradingHistoryRow = z.infer<typeof GradingHistoryRowSchema>;

export const GradingHistoryResponseSchema = z
  .object({
    data: GradingHistoryRowSchema.array(),
  })
  .meta({
    id: 'GradingHistoryResponse',
    description: 'Response envelope for the unified grading-history projection.',
  });

export type GradingHistoryResponse = z.infer<typeof GradingHistoryResponseSchema>;

export const RankHistoryOpenApiRegistry = {
  RankHistoryResult: RankHistoryResultSchema,
  RankHistorySource: RankHistorySourceSchema,
  RankHistory: RankHistorySchema,
  CreateRankHistoryInput: CreateRankHistorySchema,
  UpdateRankHistoryInput: UpdateRankHistorySchema,
  GradingHistoryRow: GradingHistoryRowSchema,
  GradingHistoryResponse: GradingHistoryResponseSchema,
} as const;
```

- [ ] **Step 4: Add the `./rank-history` subpath export to `package.json`**

In `packages/contracts/package.json`, inside `"exports"`, add the entry after `"./shogo-titles"`:

```json
    "./rank-history": {
      "import": {
        "types": "./dist/rank-history.d.ts",
        "default": "./dist/rank-history.js"
      },
      "require": {
        "types": "./dist/rank-history.d.cts",
        "default": "./dist/rank-history.cjs"
      }
    }
```

- [ ] **Step 5: Add the `rank-history` entry to `tsup.config.ts`**

In `packages/contracts/tsup.config.ts`, add after the `shogo-titles` line:

```ts
    'rank-history': 'src/rank-history.ts',
```

- [ ] **Step 6: Re-export from the package root**

In `packages/contracts/src/index.ts`, append:

```ts
export * from './rank-history.js';
```

- [ ] **Step 7: Build and test**

```
pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test
```

Expected: PASS — tsup writes `dist/rank-history.*`; `rank-history.test.ts` passes all 12 cases.

- [ ] **Step 8: Commit**

```
git add packages/contracts/src/rank-history.ts packages/contracts/src/__tests__/rank-history.test.ts packages/contracts/package.json packages/contracts/tsup.config.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): rank-history schemas + grading-history projection row"
```

---

### Task 3: Contracts — routes, CASL subjects, OpenAPI wiring

**Files:**
- Modify: `packages/contracts/src/routes.ts`
- Modify: `packages/contracts/src/casl.ts`
- Modify: `packages/contracts/src/openapi.ts`
- Modify (if needed): `packages/contracts/src/__tests__/casl.test.ts`

- [ ] **Step 1: Add the four route consts**

In `packages/contracts/src/routes.ts`, add four new consts after `MembershipsRoutes`:

```ts
export const BeltSystemsRoutes = {
  base: '/api/belt-systems',
  byId: (id: string) => `/api/belt-systems/${id}` as const,
} as const;

export const BeltRanksRoutes = {
  base: '/api/ranks',
  byId: (id: string) => `/api/ranks/${id}` as const,
} as const;

export const ShogoTitlesRoutes = {
  base: '/api/shogo-titles',
  byCode: (code: string) => `/api/shogo-titles/${code}` as const,
} as const;

export const RankHistoryRoutes = {
  byUser: (userId: string) => `/api/rank-history/${userId}` as const,
  byId: (id: string) => `/api/rank-history/${id}` as const,
  verify: (id: string) => `/api/rank-history/${id}/verify` as const,
  unverify: (id: string) => `/api/rank-history/${id}/unverify` as const,
  unifiedForUser: (userId: string) => `/api/grading-events/history/${userId}` as const,
} as const;
```

- [ ] **Step 2: Extend `SubjectSchema` and add the four `*SubjectShape` types**

In `packages/contracts/src/casl.ts`, replace the `SubjectSchema` `z.enum([...])` array with the extended list:

```ts
export const SubjectSchema = z
  .enum([
    'User',
    'Organisation',
    'AuditLog',
    'OrganisationMembership',
    'BeltSystem',
    'BeltRank',
    'RankHistory',
    'ShogoTitle',
    'all',
  ])
  .meta({
    id: 'Subject',
    description:
      'A CASL subject (noun) the user can act upon. `all` is the wildcard covering every subject.',
    example: 'Organisation',
  });
```

Add four new `*SubjectShape` types after `OrganisationMembershipSubjectShape`:

```ts
export type BeltSystemSubjectShape = {
  readonly __caslSubjectType__: 'BeltSystem';
  id?: string;
  organisationId?: string | null;
};

export type BeltRankSubjectShape = {
  readonly __caslSubjectType__: 'BeltRank';
  id?: string;
  systemId?: string;
  organisationId?: string | null;
};

export type RankHistorySubjectShape = {
  readonly __caslSubjectType__: 'RankHistory';
  id?: string;
  userId?: string;
  source?: 'event' | 'external';
  recordedByUserId?: string;
};

export type ShogoTitleSubjectShape = {
  readonly __caslSubjectType__: 'ShogoTitle';
  code?: string;
};
```

Extend the `AppSubject` union to include the four new shapes:

```ts
export type AppSubject =
  | AppSubjectName
  | UserSubjectShape
  | OrganisationSubjectShape
  | AuditLogSubjectShape
  | OrganisationMembershipSubjectShape
  | BeltSystemSubjectShape
  | BeltRankSubjectShape
  | RankHistorySubjectShape
  | ShogoTitleSubjectShape;
```

- [ ] **Step 3: Update `casl.test.ts` only if it asserts an exact subject list**

Read `packages/contracts/src/__tests__/casl.test.ts`. If it asserts the exact length of `SubjectSchema.options` or pins the array shape, update the expected length to `9` and append the four new names to any explicit-array assertion. If it uses `expect.arrayContaining([...])`, no change is needed; state which case applied in the commit message.

- [ ] **Step 4: Wire the four new registries into `openapi.ts`**

In `packages/contracts/src/openapi.ts`, replace the existing import block (the alphabetised registry imports) with the extended set:

```ts
import { AuditLogOpenApiRegistry } from './audit-log.js';
import { AuthOpenApiRegistry } from './auth.js';
import { BeltRanksOpenApiRegistry } from './ranks.js';
import { BeltSystemsOpenApiRegistry } from './belt-systems.js';
import { ErrorEnvelopeOpenApiRegistry } from './errors.js';
import { OrganisationsOpenApiRegistry } from './organisations.js';
import { ProfileOpenApiRegistry } from './profile.js';
import { RankHistoryOpenApiRegistry } from './rank-history.js';
import { ShogoTitlesOpenApiRegistry } from './shogo-titles.js';
import { UsersOpenApiRegistry } from './users.js';
```

Append the four new registries to the default `registries` array in `registerContractSchemas` (after `ProfileOpenApiRegistry`):

```ts
    ProfileOpenApiRegistry,
    BeltSystemsOpenApiRegistry,
    BeltRanksOpenApiRegistry,
    ShogoTitlesOpenApiRegistry,
    RankHistoryOpenApiRegistry,
```

Extend `ContractRegistries`:

```ts
export const ContractRegistries = {
  errors: ErrorEnvelopeOpenApiRegistry,
  auth: AuthOpenApiRegistry,
  users: UsersOpenApiRegistry,
  organisations: OrganisationsOpenApiRegistry,
  auditLog: AuditLogOpenApiRegistry,
  profile: ProfileOpenApiRegistry,
  beltSystems: BeltSystemsOpenApiRegistry,
  beltRanks: BeltRanksOpenApiRegistry,
  shogoTitles: ShogoTitlesOpenApiRegistry,
  rankHistory: RankHistoryOpenApiRegistry,
} as const;
```

- [ ] **Step 5: Build, typecheck, test**

```
pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts typecheck && pnpm --filter @repo/contracts test
```

Expected: PASS — build exits 0; typecheck reports 0 errors; all tests stay green.

- [ ] **Step 6: Commit**

```
git add packages/contracts/src/routes.ts packages/contracts/src/casl.ts packages/contracts/src/openapi.ts packages/contracts/src/__tests__/casl.test.ts
git commit -m "feat(contracts): belt/rank/shogo routes + 4 new CASL subjects + OpenAPI wiring"
```

---

### Task 4: DB — migration 0011 (belt catalog + rank-history + user_profile.shogo_title)

**Files:**
- Create: `apps/backend/src/infrastructure/database/schema/belt-systems.ts`
- Create: `apps/backend/src/infrastructure/database/schema/belt-ranks.ts`
- Create: `apps/backend/src/infrastructure/database/schema/shogo-titles.ts`
- Create: `apps/backend/src/infrastructure/database/schema/rank-history.ts`
- Modify: `apps/backend/src/infrastructure/database/schema/user-profile.ts`
- Modify: `apps/backend/src/infrastructure/database/schema/index.ts`
- Create: `apps/backend/drizzle/0011_*.sql` (generated)
- Create: `apps/backend/drizzle/meta/0011_snapshot.json` (generated)
- Modify: `apps/backend/drizzle/meta/_journal.json` (generated)

- [ ] **Step 1: Create the `belt_systems` schema file**

Create `apps/backend/src/infrastructure/database/schema/belt-systems.ts`:

```ts
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { organisations } from './organisations.js';

/**
 * A family of belt ranks (Kyu, Dan, Mon). `organisation_id` NULL means the
 * system is global; non-null means it is private to that organisation. The
 * unique index lets two organisations both define their own `kyu` system.
 */
export const beltSystems = pgTable(
  'belt_systems',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    nameEn: text('name_en').notNull(),
    nameSv: text('name_sv').notNull(),
    nameFi: text('name_fi').notNull(),
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'cascade',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgCodeUnique: uniqueIndex('belt_systems_organisation_id_code_unique').on(
      table.organisationId,
      table.code,
    ),
    orgIdx: index('belt_systems_organisation_id_idx').on(table.organisationId),
  }),
);

export type DbBeltSystem = typeof beltSystems.$inferSelect;
export type DbNewBeltSystem = typeof beltSystems.$inferInsert;
```

- [ ] **Step 2: Create the `belt_ranks` schema file**

Create `apps/backend/src/infrastructure/database/schema/belt-ranks.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { beltSystems } from './belt-systems.js';
import { organisations } from './organisations.js';

/**
 * A specific rank inside a system (5th Kyu, 3rd Dan). `level` ascends within
 * the system (1 = lowest). `next_rank_id` is an explicit override for the
 * ladder; the service rejects self-references. `slug` is required at the DB
 * level when `publicly_visible = true` (CHECK constraint) and is globally
 * unique among non-null values (partial unique index).
 */
export const beltRanks = pgTable(
  'belt_ranks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: uuid('organisation_id').references(() => organisations.id, {
      onDelete: 'cascade',
    }),
    systemId: uuid('system_id')
      .notNull()
      .references(() => beltSystems.id, { onDelete: 'restrict' }),
    level: integer('level').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    nameJa: text('name_ja'),
    nameRomaji: text('name_romaji').notNull(),
    nameEn: text('name_en').notNull().default(''),
    nameSv: text('name_sv').notNull().default(''),
    nameFi: text('name_fi').notNull().default(''),
    beltColor: text('belt_color').notNull(),
    imageUrl: text('image_url'),
    descriptionEn: text('description_en'),
    descriptionSv: text('description_sv'),
    descriptionFi: text('description_fi'),
    publiclyVisible: boolean('publicly_visible').notNull().default(false),
    slug: text('slug'),
    minAge: integer('min_age'),
    nextRankId: uuid('next_rank_id').references((): AnyPgColumn => beltRanks.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgSystemLevelUnique: uniqueIndex('belt_ranks_organisation_system_level_unique').on(
      table.organisationId,
      table.systemId,
      table.level,
    ),
    systemIdx: index('belt_ranks_system_id_idx').on(table.systemId),
    orgIdx: index('belt_ranks_organisation_id_idx').on(table.organisationId),
    // Partial unique on slug — only enforced where slug is set.
    slugUnique: uniqueIndex('belt_ranks_slug_unique')
      .on(table.slug)
      .where(sql`${table.slug} IS NOT NULL`),
    slugRequiredWhenPublic: check(
      'belt_ranks_slug_required_when_public',
      sql`NOT ${table.publiclyVisible} OR (${table.slug} IS NOT NULL AND ${table.slug} <> '')`,
    ),
  }),
);

export type DbBeltRank = typeof beltRanks.$inferSelect;
export type DbNewBeltRank = typeof beltRanks.$inferInsert;
```

- [ ] **Step 3: Create the `shogo_titles` schema file**

Create `apps/backend/src/infrastructure/database/schema/shogo-titles.ts`:

```ts
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { beltRanks } from './belt-ranks.js';

/**
 * Honorary titles overlaid on Dan ranks. `code` is the natural primary key
 * (referenced by `rank_history.shogo_title` and `user_profile.shogo_title`).
 * `sort_order` ranks the titles for the "highest verified shogo" recompute.
 */
export const shogoTitles = pgTable('shogo_titles', {
  code: text('code').primaryKey(),
  nameEn: text('name_en').notNull(),
  nameSv: text('name_sv').notNull(),
  nameFi: text('name_fi').notNull(),
  nameJa: text('name_ja').notNull(),
  minRankId: uuid('min_rank_id')
    .notNull()
    .references(() => beltRanks.id, { onDelete: 'restrict' }),
  sortOrder: integer('sort_order').notNull().default(0),
});

export type DbShogoTitle = typeof shogoTitles.$inferSelect;
export type DbNewShogoTitle = typeof shogoTitles.$inferInsert;
```

- [ ] **Step 4: Create the `rank_history` schema file**

Create `apps/backend/src/infrastructure/database/schema/rank-history.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { beltRanks } from './belt-ranks.js';
import { shogoTitles } from './shogo-titles.js';
import { user } from './users.js';

export const rankHistoryResult = pgEnum('rank_history_result', ['pass', 'fail']);
export const rankHistorySource = pgEnum('rank_history_source', ['event', 'external']);

/**
 * The unified log of every grading. `event_id` is a uuid with no FK constraint
 * in v1 (the `grading_events` table does not exist yet — followup D1); the
 * partial unique index still prevents double-mirroring an event for the same
 * user. Two CHECK constraints encode the source/event-id consistency and the
 * verification-triple atomicity invariants from spec §4.4.
 */
export const rankHistory = pgTable(
  'rank_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rankId: uuid('rank_id')
      .notNull()
      .references(() => beltRanks.id, { onDelete: 'restrict' }),
    shogoTitle: text('shogo_title').references(() => shogoTitles.code, {
      onDelete: 'restrict',
    }),
    date: date('date', { mode: 'string' }).notNull(),
    result: rankHistoryResult('result').notNull(),
    source: rankHistorySource('source').notNull(),
    // No FK constraint at v1; added by followup D1 when grading_events ships.
    eventId: uuid('event_id'),
    recordedByUserId: text('recorded_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    examinerName: text('examiner_name'),
    organisationName: text('organisation_name'),
    notes: text('notes'),
    verified: boolean('verified').notNull().default(false),
    verifiedByUserId: text('verified_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    eventUserUnique: uniqueIndex('rank_history_event_id_user_id_unique')
      .on(table.eventId, table.userId)
      .where(sql`${table.eventId} IS NOT NULL`),
    userDateIdx: index('rank_history_user_id_date_idx').on(table.userId, table.date),
    rankIdx: index('rank_history_rank_id_idx').on(table.rankId),
    verifiedIdx: index('rank_history_verified_idx').on(table.verified),
    sourceEventConsistency: check(
      'rank_history_source_event_consistency',
      sql`(${table.source} = 'event' AND ${table.eventId} IS NOT NULL)
          OR (${table.source} = 'external' AND ${table.eventId} IS NULL)`,
    ),
    verifiedTripleConsistency: check(
      'rank_history_verified_triple_consistency',
      sql`(${table.verified} = false AND ${table.verifiedByUserId} IS NULL AND ${table.verifiedAt} IS NULL)
          OR (${table.verified} = true AND ${table.verifiedByUserId} IS NOT NULL AND ${table.verifiedAt} IS NOT NULL)`,
    ),
  }),
);

export type DbRankHistory = typeof rankHistory.$inferSelect;
export type DbNewRankHistory = typeof rankHistory.$inferInsert;
```

- [ ] **Step 5: Extend `user_profile` with `shogo_title`**

In `apps/backend/src/infrastructure/database/schema/user-profile.ts`, add an import for `shogoTitles`:

```ts
import { shogoTitles } from './shogo-titles.js';
```

Add the new column inside the `pgTable('user_profile', { … })` object, immediately after `citizenships`:

```ts
    citizenships: text('citizenships').array().notNull().default([]),
    shogoTitle: text('shogo_title').references(() => shogoTitles.code, {
      onDelete: 'set null',
    }),
```

- [ ] **Step 6: Re-export the new schema files from the barrel**

In `apps/backend/src/infrastructure/database/schema/index.ts`, append four re-exports after `./user-profile.js`:

```ts
export * from './user-profile.js';
export * from './belt-systems.js';
export * from './belt-ranks.js';
export * from './shogo-titles.js';
export * from './rank-history.js';
```

- [ ] **Step 7: Generate the migration**

```
pnpm --filter backend db:generate
```

Expected: PASS — drizzle-kit prints `[✓] Your SQL migration file ➜ drizzle/0011_<adjective_noun>.sql 🚀`. The generated SQL contains:
- `CREATE TYPE "public"."rank_history_result" AS ENUM('pass', 'fail');`
- `CREATE TYPE "public"."rank_history_source" AS ENUM('event', 'external');`
- `CREATE TABLE "belt_systems" (…)` with the unique index on `(organisation_id, code)`.
- `CREATE TABLE "belt_ranks" (…)` with the self-FK on `next_rank_id`, the partial unique index on `slug`, and the `belt_ranks_slug_required_when_public` CHECK.
- `CREATE TABLE "shogo_titles" (…)` with `code` as the PK and `min_rank_id` FK.
- `CREATE TABLE "rank_history" (…)` with the partial unique index on `(event_id, user_id)` and both CHECK constraints.
- `ALTER TABLE "user_profile" ADD COLUMN "shogo_title" text;` plus the FK.

If drizzle-kit decides to drop or rename anything unexpected, abort and inspect — the migration should be additive only.

- [ ] **Step 8: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0; the new tables and the extended `userProfile` compile.

- [ ] **Step 9: Commit**

```
git add apps/backend/src/infrastructure/database/schema/belt-systems.ts apps/backend/src/infrastructure/database/schema/belt-ranks.ts apps/backend/src/infrastructure/database/schema/shogo-titles.ts apps/backend/src/infrastructure/database/schema/rank-history.ts apps/backend/src/infrastructure/database/schema/user-profile.ts apps/backend/src/infrastructure/database/schema/index.ts apps/backend/drizzle/0011_*.sql apps/backend/drizzle/meta/0011_snapshot.json apps/backend/drizzle/meta/_journal.json
git commit -m "feat(db): migration 0011 — belt catalog + rank_history + user_profile.shogo_title"
```

---

### Task 5: Backend — `BeltSystemsRepository`

**Files:**
- Create: `apps/backend/src/modules/belt-catalog/belt-systems.repository.ts`

- [ ] **Step 1: Create the repository**

Create `apps/backend/src/modules/belt-catalog/belt-systems.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  beltRanks,
  beltSystems,
  type DbBeltSystem,
  type DbNewBeltSystem,
} from '../../infrastructure/database/schema/index.js';

/** Writeable subset of `belt_systems` columns. `id`, `createdAt`, `updatedAt` are managed here. */
export type BeltSystemPatch = Partial<
  Pick<DbBeltSystem, 'code' | 'nameEn' | 'nameSv' | 'nameFi' | 'organisationId' | 'sortOrder'>
>;

@Injectable()
export class BeltSystemsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string, tx?: DrizzleExecutor): Promise<DbBeltSystem | null> {
    const conn = tx ?? this.db;
    const rows = await conn.select().from(beltSystems).where(eq(beltSystems.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findAll(tx?: DrizzleExecutor): Promise<DbBeltSystem[]> {
    const conn = tx ?? this.db;
    return conn.select().from(beltSystems).orderBy(beltSystems.sortOrder, beltSystems.nameEn);
  }

  /**
   * Look up a system by `(organisation_id, code)`. `organisationId` may be
   * `null` to find a global system; the eq/isNull split keeps the SQL valid.
   */
  async findByCode(
    organisationId: string | null,
    code: string,
    tx?: DrizzleExecutor,
  ): Promise<DbBeltSystem | null> {
    const conn = tx ?? this.db;
    const orgFilter = organisationId === null
      ? isNull(beltSystems.organisationId)
      : eq(beltSystems.organisationId, organisationId);
    const rows = await conn
      .select()
      .from(beltSystems)
      .where(and(orgFilter, eq(beltSystems.code, code)))
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(input: DbNewBeltSystem, tx?: DrizzleExecutor): Promise<DbBeltSystem> {
    const conn = tx ?? this.db;
    const rows = await conn.insert(beltSystems).values(input).returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(
    id: string,
    patch: BeltSystemPatch,
    tx?: DrizzleExecutor,
  ): Promise<DbBeltSystem | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(beltSystems)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(beltSystems.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string, tx?: DrizzleExecutor): Promise<boolean> {
    const conn = tx ?? this.db;
    const rows = await conn
      .delete(beltSystems)
      .where(eq(beltSystems.id, id))
      .returning({ id: beltSystems.id });
    return rows.length > 0;
  }

  /** Count ranks that reference this system — the system-delete guard. */
  async countRanksUsingSystem(systemId: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(beltRanks)
      .where(eq(beltRanks.systemId, systemId));
    return Number(rows[0]?.value ?? 0);
  }
}
```

- [ ] **Step 2: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0.

- [ ] **Step 3: Commit**

```
git add apps/backend/src/modules/belt-catalog/belt-systems.repository.ts
git commit -m "feat(backend): BeltSystemsRepository — CRUD + countRanksUsingSystem delete guard"
```

---

### Task 6: Backend — `BeltSystemsService` + spec

**Files:**
- Create: `apps/backend/src/modules/belt-catalog/belt-systems.service.ts`
- Create: `apps/backend/src/modules/belt-catalog/belt-systems.service.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `apps/backend/src/modules/belt-catalog/belt-systems.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BeltSystemsRepository } from './belt-systems.repository.js';
import { BeltSystemsService } from './belt-systems.service.js';

const sysadmin = {
  id: 'u-sys',
  email: 'sys@example.com',
  emailVerified: true,
  name: 'Sys',
  image: null,
  role: 'sysadmin' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

const ROW = {
  id: 's-1',
  code: 'kyu',
  nameEn: 'Kyu',
  nameSv: 'Kyu',
  nameFi: 'Kyu',
  organisationId: null,
  sortOrder: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function repoStub() {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findByCode: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countRanksUsingSystem: vi.fn().mockResolvedValue(0),
  } satisfies Record<keyof BeltSystemsRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(repo: ReturnType<typeof repoStub>) {
  const module = await Test.createTestingModule({
    providers: [
      BeltSystemsService,
      { provide: BeltSystemsRepository, useValue: repo },
    ],
  }).compile();
  return module.get(BeltSystemsService);
}

describe('BeltSystemsService', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: BeltSystemsService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('list returns the API shape', async () => {
    repo.findAll.mockResolvedValue([ROW]);
    const out = await service.list();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 's-1', code: 'kyu' });
    expect(out[0]).toHaveProperty('createdAt');
    expect(typeof out[0]?.createdAt).toBe('string');
  });

  it('findById 404s when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
  });

  it('create persists the input and returns the API shape', async () => {
    repo.insert.mockResolvedValue(ROW);
    const out = await service.create(
      { code: 'kyu', nameEn: 'Kyu', nameSv: 'Kyu', nameFi: 'Kyu', sortOrder: 1 },
      sysadmin,
    );
    expect(repo.insert).toHaveBeenCalledTimes(1);
    expect(out.id).toBe('s-1');
  });

  it('update 404s when missing', async () => {
    repo.update.mockResolvedValue(null);
    await expect(service.update('nope', { sortOrder: 9 }, sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delete 404s when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.delete('nope')).rejects.toThrow(NotFoundException);
  });

  it('delete refuses with SYSTEM_IN_USE when ranks reference the system', async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.countRanksUsingSystem.mockResolvedValue(3);
    await expect(service.delete('s-1')).rejects.toThrow(ConflictException);
  });

  it('delete succeeds when no ranks reference the system', async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.countRanksUsingSystem.mockResolvedValue(0);
    repo.delete.mockResolvedValue(true);
    await service.delete('s-1');
    expect(repo.delete).toHaveBeenCalledWith('s-1');
  });
});
```

- [ ] **Step 2: Run the spec — expect FAIL**

```
pnpm --filter backend test
```

Expected: FAIL — `belt-systems.service.spec.ts` can't import `./belt-systems.service.js`.

- [ ] **Step 3: Create the service**

Create `apps/backend/src/modules/belt-catalog/belt-systems.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BeltSystem,
  CreateBeltSystemInput,
  UpdateBeltSystemInput,
} from '@repo/contracts/belt-systems';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbBeltSystem } from '../../infrastructure/database/schema/index.js';

import { BeltSystemsRepository } from './belt-systems.repository.js';

@Injectable()
export class BeltSystemsService {
  constructor(private readonly repo: BeltSystemsRepository) {}

  async list(): Promise<BeltSystem[]> {
    const rows = await this.repo.findAll();
    return rows.map((r) => this.toApi(r));
  }

  async findById(id: string): Promise<BeltSystem> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Belt system ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  async create(input: CreateBeltSystemInput, _actor: AuthenticatedUser): Promise<BeltSystem> {
    const row = await this.repo.insert({
      code: input.code,
      nameEn: input.nameEn,
      nameSv: input.nameSv,
      nameFi: input.nameFi,
      organisationId: input.organisationId ?? null,
      sortOrder: input.sortOrder ?? 0,
    });
    return this.toApi(row);
  }

  async update(
    id: string,
    input: UpdateBeltSystemInput,
    _actor: AuthenticatedUser,
  ): Promise<BeltSystem> {
    const patch: Partial<DbBeltSystem> = {};
    if ('code' in input) patch.code = input.code!;
    if ('nameEn' in input) patch.nameEn = input.nameEn!;
    if ('nameSv' in input) patch.nameSv = input.nameSv!;
    if ('nameFi' in input) patch.nameFi = input.nameFi!;
    if ('organisationId' in input) patch.organisationId = input.organisationId ?? null;
    if ('sortOrder' in input) patch.sortOrder = input.sortOrder!;

    const row = await this.repo.update(id, patch);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Belt system ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Belt system ${id} not found.` },
      });
    }
    const inUse = await this.repo.countRanksUsingSystem(id);
    if (inUse > 0) {
      throw new ConflictException({
        error: {
          code: 'SYSTEM_IN_USE',
          message: `Cannot delete: ${inUse} rank(s) still reference this system.`,
        },
      });
    }
    await this.repo.delete(id);
  }

  private toApi(row: DbBeltSystem): BeltSystem {
    return {
      id: row.id,
      code: row.code,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      organisationId: row.organisationId,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run the spec — expect PASS**

```
pnpm --filter backend test
```

Expected: PASS — `belt-systems.service.spec.ts` passes all 7 cases.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/modules/belt-catalog/belt-systems.service.ts apps/backend/src/modules/belt-catalog/belt-systems.service.spec.ts
git commit -m "feat(backend): BeltSystemsService — CRUD + SYSTEM_IN_USE delete guard"
```

---

### Task 7: Backend — `BeltSystemsController` + DTOs

**Files:**
- Create: `apps/backend/src/modules/belt-catalog/dto/belt-system.dto.ts`
- Create: `apps/backend/src/modules/belt-catalog/dto/create-belt-system.dto.ts`
- Create: `apps/backend/src/modules/belt-catalog/dto/update-belt-system.dto.ts`
- Create: `apps/backend/src/modules/belt-catalog/belt-systems.controller.ts`

- [ ] **Step 1: Create the DTOs**

Create `apps/backend/src/modules/belt-catalog/dto/belt-system.dto.ts`:

```ts
import { BeltSystemSchema } from '@repo/contracts/belt-systems';
import { createZodDto } from 'nestjs-zod';
export class BeltSystemDto extends createZodDto(BeltSystemSchema) {}
```

Create `apps/backend/src/modules/belt-catalog/dto/create-belt-system.dto.ts`:

```ts
import { CreateBeltSystemSchema } from '@repo/contracts/belt-systems';
import { createZodDto } from 'nestjs-zod';
export class CreateBeltSystemDto extends createZodDto(CreateBeltSystemSchema) {}
```

Create `apps/backend/src/modules/belt-catalog/dto/update-belt-system.dto.ts`:

```ts
import { UpdateBeltSystemSchema } from '@repo/contracts/belt-systems';
import { createZodDto } from 'nestjs-zod';
export class UpdateBeltSystemDto extends createZodDto(UpdateBeltSystemSchema) {}
```

- [ ] **Step 2: Create the controller**

Create `apps/backend/src/modules/belt-catalog/belt-systems.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { BeltSystem } from '@repo/contracts/belt-systems';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { BeltSystemDto } from './dto/belt-system.dto.js';
import { CreateBeltSystemDto } from './dto/create-belt-system.dto.js';
import { UpdateBeltSystemDto } from './dto/update-belt-system.dto.js';
import { BeltSystemsService } from './belt-systems.service.js';

@ApiTags('belt-systems')
@ApiCookieAuth('session')
@Controller('belt-systems')
export class BeltSystemsController {
  constructor(private readonly systems: BeltSystemsService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List belt systems.',
    operationId: 'BeltSystemsController_list',
    errorType: ErrorEnvelopeDto,
    errors: ['401'],
  })
  list(): Promise<BeltSystem[]> {
    return this.systems.list();
  }

  @Post()
  @CheckAbility('manage', 'BeltSystem')
  @ApiBody({ type: CreateBeltSystemDto })
  @ApiCreatedResponse({ type: BeltSystemDto })
  @ApiEndpoint({
    summary: 'Create a belt system (sysadmin only).',
    operationId: 'BeltSystemsController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403'],
  })
  create(
    @Body() body: CreateBeltSystemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BeltSystem> {
    return this.systems.create(body, user);
  }

  @Patch(':id')
  @CheckAbility('manage', 'BeltSystem')
  @ApiParam({ name: 'id', description: 'Belt system UUID.' })
  @ApiBody({ type: UpdateBeltSystemDto })
  @ApiOkResponse({ type: BeltSystemDto })
  @ApiEndpoint({
    summary: 'Update a belt system (sysadmin only).',
    operationId: 'BeltSystemsController_update',
    ok: BeltSystemDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateBeltSystemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BeltSystem> {
    return this.systems.update(id, body, user);
  }

  @Delete(':id')
  @CheckAbility('manage', 'BeltSystem')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Belt system UUID.' })
  @ApiNoContentResponse({ description: 'Belt system deleted.' })
  @ApiEndpoint({
    summary: 'Delete a belt system (sysadmin only).',
    operationId: 'BeltSystemsController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.systems.delete(id);
  }
}
```

- [ ] **Step 3: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0. The `@CheckAbility('manage', 'BeltSystem')` calls type-check because Task 3 extended `SubjectSchema` (`AppSubjectName` now includes `'BeltSystem'`).

- [ ] **Step 4: Commit**

```
git add apps/backend/src/modules/belt-catalog/dto/belt-system.dto.ts apps/backend/src/modules/belt-catalog/dto/create-belt-system.dto.ts apps/backend/src/modules/belt-catalog/dto/update-belt-system.dto.ts apps/backend/src/modules/belt-catalog/belt-systems.controller.ts
git commit -m "feat(backend): BeltSystemsController + DTOs"
```

---

### Task 8: Backend — `BeltRanksRepository`

**Files:**
- Create: `apps/backend/src/modules/belt-catalog/belt-ranks.repository.ts`

- [ ] **Step 1: Create the repository**

Create `apps/backend/src/modules/belt-catalog/belt-ranks.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  beltRanks,
  rankHistory,
  shogoTitles,
  type DbBeltRank,
  type DbNewBeltRank,
} from '../../infrastructure/database/schema/index.js';

/** Writeable subset of `belt_ranks` columns. `id`, `createdAt`, `updatedAt` are managed here. */
export type BeltRankPatch = Partial<
  Pick<
    DbBeltRank,
    | 'organisationId'
    | 'systemId'
    | 'level'
    | 'sortOrder'
    | 'nameJa'
    | 'nameRomaji'
    | 'nameEn'
    | 'nameSv'
    | 'nameFi'
    | 'beltColor'
    | 'imageUrl'
    | 'descriptionEn'
    | 'descriptionSv'
    | 'descriptionFi'
    | 'publiclyVisible'
    | 'slug'
    | 'minAge'
    | 'nextRankId'
  >
>;

@Injectable()
export class BeltRanksRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string, tx?: DrizzleExecutor): Promise<DbBeltRank | null> {
    const conn = tx ?? this.db;
    const rows = await conn.select().from(beltRanks).where(eq(beltRanks.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findAll(tx?: DrizzleExecutor): Promise<DbBeltRank[]> {
    const conn = tx ?? this.db;
    return conn.select().from(beltRanks).orderBy(beltRanks.sortOrder, beltRanks.level);
  }

  /** Lookup by `(system_id, level)` within a scope (org-private or global). */
  async findBySystemAndLevel(
    organisationId: string | null,
    systemId: string,
    level: number,
    tx?: DrizzleExecutor,
  ): Promise<DbBeltRank | null> {
    const conn = tx ?? this.db;
    const orgFilter = organisationId === null
      ? isNull(beltRanks.organisationId)
      : eq(beltRanks.organisationId, organisationId);
    const rows = await conn
      .select()
      .from(beltRanks)
      .where(and(orgFilter, eq(beltRanks.systemId, systemId), eq(beltRanks.level, level)))
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(input: DbNewBeltRank, tx?: DrizzleExecutor): Promise<DbBeltRank> {
    const conn = tx ?? this.db;
    const rows = await conn.insert(beltRanks).values(input).returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(
    id: string,
    patch: BeltRankPatch,
    tx?: DrizzleExecutor,
  ): Promise<DbBeltRank | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(beltRanks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(beltRanks.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string, tx?: DrizzleExecutor): Promise<boolean> {
    const conn = tx ?? this.db;
    const rows = await conn
      .delete(beltRanks)
      .where(eq(beltRanks.id, id))
      .returning({ id: beltRanks.id });
    return rows.length > 0;
  }

  // ---- Rank-delete guard helpers (spec §5 rule 6) ----

  async countHistoryUsingRank(rankId: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(rankHistory)
      .where(eq(rankHistory.rankId, rankId));
    return Number(rows[0]?.value ?? 0);
  }

  async countNextRankPointers(rankId: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(beltRanks)
      .where(eq(beltRanks.nextRankId, rankId));
    return Number(rows[0]?.value ?? 0);
  }

  async countShogosUsingRank(rankId: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(shogoTitles)
      .where(eq(shogoTitles.minRankId, rankId));
    return Number(rows[0]?.value ?? 0);
  }

  // NB: a `countUserProfilesUsingRank` guard is intentionally omitted in v1.
  // It would query `user_profile.current_rank_id`, a column that does not
  // exist until followup D4 lands (the spec's "first phase" ships only
  // `user_profile.shogo_title`). The service-layer delete guard skips this
  // check and a comment in `BeltRanksService.delete` flags it as a v1 no-op
  // pending D4.
}
```

- [ ] **Step 2: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0.

- [ ] **Step 3: Commit**

```
git add apps/backend/src/modules/belt-catalog/belt-ranks.repository.ts
git commit -m "feat(backend): BeltRanksRepository — CRUD + delete-guard helpers"
```

---

### Task 9: Backend — `BeltRanksService` + spec

**Files:**
- Create: `apps/backend/src/modules/belt-catalog/belt-ranks.service.ts`
- Create: `apps/backend/src/modules/belt-catalog/belt-ranks.service.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `apps/backend/src/modules/belt-catalog/belt-ranks.service.spec.ts`:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BeltRanksRepository } from './belt-ranks.repository.js';
import { BeltRanksService } from './belt-ranks.service.js';

const sysadmin = {
  id: 'u-sys',
  email: 'sys@example.com',
  emailVerified: true,
  name: 'Sys',
  image: null,
  role: 'sysadmin' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

const SYSTEM_UUID = '11111111-1111-1111-1111-111111111111';
const RANK_UUID = '22222222-2222-2222-2222-222222222222';

const ROW = {
  id: RANK_UUID,
  organisationId: null,
  systemId: SYSTEM_UUID,
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

function repoStub() {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findBySystemAndLevel: vi.fn().mockResolvedValue(null),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countHistoryUsingRank: vi.fn().mockResolvedValue(0),
    countNextRankPointers: vi.fn().mockResolvedValue(0),
    countShogosUsingRank: vi.fn().mockResolvedValue(0),
  } satisfies Record<keyof BeltRanksRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(repo: ReturnType<typeof repoStub>) {
  const module = await Test.createTestingModule({
    providers: [
      BeltRanksService,
      { provide: BeltRanksRepository, useValue: repo },
    ],
  }).compile();
  return module.get(BeltRanksService);
}

const MIN_CREATE = {
  systemId: SYSTEM_UUID,
  level: 1,
  sortOrder: 10,
  nameJa: null,
  nameRomaji: 'Jukyu',
  nameEn: '10th Kyu',
  nameSv: '10 Kyu',
  nameFi: '10. Kyu',
  beltColor: '#FFFFFF',
  publiclyVisible: false,
  descriptionEn: null,
  descriptionSv: null,
  descriptionFi: null,
};

describe('BeltRanksService — create', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: BeltRanksService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('inserts a rank when (system, level) is free', async () => {
    repo.insert.mockResolvedValue(ROW);
    const out = await service.create(MIN_CREATE, sysadmin);
    expect(out.id).toBe(RANK_UUID);
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });

  it('rejects publiclyVisible:true with no slug (service-layer defence)', async () => {
    await expect(
      service.create({ ...MIN_CREATE, publiclyVisible: true, slug: null }, sysadmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a (system, level) collision', async () => {
    repo.findBySystemAndLevel.mockResolvedValue(ROW);
    await expect(service.create(MIN_CREATE, sysadmin)).rejects.toThrow(ConflictException);
  });
});

describe('BeltRanksService — update', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: BeltRanksService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('404s when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.update(RANK_UUID, { sortOrder: 9 }, sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a nextRankId equal to the row\'s own id (self-reference)', async () => {
    repo.findById.mockResolvedValue(ROW);
    await expect(
      service.update(RANK_UUID, { nextRankId: RANK_UUID }, sysadmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects publiclyVisible:true with no slug', async () => {
    repo.findById.mockResolvedValue(ROW);
    await expect(
      service.update(RANK_UUID, { publiclyVisible: true, slug: null }, sysadmin),
    ).rejects.toThrow(BadRequestException);
  });

  it('updates and returns the API shape', async () => {
    repo.findById.mockResolvedValue(ROW);
    repo.update.mockResolvedValue({ ...ROW, sortOrder: 99 });
    const out = await service.update(RANK_UUID, { sortOrder: 99 }, sysadmin);
    expect(out.sortOrder).toBe(99);
  });
});

describe('BeltRanksService — delete guards (RANK_IN_USE)', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: BeltRanksService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
    repo.findById.mockResolvedValue(ROW);
  });

  it('refuses when rank_history references the rank', async () => {
    repo.countHistoryUsingRank.mockResolvedValue(2);
    await expect(service.delete(RANK_UUID)).rejects.toThrow(ConflictException);
  });

  it('refuses when another rank references it via next_rank_id', async () => {
    repo.countNextRankPointers.mockResolvedValue(1);
    await expect(service.delete(RANK_UUID)).rejects.toThrow(ConflictException);
  });

  it('refuses when a shogo references it via min_rank_id', async () => {
    repo.countShogosUsingRank.mockResolvedValue(1);
    await expect(service.delete(RANK_UUID)).rejects.toThrow(ConflictException);
  });

  it('succeeds when all guards are clear', async () => {
    repo.delete.mockResolvedValue(true);
    await service.delete(RANK_UUID);
    expect(repo.delete).toHaveBeenCalledWith(RANK_UUID);
  });

  it('404s when the rank is missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.delete('nope')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the spec — expect FAIL**

```
pnpm --filter backend test
```

Expected: FAIL — `belt-ranks.service.spec.ts` can't import `./belt-ranks.service.js`.

- [ ] **Step 3: Create the service**

Create `apps/backend/src/modules/belt-catalog/belt-ranks.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BeltRank,
  CreateBeltRankInput,
  UpdateBeltRankInput,
} from '@repo/contracts/ranks';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbBeltRank } from '../../infrastructure/database/schema/index.js';

import { BeltRankPatch, BeltRanksRepository } from './belt-ranks.repository.js';

@Injectable()
export class BeltRanksService {
  constructor(private readonly repo: BeltRanksRepository) {}

  async list(): Promise<BeltRank[]> {
    const rows = await this.repo.findAll();
    return rows.map((r) => this.toApi(r));
  }

  async findById(id: string): Promise<BeltRank> {
    const row = await this.repo.findById(id);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Rank ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  async create(input: CreateBeltRankInput, _actor: AuthenticatedUser): Promise<BeltRank> {
    // Service-layer defence in depth (the Zod refine already covers this).
    if (input.publiclyVisible && (!input.slug || input.slug.length === 0)) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'Slug is required when publicly visible.' },
      });
    }
    const orgId = input.organisationId ?? null;
    const collision = await this.repo.findBySystemAndLevel(orgId, input.systemId, input.level);
    if (collision) {
      throw new ConflictException({
        error: {
          code: 'LEVEL_TAKEN',
          message: `Level ${input.level} is already used in this system.`,
        },
      });
    }

    const row = await this.repo.insert({
      organisationId: orgId,
      systemId: input.systemId,
      level: input.level,
      sortOrder: input.sortOrder ?? 0,
      nameJa: input.nameJa ?? null,
      nameRomaji: input.nameRomaji,
      nameEn: input.nameEn ?? '',
      nameSv: input.nameSv ?? '',
      nameFi: input.nameFi ?? '',
      beltColor: input.beltColor,
      imageUrl: input.imageUrl ?? null,
      descriptionEn: input.descriptionEn ?? null,
      descriptionSv: input.descriptionSv ?? null,
      descriptionFi: input.descriptionFi ?? null,
      publiclyVisible: input.publiclyVisible ?? false,
      slug: input.slug ?? null,
      minAge: input.minAge ?? null,
      nextRankId: input.nextRankId ?? null,
    });
    return this.toApi(row);
  }

  async update(
    id: string,
    input: UpdateBeltRankInput,
    _actor: AuthenticatedUser,
  ): Promise<BeltRank> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Rank ${id} not found.` },
      });
    }

    if ('nextRankId' in input && input.nextRankId === id) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A rank cannot point to itself as nextRankId.',
        },
      });
    }

    const effectivePublic = 'publiclyVisible' in input
      ? input.publiclyVisible
      : existing.publiclyVisible;
    const effectiveSlug = 'slug' in input ? input.slug : existing.slug;
    if (effectivePublic && (!effectiveSlug || effectiveSlug.length === 0)) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'Slug is required when publicly visible.' },
      });
    }

    if ('systemId' in input || 'level' in input || 'organisationId' in input) {
      const orgId =
        'organisationId' in input ? input.organisationId ?? null : existing.organisationId;
      const sysId = 'systemId' in input ? input.systemId! : existing.systemId;
      const lvl = 'level' in input ? input.level! : existing.level;
      const collision = await this.repo.findBySystemAndLevel(orgId, sysId, lvl);
      if (collision && collision.id !== id) {
        throw new ConflictException({
          error: { code: 'LEVEL_TAKEN', message: `Level ${lvl} is already used in this system.` },
        });
      }
    }

    const patch = this.buildPatch(input);
    const row = await this.repo.update(id, patch);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Rank ${id} not found.` },
      });
    }
    return this.toApi(row);
  }

  /**
   * RANK_IN_USE delete guard.
   * v1 covers three of the four reference types: `rank_history.rank_id`,
   * `belt_ranks.next_rank_id`, and `shogo_titles.min_rank_id`. The fourth —
   * `user_profile.current_rank_id` — is deferred until followup D4 ships
   * that column.
   */
  async delete(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Rank ${id} not found.` },
      });
    }
    const [history, pointers, shogos] = await Promise.all([
      this.repo.countHistoryUsingRank(id),
      this.repo.countNextRankPointers(id),
      this.repo.countShogosUsingRank(id),
    ]);
    if (history + pointers + shogos > 0) {
      throw new ConflictException({
        error: {
          code: 'RANK_IN_USE',
          message: `Cannot delete: ${history} history row(s), ${pointers} next-rank pointer(s), ${shogos} shogo title(s) still reference this rank.`,
        },
      });
    }
    await this.repo.delete(id);
  }

  private buildPatch(input: UpdateBeltRankInput): BeltRankPatch {
    const patch: BeltRankPatch = {};
    if ('organisationId' in input) patch.organisationId = input.organisationId ?? null;
    if ('systemId' in input) patch.systemId = input.systemId!;
    if ('level' in input) patch.level = input.level!;
    if ('sortOrder' in input) patch.sortOrder = input.sortOrder!;
    if ('nameJa' in input) patch.nameJa = input.nameJa ?? null;
    if ('nameRomaji' in input) patch.nameRomaji = input.nameRomaji!;
    if ('nameEn' in input) patch.nameEn = input.nameEn!;
    if ('nameSv' in input) patch.nameSv = input.nameSv!;
    if ('nameFi' in input) patch.nameFi = input.nameFi!;
    if ('beltColor' in input) patch.beltColor = input.beltColor!;
    if ('imageUrl' in input) patch.imageUrl = input.imageUrl ?? null;
    if ('descriptionEn' in input) patch.descriptionEn = input.descriptionEn ?? null;
    if ('descriptionSv' in input) patch.descriptionSv = input.descriptionSv ?? null;
    if ('descriptionFi' in input) patch.descriptionFi = input.descriptionFi ?? null;
    if ('publiclyVisible' in input) patch.publiclyVisible = input.publiclyVisible!;
    if ('slug' in input) patch.slug = input.slug ?? null;
    if ('minAge' in input) patch.minAge = input.minAge ?? null;
    if ('nextRankId' in input) patch.nextRankId = input.nextRankId ?? null;
    return patch;
  }

  private toApi(row: DbBeltRank): BeltRank {
    return {
      id: row.id,
      organisationId: row.organisationId,
      systemId: row.systemId,
      level: row.level,
      sortOrder: row.sortOrder,
      nameJa: row.nameJa,
      nameRomaji: row.nameRomaji,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      beltColor: row.beltColor,
      imageUrl: row.imageUrl,
      descriptionEn: row.descriptionEn,
      descriptionSv: row.descriptionSv,
      descriptionFi: row.descriptionFi,
      publiclyVisible: row.publiclyVisible,
      slug: row.slug,
      minAge: row.minAge,
      nextRankId: row.nextRankId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run the spec — expect PASS**

```
pnpm --filter backend test
```

Expected: PASS — all 12 cases pass.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/modules/belt-catalog/belt-ranks.service.ts apps/backend/src/modules/belt-catalog/belt-ranks.service.spec.ts
git commit -m "feat(backend): BeltRanksService — CRUD + slug rule + level uniqueness + RANK_IN_USE guard"
```

---

### Task 10: Backend — `BeltRanksController` + DTOs

**Files:**
- Create: `apps/backend/src/modules/belt-catalog/dto/belt-rank.dto.ts`
- Create: `apps/backend/src/modules/belt-catalog/dto/create-belt-rank.dto.ts`
- Create: `apps/backend/src/modules/belt-catalog/dto/update-belt-rank.dto.ts`
- Create: `apps/backend/src/modules/belt-catalog/belt-ranks.controller.ts`

- [ ] **Step 1: Create the DTOs**

Create `apps/backend/src/modules/belt-catalog/dto/belt-rank.dto.ts`:

```ts
import { BeltRankSchema } from '@repo/contracts/ranks';
import { createZodDto } from 'nestjs-zod';
export class BeltRankDto extends createZodDto(BeltRankSchema) {}
```

Create `apps/backend/src/modules/belt-catalog/dto/create-belt-rank.dto.ts`:

```ts
import { CreateBeltRankSchema } from '@repo/contracts/ranks';
import { createZodDto } from 'nestjs-zod';
export class CreateBeltRankDto extends createZodDto(CreateBeltRankSchema) {}
```

Create `apps/backend/src/modules/belt-catalog/dto/update-belt-rank.dto.ts`:

```ts
import { UpdateBeltRankSchema } from '@repo/contracts/ranks';
import { createZodDto } from 'nestjs-zod';
export class UpdateBeltRankDto extends createZodDto(UpdateBeltRankSchema) {}
```

- [ ] **Step 2: Create the controller**

Create `apps/backend/src/modules/belt-catalog/belt-ranks.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { BeltRank } from '@repo/contracts/ranks';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { BeltRankDto } from './dto/belt-rank.dto.js';
import { CreateBeltRankDto } from './dto/create-belt-rank.dto.js';
import { UpdateBeltRankDto } from './dto/update-belt-rank.dto.js';
import { BeltRanksService } from './belt-ranks.service.js';

@ApiTags('belt-ranks')
@ApiCookieAuth('session')
@Controller('ranks')
export class BeltRanksController {
  constructor(private readonly ranks: BeltRanksService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List belt ranks.',
    operationId: 'BeltRanksController_list',
    errorType: ErrorEnvelopeDto,
    errors: ['401'],
  })
  list(): Promise<BeltRank[]> {
    return this.ranks.list();
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Rank UUID.' })
  @ApiEndpoint({
    summary: 'Get a single rank.',
    operationId: 'BeltRanksController_findOne',
    ok: BeltRankDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '404'],
  })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<BeltRank> {
    return this.ranks.findById(id);
  }

  @Post()
  @CheckAbility('manage', 'BeltRank')
  @ApiBody({ type: CreateBeltRankDto })
  @ApiCreatedResponse({ type: BeltRankDto })
  @ApiEndpoint({
    summary: 'Create a rank (sysadmin only).',
    operationId: 'BeltRanksController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '409'],
  })
  create(
    @Body() body: CreateBeltRankDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BeltRank> {
    return this.ranks.create(body, user);
  }

  @Patch(':id')
  @CheckAbility('manage', 'BeltRank')
  @ApiParam({ name: 'id', description: 'Rank UUID.' })
  @ApiBody({ type: UpdateBeltRankDto })
  @ApiOkResponse({ type: BeltRankDto })
  @ApiEndpoint({
    summary: 'Update a rank (sysadmin only).',
    operationId: 'BeltRanksController_update',
    ok: BeltRankDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateBeltRankDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BeltRank> {
    return this.ranks.update(id, body, user);
  }

  @Delete(':id')
  @CheckAbility('manage', 'BeltRank')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Rank UUID.' })
  @ApiNoContentResponse({ description: 'Rank deleted.' })
  @ApiEndpoint({
    summary: 'Delete a rank (sysadmin only).',
    operationId: 'BeltRanksController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.ranks.delete(id);
  }
}
```

- [ ] **Step 3: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0.

- [ ] **Step 4: Commit**

```
git add apps/backend/src/modules/belt-catalog/dto/belt-rank.dto.ts apps/backend/src/modules/belt-catalog/dto/create-belt-rank.dto.ts apps/backend/src/modules/belt-catalog/dto/update-belt-rank.dto.ts apps/backend/src/modules/belt-catalog/belt-ranks.controller.ts
git commit -m "feat(backend): BeltRanksController + DTOs"
```

---

### Task 11: Backend — `ShogoTitlesModule` (full)

**Files:**
- Create: `apps/backend/src/modules/belt-catalog/shogo-titles.repository.ts`
- Create: `apps/backend/src/modules/belt-catalog/shogo-titles.service.ts`
- Create: `apps/backend/src/modules/belt-catalog/shogo-titles.service.spec.ts`
- Create: `apps/backend/src/modules/belt-catalog/dto/shogo-title.dto.ts`
- Create: `apps/backend/src/modules/belt-catalog/dto/create-shogo-title.dto.ts`
- Create: `apps/backend/src/modules/belt-catalog/dto/update-shogo-title.dto.ts`
- Create: `apps/backend/src/modules/belt-catalog/shogo-titles.controller.ts`

- [ ] **Step 1: Create `shogo-titles.repository.ts`**

```ts
import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  rankHistory,
  shogoTitles,
  userProfile,
  type DbShogoTitle,
  type DbNewShogoTitle,
} from '../../infrastructure/database/schema/index.js';

export type ShogoTitlePatch = Partial<
  Pick<DbShogoTitle, 'nameEn' | 'nameSv' | 'nameFi' | 'nameJa' | 'minRankId' | 'sortOrder'>
>;

@Injectable()
export class ShogoTitlesRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByCode(code: string, tx?: DrizzleExecutor): Promise<DbShogoTitle | null> {
    const conn = tx ?? this.db;
    const rows = await conn.select().from(shogoTitles).where(eq(shogoTitles.code, code)).limit(1);
    return rows[0] ?? null;
  }

  async findAll(tx?: DrizzleExecutor): Promise<DbShogoTitle[]> {
    const conn = tx ?? this.db;
    return conn.select().from(shogoTitles).orderBy(shogoTitles.sortOrder);
  }

  async insert(input: DbNewShogoTitle, tx?: DrizzleExecutor): Promise<DbShogoTitle> {
    const conn = tx ?? this.db;
    const rows = await conn.insert(shogoTitles).values(input).returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(
    code: string,
    patch: ShogoTitlePatch,
    tx?: DrizzleExecutor,
  ): Promise<DbShogoTitle | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(shogoTitles)
      .set(patch)
      .where(eq(shogoTitles.code, code))
      .returning();
    return rows[0] ?? null;
  }

  async delete(code: string, tx?: DrizzleExecutor): Promise<boolean> {
    const conn = tx ?? this.db;
    const rows = await conn
      .delete(shogoTitles)
      .where(eq(shogoTitles.code, code))
      .returning({ code: shogoTitles.code });
    return rows.length > 0;
  }

  /** Count history rows whose `shogo_title` matches this code. */
  async countHistoryUsingShogo(code: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(rankHistory)
      .where(eq(rankHistory.shogoTitle, code));
    return Number(rows[0]?.value ?? 0);
  }

  /** Count user profiles whose `shogo_title` matches this code (column added by Task 4). */
  async countProfilesUsingShogo(code: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(userProfile)
      .where(eq(userProfile.shogoTitle, code));
    return Number(rows[0]?.value ?? 0);
  }
}
```

- [ ] **Step 2: Write the failing service spec**

Create `apps/backend/src/modules/belt-catalog/shogo-titles.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShogoTitlesRepository } from './shogo-titles.repository.js';
import { ShogoTitlesService } from './shogo-titles.service.js';

const sysadmin = {
  id: 'u-sys',
  email: 'sys@example.com',
  emailVerified: true,
  name: 'Sys',
  image: null,
  role: 'sysadmin' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

const UUID = '11111111-1111-1111-1111-111111111111';

const ROW = {
  code: 'renshi',
  nameEn: 'Renshi',
  nameSv: 'Renshi',
  nameFi: 'Renshi',
  nameJa: '錬士',
  minRankId: UUID,
  sortOrder: 1,
};

function repoStub() {
  return {
    findByCode: vi.fn(),
    findAll: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countHistoryUsingShogo: vi.fn().mockResolvedValue(0),
    countProfilesUsingShogo: vi.fn().mockResolvedValue(0),
  } satisfies Record<keyof ShogoTitlesRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(repo: ReturnType<typeof repoStub>) {
  const module = await Test.createTestingModule({
    providers: [
      ShogoTitlesService,
      { provide: ShogoTitlesRepository, useValue: repo },
    ],
  }).compile();
  return module.get(ShogoTitlesService);
}

describe('ShogoTitlesService', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: ShogoTitlesService;

  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('list returns the API shape', async () => {
    repo.findAll.mockResolvedValue([ROW]);
    const out = await service.list();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'renshi', sortOrder: 1 });
  });

  it('findByCode 404s when missing', async () => {
    repo.findByCode.mockResolvedValue(null);
    await expect(service.findByCode('nope')).rejects.toThrow(NotFoundException);
  });

  it('create inserts and returns the API shape', async () => {
    repo.insert.mockResolvedValue(ROW);
    const out = await service.create(ROW, sysadmin);
    expect(out.code).toBe('renshi');
  });

  it('update 404s when missing', async () => {
    repo.update.mockResolvedValue(null);
    await expect(service.update('nope', { sortOrder: 9 }, sysadmin)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('delete refuses with SHOGO_IN_USE when rank_history references it', async () => {
    repo.findByCode.mockResolvedValue(ROW);
    repo.countHistoryUsingShogo.mockResolvedValue(2);
    await expect(service.delete('renshi')).rejects.toThrow(ConflictException);
  });

  it('delete refuses with SHOGO_IN_USE when user_profile references it', async () => {
    repo.findByCode.mockResolvedValue(ROW);
    repo.countProfilesUsingShogo.mockResolvedValue(1);
    await expect(service.delete('renshi')).rejects.toThrow(ConflictException);
  });

  it('delete succeeds when both guards are clear', async () => {
    repo.findByCode.mockResolvedValue(ROW);
    repo.delete.mockResolvedValue(true);
    await service.delete('renshi');
    expect(repo.delete).toHaveBeenCalledWith('renshi');
  });

  it('delete 404s when missing', async () => {
    repo.findByCode.mockResolvedValue(null);
    await expect(service.delete('nope')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run the spec — expect FAIL**

```
pnpm --filter backend test
```

Expected: FAIL — `shogo-titles.service.spec.ts` can't import `./shogo-titles.service.js`.

- [ ] **Step 4: Create the service**

Create `apps/backend/src/modules/belt-catalog/shogo-titles.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateShogoTitleInput,
  ShogoTitle,
  UpdateShogoTitleInput,
} from '@repo/contracts/shogo-titles';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbShogoTitle } from '../../infrastructure/database/schema/index.js';

import { ShogoTitlePatch, ShogoTitlesRepository } from './shogo-titles.repository.js';

@Injectable()
export class ShogoTitlesService {
  constructor(private readonly repo: ShogoTitlesRepository) {}

  async list(): Promise<ShogoTitle[]> {
    const rows = await this.repo.findAll();
    return rows.map((r) => this.toApi(r));
  }

  async findByCode(code: string): Promise<ShogoTitle> {
    const row = await this.repo.findByCode(code);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Shogo title ${code} not found.` },
      });
    }
    return this.toApi(row);
  }

  async create(input: CreateShogoTitleInput, _actor: AuthenticatedUser): Promise<ShogoTitle> {
    const row = await this.repo.insert({
      code: input.code,
      nameEn: input.nameEn,
      nameSv: input.nameSv,
      nameFi: input.nameFi,
      nameJa: input.nameJa,
      minRankId: input.minRankId,
      sortOrder: input.sortOrder ?? 0,
    });
    return this.toApi(row);
  }

  async update(
    code: string,
    input: UpdateShogoTitleInput,
    _actor: AuthenticatedUser,
  ): Promise<ShogoTitle> {
    const patch: ShogoTitlePatch = {};
    if ('nameEn' in input) patch.nameEn = input.nameEn!;
    if ('nameSv' in input) patch.nameSv = input.nameSv!;
    if ('nameFi' in input) patch.nameFi = input.nameFi!;
    if ('nameJa' in input) patch.nameJa = input.nameJa!;
    if ('minRankId' in input) patch.minRankId = input.minRankId!;
    if ('sortOrder' in input) patch.sortOrder = input.sortOrder!;

    const row = await this.repo.update(code, patch);
    if (!row) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Shogo title ${code} not found.` },
      });
    }
    return this.toApi(row);
  }

  async delete(code: string): Promise<void> {
    const existing = await this.repo.findByCode(code);
    if (!existing) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `Shogo title ${code} not found.` },
      });
    }
    const [history, profiles] = await Promise.all([
      this.repo.countHistoryUsingShogo(code),
      this.repo.countProfilesUsingShogo(code),
    ]);
    if (history + profiles > 0) {
      throw new ConflictException({
        error: {
          code: 'SHOGO_IN_USE',
          message: `Cannot delete: ${history} history row(s), ${profiles} user profile(s) still reference this shogo.`,
        },
      });
    }
    await this.repo.delete(code);
  }

  private toApi(row: DbShogoTitle): ShogoTitle {
    return {
      code: row.code,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      nameJa: row.nameJa,
      minRankId: row.minRankId,
      sortOrder: row.sortOrder,
    };
  }
}
```

- [ ] **Step 5: Create the DTOs**

Create `apps/backend/src/modules/belt-catalog/dto/shogo-title.dto.ts`:

```ts
import { ShogoTitleSchema } from '@repo/contracts/shogo-titles';
import { createZodDto } from 'nestjs-zod';
export class ShogoTitleDto extends createZodDto(ShogoTitleSchema) {}
```

Create `apps/backend/src/modules/belt-catalog/dto/create-shogo-title.dto.ts`:

```ts
import { CreateShogoTitleSchema } from '@repo/contracts/shogo-titles';
import { createZodDto } from 'nestjs-zod';
export class CreateShogoTitleDto extends createZodDto(CreateShogoTitleSchema) {}
```

Create `apps/backend/src/modules/belt-catalog/dto/update-shogo-title.dto.ts`:

```ts
import { UpdateShogoTitleSchema } from '@repo/contracts/shogo-titles';
import { createZodDto } from 'nestjs-zod';
export class UpdateShogoTitleDto extends createZodDto(UpdateShogoTitleSchema) {}
```

- [ ] **Step 6: Create the controller**

Create `apps/backend/src/modules/belt-catalog/shogo-titles.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { ShogoTitle } from '@repo/contracts/shogo-titles';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { CreateShogoTitleDto } from './dto/create-shogo-title.dto.js';
import { ShogoTitleDto } from './dto/shogo-title.dto.js';
import { UpdateShogoTitleDto } from './dto/update-shogo-title.dto.js';
import { ShogoTitlesService } from './shogo-titles.service.js';

@ApiTags('shogo-titles')
@ApiCookieAuth('session')
@Controller('shogo-titles')
export class ShogoTitlesController {
  constructor(private readonly shogos: ShogoTitlesService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List shogo titles.',
    operationId: 'ShogoTitlesController_list',
    errorType: ErrorEnvelopeDto,
    errors: ['401'],
  })
  list(): Promise<ShogoTitle[]> {
    return this.shogos.list();
  }

  @Post()
  @CheckAbility('manage', 'ShogoTitle')
  @ApiBody({ type: CreateShogoTitleDto })
  @ApiCreatedResponse({ type: ShogoTitleDto })
  @ApiEndpoint({
    summary: 'Create a shogo title (sysadmin only).',
    operationId: 'ShogoTitlesController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403'],
  })
  create(
    @Body() body: CreateShogoTitleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShogoTitle> {
    return this.shogos.create(body, user);
  }

  @Patch(':code')
  @CheckAbility('manage', 'ShogoTitle')
  @ApiParam({ name: 'code', description: 'Shogo code.' })
  @ApiBody({ type: UpdateShogoTitleDto })
  @ApiOkResponse({ type: ShogoTitleDto })
  @ApiEndpoint({
    summary: 'Update a shogo title (sysadmin only).',
    operationId: 'ShogoTitlesController_update',
    ok: ShogoTitleDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('code') code: string,
    @Body() body: UpdateShogoTitleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShogoTitle> {
    return this.shogos.update(code, body, user);
  }

  @Delete(':code')
  @CheckAbility('manage', 'ShogoTitle')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'code', description: 'Shogo code.' })
  @ApiNoContentResponse({ description: 'Shogo title deleted.' })
  @ApiEndpoint({
    summary: 'Delete a shogo title (sysadmin only).',
    operationId: 'ShogoTitlesController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  async remove(@Param('code') code: string): Promise<void> {
    await this.shogos.delete(code);
  }
}
```

- [ ] **Step 7: Run the spec — expect PASS**

```
pnpm --filter backend test
```

Expected: PASS — `shogo-titles.service.spec.ts` passes all 8 cases.

- [ ] **Step 8: Commit**

```
git add apps/backend/src/modules/belt-catalog/shogo-titles.repository.ts apps/backend/src/modules/belt-catalog/shogo-titles.service.ts apps/backend/src/modules/belt-catalog/shogo-titles.service.spec.ts apps/backend/src/modules/belt-catalog/dto/shogo-title.dto.ts apps/backend/src/modules/belt-catalog/dto/create-shogo-title.dto.ts apps/backend/src/modules/belt-catalog/dto/update-shogo-title.dto.ts apps/backend/src/modules/belt-catalog/shogo-titles.controller.ts
git commit -m "feat(backend): ShogoTitles repo/service/controller + SHOGO_IN_USE delete guard"
```

---

### Task 12: Backend — `BeltCatalogModule` + abilities + register in `AppModule`

**Files:**
- Create: `apps/backend/src/modules/belt-catalog/belt-catalog.abilities.ts`
- Create: `apps/backend/src/modules/belt-catalog/belt-catalog.module.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.module.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Create the ability contributor**

Create `apps/backend/src/modules/belt-catalog/belt-catalog.abilities.ts`:

```ts
import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Belt-catalog rules:
 * - Any authenticated user can read the catalog (systems, ranks, shogos).
 * - `manage` is implicit for sysadmin via the existing `('manage', 'all')`
 *   wildcard, so this contributor only adds read rules.
 */
@Injectable()
export class BeltCatalogAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can('read', 'BeltSystem');
    builder.can('read', 'BeltRank');
    builder.can('read', 'ShogoTitle');
  }
}
```

- [ ] **Step 2: Create the module**

Create `apps/backend/src/modules/belt-catalog/belt-catalog.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { BeltRanksController } from './belt-ranks.controller.js';
import { BeltRanksRepository } from './belt-ranks.repository.js';
import { BeltRanksService } from './belt-ranks.service.js';
import { BeltSystemsController } from './belt-systems.controller.js';
import { BeltSystemsRepository } from './belt-systems.repository.js';
import { BeltSystemsService } from './belt-systems.service.js';
import { ShogoTitlesController } from './shogo-titles.controller.js';
import { ShogoTitlesRepository } from './shogo-titles.repository.js';
import { ShogoTitlesService } from './shogo-titles.service.js';

/**
 * Owns the belt-catalog HTTP/data layer (systems, ranks, shogos). Exports the
 * three repositories and three services so the rank-history projection can
 * hydrate ranks/shogos without re-querying through the controller.
 */
@Module({
  controllers: [BeltSystemsController, BeltRanksController, ShogoTitlesController],
  providers: [
    BeltSystemsService,
    BeltSystemsRepository,
    BeltRanksService,
    BeltRanksRepository,
    ShogoTitlesService,
    ShogoTitlesRepository,
  ],
  exports: [
    BeltSystemsService,
    BeltSystemsRepository,
    BeltRanksService,
    BeltRanksRepository,
    ShogoTitlesService,
    ShogoTitlesRepository,
  ],
})
export class BeltCatalogModule {}
```

- [ ] **Step 3: Register `BeltCatalogAbilityRules` in `AbilityModule`**

In `apps/backend/src/infrastructure/ability/ability.module.ts`, add the import after the `MembershipsAbilityRules` import:

```ts
import { BeltCatalogAbilityRules } from '../../modules/belt-catalog/belt-catalog.abilities.js';
import { MembershipsAbilityRules } from '../../modules/memberships/memberships.abilities.js';
```

Add the contributor to the providers array, immediately after `MembershipsAbilityRules`:

```ts
  providers: [
    AuditLogAbilityRules,
    MembershipsAbilityRules,
    BeltCatalogAbilityRules,
    OrganisationsAbilityRules,
    UsersAbilityRules,
    AbilityFactory,
    AbilityGuard,
    { provide: APP_GUARD, useClass: AbilityGuard },
  ],
```

- [ ] **Step 4: Register `BeltCatalogModule` in `AppModule`**

In `apps/backend/src/app.module.ts`, add the import after the `AuditLogModule` import:

```ts
import { AuditLogModule } from './modules/audit-log/audit-log.module.js';
import { BeltCatalogModule } from './modules/belt-catalog/belt-catalog.module.js';
```

Add `BeltCatalogModule` to the `imports` array, after `MembershipsModule`:

```ts
  imports: [
    AppConfigModule,
    DatabaseModule,
    EmailModule,
    InfraAuthModule,
    AbilityModule,
    AuthDocsModule,
    HealthModule,
    UsersModule,
    ProfileModule,
    OrganisationsModule,
    MembershipsModule,
    BeltCatalogModule,
    AuditLogModule,
  ],
```

- [ ] **Step 5: Typecheck and test**

```
pnpm --filter backend typecheck && pnpm --filter backend test
```

Expected: PASS — `tsc --noEmit` exits 0; every service spec is green and Nest's DI graph resolves cleanly (the test runner instantiates the modules during contract specs).

- [ ] **Step 6: Commit**

```
git add apps/backend/src/modules/belt-catalog/belt-catalog.abilities.ts apps/backend/src/modules/belt-catalog/belt-catalog.module.ts apps/backend/src/infrastructure/ability/ability.module.ts apps/backend/src/app.module.ts
git commit -m "feat(backend): BeltCatalogModule + abilities + AppModule registration"
```

---

### Task 13: Backend — `RankHistoryAuthService` + spec

**Files:**
- Create: `apps/backend/src/modules/rank-history/rank-history.auth.service.ts`
- Create: `apps/backend/src/modules/rank-history/rank-history.auth.service.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `apps/backend/src/modules/rank-history/rank-history.auth.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../infrastructure/database/client.js';
import { MembershipsRepository } from '../memberships/memberships.repository.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';

import { RankHistoryAuthService } from './rank-history.auth.service.js';

const subjectUserId = 'u-subject';

function actor(role: 'sysadmin' | 'user', id = 'u-actor') {
  return {
    id,
    email: `${id}@example.com`,
    emailVerified: true,
    name: id,
    image: null,
    role,
    locale: 'en',
    deactivatedAt: null,
    memberships: [],
  };
}

function eventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r-1',
    userId: subjectUserId,
    rankId: 'rk-1',
    shogoTitle: null,
    date: '2024-09-01',
    result: 'pass',
    source: 'event',
    eventId: 'ev-1',
    recordedByUserId: 'u-event-creator',
    examinerName: null,
    organisationName: null,
    notes: null,
    verified: true,
    verifiedByUserId: 'u-event-creator',
    verifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: null,
    updatedByUserId: null,
    ...overrides,
  };
}

function externalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return eventRow({
    source: 'external',
    eventId: null,
    recordedByUserId: 'u-actor',
    verified: false,
    verifiedByUserId: null,
    verifiedAt: null,
    ...overrides,
  });
}

const orgsRepoStub = () => ({
  findById: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  countChildren: vi.fn(),
  // Extension added in Task 16 if not present — for the spec we stub the
  // method that loads orgs headed by an actor:
  findHeadInstructorOrgIds: vi.fn().mockResolvedValue([] as string[]),
});

const membershipsRepoStub = () => ({
  findById: vi.fn(),
  findExact: vi.fn(),
  list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

const fakeDb = {
  transaction: vi.fn(),
};

async function makeService(
  orgsRepo: ReturnType<typeof orgsRepoStub>,
  membersRepo: ReturnType<typeof membershipsRepoStub>,
) {
  const module = await Test.createTestingModule({
    providers: [
      RankHistoryAuthService,
      { provide: OrganisationsRepository, useValue: orgsRepo },
      { provide: MembershipsRepository, useValue: membersRepo },
      { provide: DRIZZLE, useValue: fakeDb },
    ],
  }).compile();
  return module.get(RankHistoryAuthService);
}

describe('RankHistoryAuthService — loadRoleContext', () => {
  it('marks sysadmin actors', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(ctx.isSysadmin).toBe(true);
  });

  it('populates headInstructorOf from organisations', async () => {
    const orgsRepo = orgsRepoStub();
    orgsRepo.findHeadInstructorOrgIds.mockResolvedValue(['org-1', 'org-2']);
    const service = await makeService(orgsRepo, membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('user'), subjectUserId);
    expect(ctx.headInstructorOf.has('org-1')).toBe(true);
    expect(ctx.headInstructorOf.has('org-2')).toBe(true);
  });

  it('sets sharesOrgWithSubject true when the actor and subject share an org', async () => {
    const members = membershipsRepoStub();
    // Subject has membership in org-1; actor has membership in org-1 → share.
    members.list.mockImplementation(async (filter: { userId?: string }) => {
      if (filter.userId === 'u-actor') {
        return { data: [{ organisationId: 'org-1', role: 'instructor' }], total: 1 };
      }
      if (filter.userId === subjectUserId) {
        return { data: [{ organisationId: 'org-1', role: 'orgadmin' }], total: 1 };
      }
      return { data: [], total: 0 };
    });
    const service = await makeService(orgsRepoStub(), members);
    const ctx = await service.loadRoleContext(actor('user'), subjectUserId);
    expect(ctx.sharesOrgWithSubject).toBe(true);
  });

  it('leaves instructorLinks and gradingOfficerCaps empty (D2/D3 deferred)', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('user'), subjectUserId);
    expect(ctx.instructorLinks.size).toBe(0);
    expect(ctx.gradingOfficerCaps.size).toBe(0);
  });
});

describe('RankHistoryAuthService — canVerifyWithCtx', () => {
  it('returns false for event-sourced rows', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(service.canVerifyWithCtx(actor('sysadmin'), eventRow(), ctx)).toBe(false);
  });

  it('returns false when the actor is the recorder', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const sysCtx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    const row = externalRow({ recordedByUserId: 'u-actor' });
    expect(service.canVerifyWithCtx(actor('sysadmin'), row, sysCtx)).toBe(false);
  });

  it('returns true for sysadmin on an external row not recorded by them', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    const row = externalRow({ recordedByUserId: subjectUserId });
    expect(service.canVerifyWithCtx(actor('sysadmin'), row, ctx)).toBe(true);
  });

  it('returns true for head instructor of the subject\'s org', async () => {
    const orgsRepo = orgsRepoStub();
    orgsRepo.findHeadInstructorOrgIds.mockResolvedValue(['org-1']);
    const members = membershipsRepoStub();
    members.list.mockImplementation(async (filter: { userId?: string }) => {
      if (filter.userId === subjectUserId) {
        return { data: [{ organisationId: 'org-1', role: 'orgadmin' }], total: 1 };
      }
      return { data: [], total: 0 };
    });
    const service = await makeService(orgsRepo, members);
    const userActor = actor('user');
    const ctx = await service.loadRoleContext(userActor, subjectUserId);
    const row = externalRow({ recordedByUserId: subjectUserId });
    expect(service.canVerifyWithCtx(userActor, row, ctx)).toBe(true);
  });
});

describe('RankHistoryAuthService — canEditWithCtx', () => {
  it('returns false for event rows', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(service.canEditWithCtx(actor('sysadmin'), eventRow(), ctx)).toBe(false);
  });

  it('returns true when actor is the row\'s recorder (external)', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('user'), subjectUserId);
    const row = externalRow({ recordedByUserId: 'u-actor' });
    expect(service.canEditWithCtx(actor('user'), row, ctx)).toBe(true);
  });

  it('returns true when actor is the subject user (external)', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('user', subjectUserId), subjectUserId);
    const row = externalRow({ recordedByUserId: 'u-other' });
    expect(service.canEditWithCtx(actor('user', subjectUserId), row, ctx)).toBe(true);
  });

  it('returns true for sysadmin (external)', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(service.canEditWithCtx(actor('sysadmin'), externalRow(), ctx)).toBe(true);
  });
});

describe('RankHistoryAuthService — canReadWithCtx', () => {
  it('returns true for the subject themselves', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const self = actor('user', subjectUserId);
    const ctx = await service.loadRoleContext(self, subjectUserId);
    expect(service.canReadWithCtx(self, ctx)).toBe(true);
  });

  it('returns true for sysadmin', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const ctx = await service.loadRoleContext(actor('sysadmin'), subjectUserId);
    expect(service.canReadWithCtx(actor('sysadmin'), ctx)).toBe(true);
  });

  it('returns true when actor shares an org with the subject', async () => {
    const members = membershipsRepoStub();
    members.list.mockImplementation(async (filter: { userId?: string }) => {
      if (filter.userId === 'u-actor') {
        return { data: [{ organisationId: 'org-1', role: 'instructor' }], total: 1 };
      }
      if (filter.userId === subjectUserId) {
        return { data: [{ organisationId: 'org-1', role: 'orgadmin' }], total: 1 };
      }
      return { data: [], total: 0 };
    });
    const service = await makeService(orgsRepoStub(), members);
    const a = actor('user');
    const ctx = await service.loadRoleContext(a, subjectUserId);
    expect(service.canReadWithCtx(a, ctx)).toBe(true);
  });

  it('returns false otherwise', async () => {
    const service = await makeService(orgsRepoStub(), membershipsRepoStub());
    const a = actor('user');
    const ctx = await service.loadRoleContext(a, subjectUserId);
    expect(service.canReadWithCtx(a, ctx)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the spec — expect FAIL**

```
pnpm --filter backend test
```

Expected: FAIL — `rank-history.auth.service.spec.ts` can't import `./rank-history.auth.service.js`, and `OrganisationsRepository.findHeadInstructorOrgIds` does not yet exist.

- [ ] **Step 3: Extend `OrganisationsRepository` with `findHeadInstructorOrgIds`**

In `apps/backend/src/modules/organisations/organisations.repository.ts`, add a new method (under the existing `countChildren`):

```ts
  /** Org ids where the given user is the head instructor. */
  async findHeadInstructorOrgIds(
    userId: string,
    tx?: DrizzleExecutor,
  ): Promise<string[]> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.headInstructorId, userId));
    return rows.map((r) => r.id);
  }
```

Make sure `DrizzleExecutor` is imported (it already is in `organisations.repository.ts`).

- [ ] **Step 4: Create the auth service**

Create `apps/backend/src/modules/rank-history/rank-history.auth.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import { type DbRankHistory } from '../../infrastructure/database/schema/index.js';
import { MembershipsRepository } from '../memberships/memberships.repository.js';
import { OrganisationsRepository } from '../organisations/organisations.repository.js';

/**
 * The precomputed role context for one (actor, subjectUser) pair. Loaded
 * once per request and then handed to each per-row predicate so the
 * unified projection stays O(rows) instead of O(rows × roles).
 */
export interface RoleContext {
  isSysadmin: boolean;
  /** Org ids where the actor is the head instructor. */
  headInstructorOf: Set<string>;
  /** True when actor and subject share at least one organisation membership. */
  sharesOrgWithSubject: boolean;
  /** Subject user ids the actor is linked to via instructor_students (D2 — empty in v1). */
  instructorLinks: Set<string>;
  /** Per-system rank-level caps the actor holds as a grading officer (D3 — empty in v1). */
  gradingOfficerCaps: Map<string, number>;
  /** Carried so the synchronous predicates know the subject without a re-lookup. */
  subjectUserId: string;
}

/**
 * Service-layer authorisation predicates for rank-history rows.
 *
 * The "WithCtx" variants are synchronous and take a precomputed `RoleContext`
 * loaded by `loadRoleContext`. Spec §6.3 requires the projection to batch all
 * role lookups once per request — `loadRoleContext` is that batch step.
 *
 * v1 fail-closed posture: predicates 3 (linked instructor) and 4 (capped
 * grading officer) from spec §6.3 are not yet wired because their backing
 * tables (`instructor_students`, `grading_officers*`) don't exist. They
 * resolve to `false` here and will activate as the followup tables land.
 */
@Injectable()
export class RankHistoryAuthService {
  constructor(
    private readonly orgs: OrganisationsRepository,
    private readonly memberships: MembershipsRepository,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async loadRoleContext(
    actor: AuthenticatedUser,
    subjectUserId: string,
    tx?: DrizzleExecutor,
  ): Promise<RoleContext> {
    const isSysadmin = actor.role === 'sysadmin';
    const headInstructorOrgIds = await this.orgs.findHeadInstructorOrgIds(actor.id, tx);
    const headInstructorOf = new Set(headInstructorOrgIds);

    // Org-sharing: load both actor's and subject's memberships and intersect.
    const [actorMemberships, subjectMemberships] = await Promise.all([
      this.memberships.list({ userId: actor.id }),
      this.memberships.list({ userId: subjectUserId }),
    ]);
    const actorOrgIds = new Set(actorMemberships.data.map((m) => m.organisationId));
    const sharesOrgWithSubject = subjectMemberships.data.some((m) =>
      actorOrgIds.has(m.organisationId),
    );

    return {
      isSysadmin,
      headInstructorOf,
      sharesOrgWithSubject,
      // D2 — `instructor_students` does not exist yet; predicate fails closed.
      instructorLinks: new Set<string>(),
      // D3 — `grading_officers*` does not exist yet; predicate fails closed.
      gradingOfficerCaps: new Map<string, number>(),
      subjectUserId,
    };
  }

  // ---------- async convenience wrappers (load + apply) ----------

  async canRead(
    actor: AuthenticatedUser,
    subjectUserId: string,
    tx?: DrizzleExecutor,
  ): Promise<boolean> {
    if (actor.id === subjectUserId) return true;
    if (actor.role === 'sysadmin') return true;
    const ctx = await this.loadRoleContext(actor, subjectUserId, tx);
    return this.canReadWithCtx(actor, ctx);
  }

  async canVerify(
    actor: AuthenticatedUser,
    row: DbRankHistory,
    tx?: DrizzleExecutor,
  ): Promise<boolean> {
    const ctx = await this.loadRoleContext(actor, row.userId, tx);
    return this.canVerifyWithCtx(actor, row, ctx);
  }

  canEdit(actor: AuthenticatedUser, row: DbRankHistory): boolean {
    if (row.source === 'event') return false;
    if (actor.role === 'sysadmin') return true;
    if (actor.id === row.recordedByUserId) return true;
    if (actor.id === row.userId) return true;
    return false;
  }

  canDelete(actor: AuthenticatedUser, row: DbRankHistory): boolean {
    // Same logic as canEdit per spec §6.3.
    return this.canEdit(actor, row);
  }

  // ---------- synchronous predicates (use precomputed ctx) ----------

  canReadWithCtx(actor: AuthenticatedUser, ctx: RoleContext): boolean {
    if (actor.id === ctx.subjectUserId) return true;
    if (ctx.isSysadmin) return true;
    if (ctx.sharesOrgWithSubject) return true;
    return false;
  }

  canEditWithCtx(
    actor: AuthenticatedUser,
    row: DbRankHistory,
    _ctx: RoleContext,
  ): boolean {
    return this.canEdit(actor, row);
  }

  canVerifyWithCtx(
    actor: AuthenticatedUser,
    row: DbRankHistory,
    ctx: RoleContext,
  ): boolean {
    if (row.source === 'event') return false;
    if (actor.id === row.recordedByUserId) return false;

    if (ctx.isSysadmin) return true;

    // Head instructor of the subject's org.
    if (ctx.headInstructorOf.size > 0) {
      // Org-sharing implies they share at least one of the subject's orgs;
      // if any of those is one the actor heads, they're authorised.
      // (Without subject memberships in ctx, sharesOrgWithSubject + a non-empty
      // headInstructorOf is a sufficient predicate because the actor only
      // heads orgs they're tied to.)
      if (ctx.sharesOrgWithSubject) return true;
    }

    // D2 — linked-instructor: ctx.instructorLinks always empty in v1.
    if (ctx.instructorLinks.has(row.userId)) return true;

    // D3 — capped grading officer: ctx.gradingOfficerCaps always empty in v1.
    // When D3 lands, the row's rank.system_id and rank.level inform the check.

    return false;
  }
}
```

- [ ] **Step 5: Run the spec — expect PASS**

```
pnpm --filter backend test
```

Expected: PASS — all 13 cases in `rank-history.auth.service.spec.ts` pass.

- [ ] **Step 6: Commit**

```
git add apps/backend/src/modules/rank-history/rank-history.auth.service.ts apps/backend/src/modules/rank-history/rank-history.auth.service.spec.ts apps/backend/src/modules/organisations/organisations.repository.ts
git commit -m "feat(backend): RankHistoryAuthService with batched RoleContext (v1 fail-closed on D2/D3)"
```

---

### Task 14: Backend — `RankHistoryRepository`

**Files:**
- Create: `apps/backend/src/modules/rank-history/rank-history.repository.ts`

- [ ] **Step 1: Create the repository**

Create `apps/backend/src/modules/rank-history/rank-history.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  beltRanks,
  rankHistory,
  shogoTitles,
  user,
  type DbRankHistory,
  type DbNewRankHistory,
} from '../../infrastructure/database/schema/index.js';

/**
 * The set of `rank_history` columns the service may write. `id`, `source`,
 * `eventId`, `userId`, `recordedByUserId`, `createdAt` are stamped on insert
 * and never patched through this API.
 */
export type RankHistoryWritePatch = Partial<
  Pick<
    DbRankHistory,
    | 'rankId'
    | 'shogoTitle'
    | 'date'
    | 'examinerName'
    | 'organisationName'
    | 'notes'
    | 'verified'
    | 'verifiedByUserId'
    | 'verifiedAt'
    | 'updatedAt'
    | 'updatedByUserId'
  >
>;

export interface JoinedRankHistoryRow {
  row: DbRankHistory;
  rank: { id: string; systemId: string; level: number };
  verifiedBy: { id: string; name: string | null } | null;
}

@Injectable()
export class RankHistoryRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string, tx?: DrizzleExecutor): Promise<DbRankHistory | null> {
    return this.findByIdRaw(id, tx);
  }

  async findByIdRaw(id: string, tx?: DrizzleExecutor): Promise<DbRankHistory | null> {
    const conn = tx ?? this.db;
    const rows = await conn.select().from(rankHistory).where(eq(rankHistory.id, id)).limit(1);
    return rows[0] ?? null;
  }

  /** Raw rows for the admin GET /api/rank-history/:userId endpoint. */
  async listByUser(userId: string, tx?: DrizzleExecutor): Promise<DbRankHistory[]> {
    const conn = tx ?? this.db;
    return conn
      .select()
      .from(rankHistory)
      .where(eq(rankHistory.userId, userId))
      .orderBy(desc(rankHistory.date));
  }

  /** Joined rows for the unified projection (rank + verifiedBy hydration). */
  async listByUserJoined(
    userId: string,
    tx?: DrizzleExecutor,
  ): Promise<JoinedRankHistoryRow[]> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({
        history: rankHistory,
        rankId: beltRanks.id,
        systemId: beltRanks.systemId,
        level: beltRanks.level,
        verifierId: user.id,
        verifierName: user.name,
      })
      .from(rankHistory)
      .innerJoin(beltRanks, eq(beltRanks.id, rankHistory.rankId))
      .leftJoin(user, eq(user.id, rankHistory.verifiedByUserId))
      .where(eq(rankHistory.userId, userId))
      .orderBy(desc(rankHistory.date));

    return rows.map((r) => ({
      row: r.history,
      rank: { id: r.rankId, systemId: r.systemId, level: r.level },
      verifiedBy: r.verifierId ? { id: r.verifierId, name: r.verifierName } : null,
    }));
  }

  async insert(input: DbNewRankHistory, tx?: DrizzleExecutor): Promise<DbRankHistory> {
    const conn = tx ?? this.db;
    const rows = await conn.insert(rankHistory).values(input).returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(
    id: string,
    patch: RankHistoryWritePatch,
    tx?: DrizzleExecutor,
  ): Promise<DbRankHistory | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(rankHistory)
      .set(patch)
      .where(eq(rankHistory.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string, tx?: DrizzleExecutor): Promise<boolean> {
    const conn = tx ?? this.db;
    const rows = await conn
      .delete(rankHistory)
      .where(eq(rankHistory.id, id))
      .returning({ id: rankHistory.id });
    return rows.length > 0;
  }

  /**
   * Find the highest verified shogo across a user's history (ordered by
   * `shogo_titles.sort_order DESC`, breaking ties by `date DESC`). Returns
   * the shogo code or null if the user has no verified shogo.
   */
  async findHighestVerifiedShogo(
    userId: string,
    tx?: DrizzleExecutor,
  ): Promise<string | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ code: rankHistory.shogoTitle })
      .from(rankHistory)
      .innerJoin(shogoTitles, eq(shogoTitles.code, rankHistory.shogoTitle))
      .where(
        and(
          eq(rankHistory.userId, userId),
          eq(rankHistory.verified, true),
          isNotNull(rankHistory.shogoTitle),
        ),
      )
      .orderBy(desc(shogoTitles.sortOrder), desc(rankHistory.date))
      .limit(1);
    return rows[0]?.code ?? null;
  }
}
```

- [ ] **Step 2: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0.

- [ ] **Step 3: Commit**

```
git add apps/backend/src/modules/rank-history/rank-history.repository.ts
git commit -m "feat(backend): RankHistoryRepository — CRUD + joined listByUser + highest-verified-shogo"
```

---

### Task 15: Backend — `RankHistoryService` + spec

**Files:**
- Create: `apps/backend/src/modules/rank-history/rank-history.service.ts`
- Create: `apps/backend/src/modules/rank-history/rank-history.service.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `apps/backend/src/modules/rank-history/rank-history.service.spec.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../infrastructure/database/client.js';

import { RankHistoryAuthService } from './rank-history.auth.service.js';
import { RankHistoryRepository } from './rank-history.repository.js';
import { RankHistoryService } from './rank-history.service.js';

const sysadmin = {
  id: 'u-sys',
  email: 'sys@example.com',
  emailVerified: true,
  name: 'Sys',
  image: null,
  role: 'sysadmin' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};
const user = { ...sysadmin, id: 'u-actor', role: 'user' as const };
const owner = { ...sysadmin, id: 'u-subject', role: 'user' as const };

const UUID = '11111111-1111-1111-1111-111111111111';

function externalRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'r-1',
    userId: 'u-subject',
    rankId: UUID,
    shogoTitle: null,
    date: '2024-09-01',
    result: 'pass',
    source: 'external',
    eventId: null,
    recordedByUserId: 'u-actor',
    examinerName: null,
    organisationName: null,
    notes: null,
    verified: false,
    verifiedByUserId: null,
    verifiedAt: null,
    createdAt: new Date(),
    updatedAt: null,
    updatedByUserId: null,
    ...overrides,
  };
}

function eventRow(overrides: Partial<Record<string, unknown>> = {}) {
  return externalRow({
    source: 'event',
    eventId: 'ev-1',
    recordedByUserId: 'u-event',
    verified: true,
    verifiedByUserId: 'u-event',
    verifiedAt: new Date(),
    ...overrides,
  });
}

function repoStub() {
  return {
    findById: vi.fn(),
    findByIdRaw: vi.fn(),
    listByUser: vi.fn(),
    listByUserJoined: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findHighestVerifiedShogo: vi.fn().mockResolvedValue(null),
  } satisfies Record<keyof RankHistoryRepository, ReturnType<typeof vi.fn>>;
}

function authStub() {
  return {
    loadRoleContext: vi.fn().mockResolvedValue({
      isSysadmin: true,
      headInstructorOf: new Set<string>(),
      sharesOrgWithSubject: false,
      instructorLinks: new Set<string>(),
      gradingOfficerCaps: new Map<string, number>(),
      subjectUserId: 'u-subject',
    }),
    canRead: vi.fn().mockResolvedValue(true),
    canVerify: vi.fn().mockResolvedValue(true),
    canEdit: vi.fn().mockReturnValue(true),
    canDelete: vi.fn().mockReturnValue(true),
    canReadWithCtx: vi.fn().mockReturnValue(true),
    canEditWithCtx: vi.fn().mockReturnValue(true),
    canVerifyWithCtx: vi.fn().mockReturnValue(true),
  };
}

const FAKE_TX = { __tx: true } as any;
const fakeDb = {
  transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(FAKE_TX)),
};

async function makeService(
  repo: ReturnType<typeof repoStub>,
  auth: ReturnType<typeof authStub> = authStub(),
) {
  const module = await Test.createTestingModule({
    providers: [
      RankHistoryService,
      { provide: RankHistoryRepository, useValue: repo },
      { provide: RankHistoryAuthService, useValue: auth },
      { provide: DRIZZLE, useValue: fakeDb },
    ],
  }).compile();
  return { service: module.get(RankHistoryService), auth };
}

describe('RankHistoryService — create', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    repo.insert.mockResolvedValue(externalRow());
    ({ service } = await makeService(repo));
  });

  it('stamps source=external, result=pass, verified=false, recorded by actor', async () => {
    await service.create('u-subject', { rankId: UUID, date: '2024-09-01' }, user);
    expect(repo.insert).toHaveBeenCalledTimes(1);
    const insertedRow = repo.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedRow.userId).toBe('u-subject');
    expect(insertedRow.source).toBe('external');
    expect(insertedRow.result).toBe('pass');
    expect(insertedRow.verified).toBe(false);
    expect(insertedRow.eventId).toBe(null);
    expect(insertedRow.recordedByUserId).toBe('u-actor');
  });
});

describe('RankHistoryService — update', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    ({ service } = await makeService(repo));
  });

  it('404s when missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.update('nope', { notes: 'x' }, user)).rejects.toThrow(NotFoundException);
  });

  it('rejects event-sourced rows with SOURCE_EVENT', async () => {
    repo.findById.mockResolvedValue(eventRow());
    await expect(service.update('r-1', { notes: 'x' }, user)).rejects.toThrow(BadRequestException);
  });

  it('preserves verification when only notes change', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: true, verifiedByUserId: 'u-sys', verifiedAt: new Date() }));
    repo.update.mockResolvedValue(externalRow({ notes: 'updated', verified: true }));
    await service.update('r-1', { notes: 'updated' }, sysadmin);
    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.notes).toBe('updated');
    expect(patch.verified).toBeUndefined();
    expect(patch.verifiedByUserId).toBeUndefined();
  });

  it('clears verification when date changes on a verified row', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: true, verifiedByUserId: 'u-sys', verifiedAt: new Date(), shogoTitle: null }));
    repo.update.mockResolvedValue(externalRow({ date: '2024-10-01', verified: false }));
    await service.update('r-1', { date: '2024-10-01' }, sysadmin);
    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.verified).toBe(false);
    expect(patch.verifiedByUserId).toBe(null);
    expect(patch.verifiedAt).toBe(null);
  });

  it('clears verification when shogo changes on a verified row and recomputes shogo', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: true, verifiedByUserId: 'u-sys', verifiedAt: new Date(), shogoTitle: 'kyoshi' }));
    repo.update.mockResolvedValue(externalRow({ shogoTitle: 'renshi', verified: false }));
    repo.findHighestVerifiedShogo.mockResolvedValue('renshi');
    await service.update('r-1', { shogoTitle: 'renshi' }, sysadmin);
    expect(repo.findHighestVerifiedShogo).toHaveBeenCalledWith('u-subject', FAKE_TX);
  });
});

describe('RankHistoryService — delete', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    ({ service } = await makeService(repo));
  });

  it('rejects event-sourced rows with SOURCE_EVENT', async () => {
    repo.findById.mockResolvedValue(eventRow());
    await expect(service.delete('r-1', sysadmin)).rejects.toThrow(BadRequestException);
  });

  it('deletes external rows', async () => {
    repo.findById.mockResolvedValue(externalRow());
    repo.delete.mockResolvedValue(true);
    await service.delete('r-1', sysadmin);
    expect(repo.delete).toHaveBeenCalledWith('r-1', FAKE_TX);
  });
});

describe('RankHistoryService — verify', () => {
  let repo: ReturnType<typeof repoStub>;
  let auth: ReturnType<typeof authStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    auth = authStub();
    ({ service } = await makeService(repo, auth));
  });

  it('rejects event-sourced rows with SOURCE_EVENT', async () => {
    repo.findById.mockResolvedValue(eventRow());
    await expect(service.verify('r-1', sysadmin)).rejects.toThrow(BadRequestException);
  });

  it('rejects already-verified rows with 409', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: true, verifiedByUserId: 'u-x', verifiedAt: new Date() }));
    await expect(service.verify('r-1', sysadmin)).rejects.toThrow(ConflictException);
  });

  it('rejects self-verify (recorder !== verifier)', async () => {
    repo.findById.mockResolvedValue(externalRow({ recordedByUserId: 'u-sys' }));
    await expect(service.verify('r-1', sysadmin)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when auth.canVerify returns false', async () => {
    repo.findById.mockResolvedValue(externalRow({ recordedByUserId: 'u-other' }));
    auth.canVerify.mockResolvedValue(false);
    await expect(service.verify('r-1', user)).rejects.toThrow(ForbiddenException);
  });

  it('marks the row verified and recomputes shogo when the row carries one', async () => {
    repo.findById
      .mockResolvedValueOnce(externalRow({ shogoTitle: 'kyoshi', recordedByUserId: 'u-other' }))
      .mockResolvedValueOnce(externalRow({ shogoTitle: 'kyoshi', verified: true, verifiedByUserId: sysadmin.id, verifiedAt: new Date() }));
    repo.update.mockResolvedValue(externalRow({ shogoTitle: 'kyoshi', verified: true }));
    repo.findHighestVerifiedShogo.mockResolvedValue('kyoshi');

    await service.verify('r-1', sysadmin);

    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.verified).toBe(true);
    expect(patch.verifiedByUserId).toBe(sysadmin.id);
    expect(patch.verifiedAt).toBeInstanceOf(Date);
    expect(repo.findHighestVerifiedShogo).toHaveBeenCalledWith('u-subject', FAKE_TX);
  });
});

describe('RankHistoryService — unverify', () => {
  let repo: ReturnType<typeof repoStub>;
  let auth: ReturnType<typeof authStub>;
  let service: RankHistoryService;

  beforeEach(async () => {
    repo = repoStub();
    auth = authStub();
    ({ service } = await makeService(repo, auth));
  });

  it('rejects event-sourced rows', async () => {
    repo.findById.mockResolvedValue(eventRow());
    await expect(service.unverify('r-1', sysadmin)).rejects.toThrow(BadRequestException);
  });

  it('rejects already-unverified rows with 409 ALREADY_UNVERIFIED', async () => {
    repo.findById.mockResolvedValue(externalRow({ verified: false }));
    await expect(service.unverify('r-1', sysadmin)).rejects.toThrow(ConflictException);
  });

  it('clears verification triple and recomputes shogo when the row had one', async () => {
    repo.findById.mockResolvedValueOnce(
      externalRow({ shogoTitle: 'kyoshi', verified: true, verifiedByUserId: 'u-x', verifiedAt: new Date(), recordedByUserId: 'u-other' }),
    );
    repo.update.mockResolvedValue(externalRow({ shogoTitle: 'kyoshi', verified: false }));
    await service.unverify('r-1', sysadmin);
    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.verified).toBe(false);
    expect(patch.verifiedByUserId).toBe(null);
    expect(patch.verifiedAt).toBe(null);
    expect(repo.findHighestVerifiedShogo).toHaveBeenCalledWith('u-subject', FAKE_TX);
  });
});
```

- [ ] **Step 2: Run the spec — expect FAIL**

```
pnpm --filter backend test
```

Expected: FAIL — `rank-history.service.spec.ts` can't import `./rank-history.service.js`.

- [ ] **Step 3: Create the service**

Create `apps/backend/src/modules/rank-history/rank-history.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateRankHistoryInput,
  RankHistory,
  UpdateRankHistoryInput,
} from '@repo/contracts/rank-history';
import { eq } from 'drizzle-orm';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  type DbRankHistory,
  userProfile,
} from '../../infrastructure/database/schema/index.js';

import { RankHistoryAuthService } from './rank-history.auth.service.js';
import {
  RankHistoryRepository,
  type RankHistoryWritePatch,
} from './rank-history.repository.js';

@Injectable()
export class RankHistoryService {
  constructor(
    private readonly repo: RankHistoryRepository,
    private readonly auth: RankHistoryAuthService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  async list(subjectUserId: string, actor: AuthenticatedUser): Promise<RankHistory[]> {
    const allowed = await this.auth.canRead(actor, subjectUserId);
    if (!allowed) {
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Cannot read history for this user.' } });
    }
    const rows = await this.repo.listByUser(subjectUserId);
    return rows.map((r) => this.toApi(r));
  }

  async create(
    subjectUserId: string,
    input: CreateRankHistoryInput,
    actor: AuthenticatedUser,
  ): Promise<RankHistory> {
    // Recording-permission rule (spec §7.1 notes): actor may record for self
    // or for a subject they can verify for (minus the recorder ≠  verifier
    // gate, which is only relevant at verify time). Sysadmin always allowed.
    const isSelf = actor.id === subjectUserId;
    if (!isSelf) {
      const allowedToRead = await this.auth.canRead(actor, subjectUserId);
      const isSysadmin = actor.role === 'sysadmin';
      if (!isSysadmin && !allowedToRead) {
        throw new ForbiddenException({
          error: { code: 'FORBIDDEN', message: 'Cannot record history for this user.' },
        });
      }
    }

    return this.db.transaction(async (tx) => {
      const row = await this.repo.insert(
        {
          userId: subjectUserId,
          rankId: input.rankId,
          shogoTitle: input.shogoTitle ?? null,
          date: input.date,
          result: 'pass',
          source: 'external',
          eventId: null,
          recordedByUserId: actor.id,
          examinerName: input.examinerName ?? null,
          organisationName: input.organisationName ?? null,
          notes: input.notes ?? null,
          verified: false,
          verifiedByUserId: null,
          verifiedAt: null,
        },
        tx,
      );
      return this.toApi(row);
    });
  }

  async update(
    id: string,
    input: UpdateRankHistoryInput,
    actor: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.db.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (!row) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }
      if (row.source === 'event') {
        throw new BadRequestException({ error: { code: 'SOURCE_EVENT', message: 'Event-sourced rows are immutable through this API.' } });
      }
      if (!this.auth.canEdit(actor, row)) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Cannot edit this row.' } });
      }

      const changesVerificationContent =
        ('rankId' in input && input.rankId !== row.rankId) ||
        ('date' in input && input.date !== row.date) ||
        ('shogoTitle' in input && (input.shogoTitle ?? null) !== row.shogoTitle);

      const patch = this.buildWritePatch(input);
      patch.updatedAt = new Date();
      patch.updatedByUserId = actor.id;

      if (row.verified && changesVerificationContent) {
        patch.verified = false;
        patch.verifiedByUserId = null;
        patch.verifiedAt = null;
      }

      const updated = await this.repo.update(id, patch, tx);
      if (!updated) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }

      // Shogo recompute when the row's verified-shogo footprint moved.
      const oldShogo = row.shogoTitle;
      const newShogo = 'shogoTitle' in input ? input.shogoTitle ?? null : oldShogo;
      const shogoMoved = oldShogo !== newShogo;
      const verificationCleared = row.verified && changesVerificationContent;
      if ((shogoMoved || verificationCleared) && (oldShogo || newShogo)) {
        await this.recomputeShogo(row.userId, tx);
      }

      return this.toApi(updated);
    });
  }

  async delete(id: string, actor: AuthenticatedUser): Promise<void> {
    return this.db.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (!row) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }
      if (row.source === 'event') {
        throw new BadRequestException({ error: { code: 'SOURCE_EVENT', message: 'Event-sourced rows are immutable through this API.' } });
      }
      if (!this.auth.canDelete(actor, row)) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Cannot delete this row.' } });
      }
      await this.repo.delete(id, tx);
      if (row.verified && row.shogoTitle) {
        await this.recomputeShogo(row.userId, tx);
      }
    });
  }

  async verify(id: string, actor: AuthenticatedUser): Promise<RankHistory> {
    return this.db.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (!row) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }
      if (row.source === 'event') {
        throw new BadRequestException({ error: { code: 'SOURCE_EVENT', message: 'Event-sourced rows are implicitly verified.' } });
      }
      if (row.verified) {
        throw new ConflictException({ error: { code: 'ALREADY_VERIFIED', message: 'Row is already verified.' } });
      }
      if (row.recordedByUserId === actor.id) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Recorder cannot verify their own row.' } });
      }
      const allowed = await this.auth.canVerify(actor, row, tx);
      if (!allowed) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Not permitted to verify this row.' } });
      }

      const now = new Date();
      const updated = await this.repo.update(
        id,
        {
          verified: true,
          verifiedByUserId: actor.id,
          verifiedAt: now,
          updatedAt: now,
          updatedByUserId: actor.id,
        },
        tx,
      );
      if (!updated) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }

      if (row.shogoTitle) {
        await this.recomputeShogo(row.userId, tx);
      }
      return this.toApi(updated);
    });
  }

  async unverify(id: string, actor: AuthenticatedUser): Promise<RankHistory> {
    return this.db.transaction(async (tx) => {
      const row = await this.repo.findById(id, tx);
      if (!row) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }
      if (row.source === 'event') {
        throw new BadRequestException({ error: { code: 'SOURCE_EVENT', message: 'Event-sourced rows cannot be unverified through this API.' } });
      }
      if (!row.verified) {
        throw new ConflictException({ error: { code: 'ALREADY_UNVERIFIED', message: 'Row is not currently verified.' } });
      }
      if (row.recordedByUserId === actor.id) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Recorder cannot unverify their own row.' } });
      }
      const allowed = await this.auth.canVerify(actor, row, tx);
      if (!allowed) {
        throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: 'Not permitted to unverify this row.' } });
      }

      const now = new Date();
      const updated = await this.repo.update(
        id,
        {
          verified: false,
          verifiedByUserId: null,
          verifiedAt: null,
          updatedAt: now,
          updatedByUserId: actor.id,
        },
        tx,
      );
      if (!updated) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: `Rank-history row ${id} not found.` } });
      }

      if (row.shogoTitle) {
        await this.recomputeShogo(row.userId, tx);
      }
      return this.toApi(updated);
    });
  }

  private async recomputeShogo(userId: string, tx: DrizzleExecutor): Promise<void> {
    const top = await this.repo.findHighestVerifiedShogo(userId, tx);
    await tx
      .update(userProfile)
      .set({ shogoTitle: top, updatedAt: new Date() })
      .where(eq(userProfile.userId, userId));
  }

  /** Copy only present keys (`exactOptionalPropertyTypes`-safe). */
  private buildWritePatch(input: UpdateRankHistoryInput): RankHistoryWritePatch {
    const patch: RankHistoryWritePatch = {};
    if ('rankId' in input) patch.rankId = input.rankId!;
    if ('shogoTitle' in input) patch.shogoTitle = input.shogoTitle ?? null;
    if ('date' in input) patch.date = input.date!;
    if ('examinerName' in input) patch.examinerName = input.examinerName ?? null;
    if ('organisationName' in input) patch.organisationName = input.organisationName ?? null;
    if ('notes' in input) patch.notes = input.notes ?? null;
    return patch;
  }

  private toApi(row: DbRankHistory): RankHistory {
    return {
      id: row.id,
      userId: row.userId,
      rankId: row.rankId,
      shogoTitle: row.shogoTitle,
      date: row.date,
      result: row.result,
      source: row.source,
      eventId: row.eventId,
      recordedByUserId: row.recordedByUserId,
      examinerName: row.examinerName,
      organisationName: row.organisationName,
      notes: row.notes,
      verified: row.verified,
      verifiedByUserId: row.verifiedByUserId,
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      updatedByUserId: row.updatedByUserId,
    };
  }
}
```

- [ ] **Step 4: Run the spec — expect PASS**

```
pnpm --filter backend test
```

Expected: PASS — `rank-history.service.spec.ts` passes all cases.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/modules/rank-history/rank-history.service.ts apps/backend/src/modules/rank-history/rank-history.service.spec.ts
git commit -m "feat(backend): RankHistoryService — CRUD + verify/unverify + shogo recompute"
```

---

### Task 16: Backend — `RankHistoryController` + DTOs + module + sysadmin-gate metadata spec

**Files:**
- Create: `apps/backend/src/modules/rank-history/dto/rank-history.dto.ts`
- Create: `apps/backend/src/modules/rank-history/dto/create-rank-history.dto.ts`
- Create: `apps/backend/src/modules/rank-history/dto/update-rank-history.dto.ts`
- Create: `apps/backend/src/modules/rank-history/rank-history.controller.ts`
- Create: `apps/backend/src/modules/rank-history/rank-history.controller.spec.ts`
- Create: `apps/backend/src/modules/rank-history/rank-history.abilities.ts`
- Create: `apps/backend/src/modules/rank-history/rank-history.module.ts`
- Modify: `apps/backend/src/modules/memberships/memberships.module.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.module.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Create the DTOs**

Create `apps/backend/src/modules/rank-history/dto/rank-history.dto.ts`:

```ts
import { RankHistorySchema } from '@repo/contracts/rank-history';
import { createZodDto } from 'nestjs-zod';
export class RankHistoryDto extends createZodDto(RankHistorySchema) {}
```

Create `apps/backend/src/modules/rank-history/dto/create-rank-history.dto.ts`:

```ts
import { CreateRankHistorySchema } from '@repo/contracts/rank-history';
import { createZodDto } from 'nestjs-zod';
export class CreateRankHistoryDto extends createZodDto(CreateRankHistorySchema) {}
```

Create `apps/backend/src/modules/rank-history/dto/update-rank-history.dto.ts`:

```ts
import { UpdateRankHistorySchema } from '@repo/contracts/rank-history';
import { createZodDto } from 'nestjs-zod';
export class UpdateRankHistoryDto extends createZodDto(UpdateRankHistorySchema) {}
```

- [ ] **Step 2: Create the ability contributor**

Create `apps/backend/src/modules/rank-history/rank-history.abilities.ts`:

```ts
import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * RankHistory rules — class-level only; per-row checks live in
 * `RankHistoryAuthService` (cross-join predicates can't be expressed in CASL
 * conditions). Every authenticated user gets the class-level rules; the
 * service-layer predicates then narrow per row and per subject.
 */
@Injectable()
export class RankHistoryAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (!user) return;
    builder.can('read', 'RankHistory');
    builder.can('create', 'RankHistory');
    builder.can('update', 'RankHistory');
    builder.can('delete', 'RankHistory');
  }
}
```

- [ ] **Step 3: Create the controller**

Create `apps/backend/src/modules/rank-history/rank-history.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { RankHistory } from '@repo/contracts/rank-history';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { CreateRankHistoryDto } from './dto/create-rank-history.dto.js';
import { RankHistoryDto } from './dto/rank-history.dto.js';
import { UpdateRankHistoryDto } from './dto/update-rank-history.dto.js';
import { RankHistoryService } from './rank-history.service.js';

@ApiTags('rank-history')
@ApiCookieAuth('session')
@Controller('rank-history')
export class RankHistoryController {
  constructor(private readonly service: RankHistoryService) {}

  @Get(':userId')
  @CheckAbility('read', 'RankHistory')
  @ApiParam({ name: 'userId', description: 'Subject user id.' })
  @ApiEndpoint({
    summary: 'List a user\'s raw rank-history rows (admin/self-only).',
    operationId: 'RankHistoryController_listForUser',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  listForUser(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory[]> {
    return this.service.list(userId, user);
  }

  @Post(':userId')
  @CheckAbility('create', 'RankHistory')
  @ApiParam({ name: 'userId', description: 'Subject user id.' })
  @ApiBody({ type: CreateRankHistoryDto })
  @ApiCreatedResponse({ type: RankHistoryDto })
  @ApiEndpoint({
    summary: 'Create an external rank-history entry for a user.',
    operationId: 'RankHistoryController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403'],
  })
  create(
    @Param('userId') userId: string,
    @Body() body: CreateRankHistoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.service.create(userId, body, user);
  }

  @Patch(':id')
  @CheckAbility('update', 'RankHistory')
  @ApiParam({ name: 'id', description: 'Rank-history row UUID.' })
  @ApiBody({ type: UpdateRankHistoryDto })
  @ApiOkResponse({ type: RankHistoryDto })
  @ApiEndpoint({
    summary: 'Update an external rank-history entry.',
    operationId: 'RankHistoryController_update',
    ok: RankHistoryDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateRankHistoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @CheckAbility('delete', 'RankHistory')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Rank-history row UUID.' })
  @ApiNoContentResponse({ description: 'Rank-history row deleted.' })
  @ApiEndpoint({
    summary: 'Delete an external rank-history entry.',
    operationId: 'RankHistoryController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.service.delete(id, user);
  }

  @Post(':id/verify')
  @CheckAbility('update', 'RankHistory')
  @ApiParam({ name: 'id', description: 'Rank-history row UUID.' })
  @ApiOkResponse({ type: RankHistoryDto })
  @ApiEndpoint({
    summary: 'Verify a rank-history row.',
    operationId: 'RankHistoryController_verify',
    ok: RankHistoryDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  verify(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.service.verify(id, user);
  }

  @Post(':id/unverify')
  @CheckAbility('update', 'RankHistory')
  @ApiParam({ name: 'id', description: 'Rank-history row UUID.' })
  @ApiOkResponse({ type: RankHistoryDto })
  @ApiEndpoint({
    summary: 'Unverify a rank-history row.',
    operationId: 'RankHistoryController_unverify',
    ok: RankHistoryDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  unverify(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankHistory> {
    return this.service.unverify(id, user);
  }
}
```

- [ ] **Step 4: Create the metadata-reflection spec**

Create `apps/backend/src/modules/rank-history/rank-history.controller.spec.ts`:

```ts
import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { CHECK_ABILITY_KEY } from '../../infrastructure/ability/check-ability.decorator.js';

import { RankHistoryController } from './rank-history.controller.js';

describe('RankHistoryController — authorization metadata', () => {
  it('listForUser carries read RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.listForUser),
    ).toEqual([{ action: 'read', subject: 'RankHistory' }]);
  });

  it('create carries create RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.create),
    ).toEqual([{ action: 'create', subject: 'RankHistory' }]);
  });

  it('update carries update RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.update),
    ).toEqual([{ action: 'update', subject: 'RankHistory' }]);
  });

  it('remove carries delete RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.remove),
    ).toEqual([{ action: 'delete', subject: 'RankHistory' }]);
  });

  it('verify carries update RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.verify),
    ).toEqual([{ action: 'update', subject: 'RankHistory' }]);
  });

  it('unverify carries update RankHistory', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, RankHistoryController.prototype.unverify),
    ).toEqual([{ action: 'update', subject: 'RankHistory' }]);
  });
});
```

- [ ] **Step 5: Export `MembershipsRepository` from `MembershipsModule`**

`RankHistoryAuthService` injects `MembershipsRepository` for the org-sharing predicate. `MembershipsModule` currently exports only `MembershipsService` — extend the exports.

In `apps/backend/src/modules/memberships/memberships.module.ts`:

```ts
@Module({
  imports: [OrganisationsModule],
  controllers: [MembershipsController],
  providers: [MembershipsService, MembershipsRepository],
  exports: [MembershipsService, MembershipsRepository],
})
export class MembershipsModule {}
```

(`OrganisationsRepository` is already exported by `OrganisationsModule` — confirmed by reading `organisations.module.ts`.)

- [ ] **Step 6: Create the module**

Create `apps/backend/src/modules/rank-history/rank-history.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { MembershipsModule } from '../memberships/memberships.module.js';
import { OrganisationsModule } from '../organisations/organisations.module.js';
import { UsersModule } from '../users/users.module.js';

import { RankHistoryAuthService } from './rank-history.auth.service.js';
import { RankHistoryController } from './rank-history.controller.js';
import { RankHistoryRepository } from './rank-history.repository.js';
import { RankHistoryService } from './rank-history.service.js';

/**
 * Owns the rank-history HTTP/data layer + the per-row auth service. Exports
 * the repository and the auth service so the grading-history projection
 * (Task 17) can reuse both without re-querying.
 */
@Module({
  imports: [UsersModule, OrganisationsModule, MembershipsModule],
  controllers: [RankHistoryController],
  providers: [RankHistoryService, RankHistoryRepository, RankHistoryAuthService],
  exports: [RankHistoryService, RankHistoryRepository, RankHistoryAuthService],
})
export class RankHistoryModule {}
```

- [ ] **Step 7: Register `RankHistoryAbilityRules` in `AbilityModule`**

In `apps/backend/src/infrastructure/ability/ability.module.ts`, add the import:

```ts
import { RankHistoryAbilityRules } from '../../modules/rank-history/rank-history.abilities.js';
```

Append the contributor to the providers array, after `BeltCatalogAbilityRules`:

```ts
    BeltCatalogAbilityRules,
    RankHistoryAbilityRules,
```

- [ ] **Step 8: Register `RankHistoryModule` in `AppModule`**

In `apps/backend/src/app.module.ts`, add the import after `BeltCatalogModule`:

```ts
import { RankHistoryModule } from './modules/rank-history/rank-history.module.js';
```

Append `RankHistoryModule` to the `imports` array, after `BeltCatalogModule`:

```ts
    BeltCatalogModule,
    RankHistoryModule,
    AuditLogModule,
```

- [ ] **Step 9: Typecheck and run the backend test suite**

```
pnpm --filter backend typecheck && pnpm --filter backend test
```

Expected: PASS — `tsc --noEmit` exits 0; `rank-history.controller.spec.ts` passes all 6 metadata assertions; every other spec stays green.

- [ ] **Step 10: Commit**

```
git add apps/backend/src/modules/rank-history/dto/rank-history.dto.ts apps/backend/src/modules/rank-history/dto/create-rank-history.dto.ts apps/backend/src/modules/rank-history/dto/update-rank-history.dto.ts apps/backend/src/modules/rank-history/rank-history.controller.ts apps/backend/src/modules/rank-history/rank-history.controller.spec.ts apps/backend/src/modules/rank-history/rank-history.abilities.ts apps/backend/src/modules/rank-history/rank-history.module.ts apps/backend/src/modules/memberships/memberships.module.ts apps/backend/src/infrastructure/ability/ability.module.ts apps/backend/src/app.module.ts
git commit -m "feat(backend): RankHistoryController + DTOs + module + ability rules + metadata spec"
```

---

### Task 17: Backend — `GradingHistoryProjection` module

**Files:**
- Create: `apps/backend/src/modules/grading-history-projection/grading-history.service.ts`
- Create: `apps/backend/src/modules/grading-history-projection/grading-history.service.spec.ts`
- Create: `apps/backend/src/modules/grading-history-projection/grading-history.controller.ts`
- Create: `apps/backend/src/modules/grading-history-projection/grading-history.module.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Write the failing service spec**

Create `apps/backend/src/modules/grading-history-projection/grading-history.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RankHistoryAuthService } from '../rank-history/rank-history.auth.service.js';
import { RankHistoryRepository } from '../rank-history/rank-history.repository.js';

import { GradingHistoryService } from './grading-history.service.js';

const sysadmin = {
  id: 'u-sys',
  email: 'sys@example.com',
  emailVerified: true,
  name: 'Sys',
  image: null,
  role: 'sysadmin' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

const UUID = '11111111-1111-1111-1111-111111111111';

function joinedExternal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    row: {
      id: 'r-1',
      userId: 'u-1',
      rankId: UUID,
      shogoTitle: null,
      date: '2024-09-01',
      result: 'pass',
      source: 'external',
      eventId: null,
      recordedByUserId: 'u-recorder',
      examinerName: 'Sensei Tanaka',
      organisationName: 'Kobe Dojo',
      notes: null,
      verified: false,
      verifiedByUserId: null,
      verifiedAt: null,
      createdAt: new Date(),
      updatedAt: null,
      updatedByUserId: null,
      ...overrides,
    },
    rank: { id: UUID, systemId: UUID, level: 1 },
    verifiedBy: null,
  };
}

function joinedEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    row: {
      ...joinedExternal().row,
      id: 'r-2',
      source: 'event',
      eventId: 'ev-1',
      examinerName: null,
      organisationName: null,
      verified: true,
      verifiedByUserId: 'u-event',
      verifiedAt: new Date(),
      ...overrides,
    },
    rank: { id: UUID, systemId: UUID, level: 1 },
    verifiedBy: { id: 'u-event', name: 'Event Creator' },
  };
}

function repoStub() {
  return {
    findById: vi.fn(),
    findByIdRaw: vi.fn(),
    listByUser: vi.fn(),
    listByUserJoined: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findHighestVerifiedShogo: vi.fn(),
  } satisfies Record<keyof RankHistoryRepository, ReturnType<typeof vi.fn>>;
}

function authStub() {
  return {
    loadRoleContext: vi.fn().mockResolvedValue({
      isSysadmin: true,
      headInstructorOf: new Set<string>(),
      sharesOrgWithSubject: false,
      instructorLinks: new Set<string>(),
      gradingOfficerCaps: new Map<string, number>(),
      subjectUserId: 'u-1',
    }),
    canRead: vi.fn(),
    canVerify: vi.fn(),
    canEdit: vi.fn(),
    canDelete: vi.fn(),
    canReadWithCtx: vi.fn().mockReturnValue(true),
    canEditWithCtx: vi.fn().mockReturnValue(true),
    canVerifyWithCtx: vi.fn().mockReturnValue(false),
  };
}

async function makeService(
  repo: ReturnType<typeof repoStub>,
  auth: ReturnType<typeof authStub> = authStub(),
) {
  const module = await Test.createTestingModule({
    providers: [
      GradingHistoryService,
      { provide: RankHistoryRepository, useValue: repo },
      { provide: RankHistoryAuthService, useValue: auth },
    ],
  }).compile();
  return { service: module.get(GradingHistoryService), auth };
}

describe('GradingHistoryService.list', () => {
  let repo: ReturnType<typeof repoStub>;

  beforeEach(() => {
    repo = repoStub();
  });

  it('loads the role context exactly once per request', async () => {
    repo.listByUserJoined.mockResolvedValue([joinedExternal(), joinedExternal({ id: 'r-3' })]);
    const auth = authStub();
    const { service } = await makeService(repo, auth);
    await service.list('u-1', sysadmin);
    expect(auth.loadRoleContext).toHaveBeenCalledTimes(1);
  });

  it('hydrates examiner / organisationName from row columns when source=external', async () => {
    repo.listByUserJoined.mockResolvedValue([joinedExternal()]);
    const { service } = await makeService(repo);
    const out = await service.list('u-1', sysadmin);
    expect(out[0]).toMatchObject({
      source: 'external',
      examiner: 'Sensei Tanaka',
      organisationName: 'Kobe Dojo',
    });
  });

  it('returns null examiner/organisationName when source=event (D1 deferred)', async () => {
    repo.listByUserJoined.mockResolvedValue([joinedEvent()]);
    const { service } = await makeService(repo);
    const out = await service.list('u-1', sysadmin);
    expect(out[0]).toMatchObject({
      source: 'event',
      examiner: null,
      organisationName: null,
    });
  });

  it('propagates canVerify / canEdit per row from the context', async () => {
    repo.listByUserJoined.mockResolvedValue([joinedExternal()]);
    const auth = authStub();
    auth.canVerifyWithCtx.mockReturnValue(true);
    auth.canEditWithCtx.mockReturnValue(true);
    const { service } = await makeService(repo, auth);
    const out = await service.list('u-1', sysadmin);
    expect(out[0]?.canVerify).toBe(true);
    expect(out[0]?.canEdit).toBe(true);
  });
});
```

- [ ] **Step 2: Run the spec — expect FAIL**

```
pnpm --filter backend test
```

Expected: FAIL — `grading-history.service.spec.ts` can't import `./grading-history.service.js`.

- [ ] **Step 3: Create the projection service**

Create `apps/backend/src/modules/grading-history-projection/grading-history.service.ts`:

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { GradingHistoryRow } from '@repo/contracts/rank-history';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  RankHistoryAuthService,
  type RoleContext,
} from '../rank-history/rank-history.auth.service.js';
import {
  RankHistoryRepository,
  type JoinedRankHistoryRow,
} from '../rank-history/rank-history.repository.js';

/**
 * Unified grading-history projection. Joins `rank_history` with `belt_ranks`
 * (for system+level lookup used by the eventual D3 grading-officer cap) and
 * with `user` (for the verifier's display name), then hydrates examiner /
 * organisationName per-row based on source.
 *
 * Role lookups are batched ONCE per request via `loadRoleContext` — the
 * per-row capability flags reuse that context, keeping the projection
 * O(rows) instead of O(rows × roles).
 *
 * v1 footprint: `source='event'` rows return `examiner=null` and
 * `organisationName=null` because the `grading_events` table (followup D1)
 * does not exist yet. Once D1 lands, the projection's repository can left-join
 * the event tables and the hydration branch fills in.
 */
@Injectable()
export class GradingHistoryService {
  constructor(
    private readonly repo: RankHistoryRepository,
    private readonly auth: RankHistoryAuthService,
  ) {}

  async list(subjectUserId: string, actor: AuthenticatedUser): Promise<GradingHistoryRow[]> {
    const ctx = await this.auth.loadRoleContext(actor, subjectUserId);
    if (!this.auth.canReadWithCtx(actor, ctx)) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: 'Cannot read history for this user.' },
      });
    }
    const rows = await this.repo.listByUserJoined(subjectUserId);
    return rows.map((r) => this.toProjection(r, actor, ctx));
  }

  private toProjection(
    joined: JoinedRankHistoryRow,
    actor: AuthenticatedUser,
    ctx: RoleContext,
  ): GradingHistoryRow {
    const r = joined.row;
    const isExternal = r.source === 'external';
    return {
      id: r.id,
      source: r.source,
      userId: r.userId,
      rankId: r.rankId,
      shogoTitle: r.shogoTitle,
      date: r.date,
      result: r.result,
      notes: r.notes,
      // D1: event-sourced rows have null examiner/org until grading_events lands.
      examiner: isExternal ? r.examinerName : null,
      organisationName: isExternal ? r.organisationName : null,
      verified: r.verified,
      verifiedBy: joined.verifiedBy ? { id: joined.verifiedBy.id, name: joined.verifiedBy.name ?? joined.verifiedBy.id } : null,
      verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
      canVerify: this.auth.canVerifyWithCtx(actor, r, ctx),
      canEdit: this.auth.canEditWithCtx(actor, r, ctx),
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      updatedByUserId: r.updatedByUserId,
    };
  }
}
```

- [ ] **Step 4: Create the controller**

Create `apps/backend/src/modules/grading-history-projection/grading-history.controller.ts`:

```ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import type { GradingHistoryResponse } from '@repo/contracts/rank-history';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { GradingHistoryService } from './grading-history.service.js';

@ApiTags('grading-history')
@ApiCookieAuth('session')
@Controller('grading-events')
export class GradingHistoryController {
  constructor(private readonly service: GradingHistoryService) {}

  @Get('history/:userId')
  @CheckAbility('read', 'RankHistory')
  @ApiParam({ name: 'userId', description: 'Subject user id.' })
  @ApiEndpoint({
    summary: 'Unified grading-history projection for a user (event + external).',
    operationId: 'GradingHistoryController_list',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  async list(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GradingHistoryResponse> {
    const data = await this.service.list(userId, user);
    return { data };
  }
}
```

- [ ] **Step 5: Create the module**

Create `apps/backend/src/modules/grading-history-projection/grading-history.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { RankHistoryModule } from '../rank-history/rank-history.module.js';

import { GradingHistoryController } from './grading-history.controller.js';
import { GradingHistoryService } from './grading-history.service.js';

/**
 * Unified projection module — bridges the rank-history layer and the
 * frontend's "grading-history page" API. Depends on `RankHistoryModule` for
 * the repository + auth service (both exported there).
 */
@Module({
  imports: [RankHistoryModule],
  controllers: [GradingHistoryController],
  providers: [GradingHistoryService],
})
export class GradingHistoryProjectionModule {}
```

- [ ] **Step 6: Register the module in `AppModule`**

In `apps/backend/src/app.module.ts`, add the import:

```ts
import { GradingHistoryProjectionModule } from './modules/grading-history-projection/grading-history.module.js';
```

Append to the `imports` array, after `RankHistoryModule`:

```ts
    RankHistoryModule,
    GradingHistoryProjectionModule,
    AuditLogModule,
```

- [ ] **Step 7: Run the test suite — expect PASS**

```
pnpm --filter backend typecheck && pnpm --filter backend test
```

Expected: PASS — `tsc --noEmit` exits 0; `grading-history.service.spec.ts` passes all 4 cases.

- [ ] **Step 8: Commit**

```
git add apps/backend/src/modules/grading-history-projection/grading-history.service.ts apps/backend/src/modules/grading-history-projection/grading-history.service.spec.ts apps/backend/src/modules/grading-history-projection/grading-history.controller.ts apps/backend/src/modules/grading-history-projection/grading-history.module.ts apps/backend/src/app.module.ts
git commit -m "feat(backend): GradingHistoryProjection — unified rank-history with batched per-row flags"
```

---

### Task 18: Backend — seeder stub for the belt catalog

**Files:**
- Create: `apps/backend/src/infrastructure/database/seeds/belt-catalog.seed.json`
- Create: `apps/backend/src/infrastructure/database/seeds/belt-catalog.seed.ts`

- [ ] **Step 1: Create the JSON fixture**

Create `apps/backend/src/infrastructure/database/seeds/belt-catalog.seed.json`:

```json
{
  "beltSystems": [
    { "code": "kyu", "nameEn": "Kyu", "nameSv": "Kyu", "nameFi": "Kyu", "sortOrder": 1 },
    { "code": "dan", "nameEn": "Dan", "nameSv": "Dan", "nameFi": "Dan", "sortOrder": 2 },
    { "code": "mon", "nameEn": "Mon", "nameSv": "Mon", "nameFi": "Mon", "sortOrder": 3 }
  ],
  "beltRanks": [
    { "systemCode": "kyu", "level": 1,  "sortOrder": 10, "nameRomaji": "Jukyu",      "nameEn": "10th Kyu", "nameSv": "10 Kyu", "nameFi": "10. Kyu", "beltColor": "#FFFFFF", "publiclyVisible": false },
    { "systemCode": "kyu", "level": 2,  "sortOrder": 11, "nameRomaji": "Kukyu",      "nameEn": "9th Kyu",  "nameSv": "9 Kyu",  "nameFi": "9. Kyu",  "beltColor": "#FFD580", "publiclyVisible": false },
    { "systemCode": "kyu", "level": 3,  "sortOrder": 12, "nameRomaji": "Hachikyu",   "nameEn": "8th Kyu",  "nameSv": "8 Kyu",  "nameFi": "8. Kyu",  "beltColor": "#FFE066", "publiclyVisible": false },
    { "systemCode": "kyu", "level": 4,  "sortOrder": 13, "nameRomaji": "Shichikyu",  "nameEn": "7th Kyu",  "nameSv": "7 Kyu",  "nameFi": "7. Kyu",  "beltColor": "#A8E063", "publiclyVisible": false },
    { "systemCode": "kyu", "level": 5,  "sortOrder": 14, "nameRomaji": "Rokukyu",    "nameEn": "6th Kyu",  "nameSv": "6 Kyu",  "nameFi": "6. Kyu",  "beltColor": "#7AC74F", "publiclyVisible": false },
    { "systemCode": "kyu", "level": 6,  "sortOrder": 15, "nameRomaji": "Gokyu",      "nameEn": "5th Kyu",  "nameSv": "5 Kyu",  "nameFi": "5. Kyu",  "beltColor": "#6EC1E4", "publiclyVisible": false },
    { "systemCode": "kyu", "level": 7,  "sortOrder": 16, "nameRomaji": "Yonkyu",     "nameEn": "4th Kyu",  "nameSv": "4 Kyu",  "nameFi": "4. Kyu",  "beltColor": "#5085BB", "publiclyVisible": false },
    { "systemCode": "kyu", "level": 8,  "sortOrder": 17, "nameRomaji": "Sankyu",     "nameEn": "3rd Kyu",  "nameSv": "3 Kyu",  "nameFi": "3. Kyu",  "beltColor": "#8C6BB1", "publiclyVisible": false },
    { "systemCode": "kyu", "level": 9,  "sortOrder": 18, "nameRomaji": "Nikyu",      "nameEn": "2nd Kyu",  "nameSv": "2 Kyu",  "nameFi": "2. Kyu",  "beltColor": "#B85C00", "publiclyVisible": false },
    { "systemCode": "kyu", "level": 10, "sortOrder": 19, "nameRomaji": "Ikkyu",      "nameEn": "1st Kyu",  "nameSv": "1 Kyu",  "nameFi": "1. Kyu",  "beltColor": "#7C4A03", "publiclyVisible": false },

    { "systemCode": "dan", "level": 1,  "sortOrder": 20, "nameRomaji": "Shodan",   "nameEn": "1st Dan",  "nameSv": "1 Dan",  "nameFi": "1. Dan",  "beltColor": "#000000", "publiclyVisible": false },
    { "systemCode": "dan", "level": 2,  "sortOrder": 21, "nameRomaji": "Nidan",    "nameEn": "2nd Dan",  "nameSv": "2 Dan",  "nameFi": "2. Dan",  "beltColor": "#000000", "publiclyVisible": false },
    { "systemCode": "dan", "level": 3,  "sortOrder": 22, "nameRomaji": "Sandan",   "nameEn": "3rd Dan",  "nameSv": "3 Dan",  "nameFi": "3. Dan",  "beltColor": "#000000", "publiclyVisible": false },
    { "systemCode": "dan", "level": 4,  "sortOrder": 23, "nameRomaji": "Yondan",   "nameEn": "4th Dan",  "nameSv": "4 Dan",  "nameFi": "4. Dan",  "beltColor": "#000000", "publiclyVisible": false },
    { "systemCode": "dan", "level": 5,  "sortOrder": 24, "nameRomaji": "Godan",    "nameEn": "5th Dan",  "nameSv": "5 Dan",  "nameFi": "5. Dan",  "beltColor": "#000000", "publiclyVisible": false },
    { "systemCode": "dan", "level": 6,  "sortOrder": 25, "nameRomaji": "Rokudan",  "nameEn": "6th Dan",  "nameSv": "6 Dan",  "nameFi": "6. Dan",  "beltColor": "#000000", "publiclyVisible": false },
    { "systemCode": "dan", "level": 7,  "sortOrder": 26, "nameRomaji": "Nanadan",  "nameEn": "7th Dan",  "nameSv": "7 Dan",  "nameFi": "7. Dan",  "beltColor": "#000000", "publiclyVisible": false },
    { "systemCode": "dan", "level": 8,  "sortOrder": 27, "nameRomaji": "Hachidan", "nameEn": "8th Dan",  "nameSv": "8 Dan",  "nameFi": "8. Dan",  "beltColor": "#000000", "publiclyVisible": false },
    { "systemCode": "dan", "level": 9,  "sortOrder": 28, "nameRomaji": "Kudan",    "nameEn": "9th Dan",  "nameSv": "9 Dan",  "nameFi": "9. Dan",  "beltColor": "#000000", "publiclyVisible": false },
    { "systemCode": "dan", "level": 10, "sortOrder": 29, "nameRomaji": "Judan",    "nameEn": "10th Dan", "nameSv": "10 Dan", "nameFi": "10. Dan", "beltColor": "#000000", "publiclyVisible": false },

    { "systemCode": "mon", "level": 1, "sortOrder": 30, "nameRomaji": "Ichimon", "nameEn": "1 Mon", "nameSv": "1 Mon", "nameFi": "1 Mon", "beltColor": "#FFFFFF", "publiclyVisible": false },
    { "systemCode": "mon", "level": 2, "sortOrder": 31, "nameRomaji": "Nimon",   "nameEn": "2 Mon", "nameSv": "2 Mon", "nameFi": "2 Mon", "beltColor": "#FFFFFF", "publiclyVisible": false },
    { "systemCode": "mon", "level": 3, "sortOrder": 32, "nameRomaji": "Sanmon",  "nameEn": "3 Mon", "nameSv": "3 Mon", "nameFi": "3 Mon", "beltColor": "#FFFFFF", "publiclyVisible": false }
  ],
  "shogoTitles": [
    { "code": "renshi", "nameEn": "Renshi", "nameSv": "Renshi", "nameFi": "Renshi", "nameJa": "錬士", "minRankRomaji": "Yondan",  "sortOrder": 1 },
    { "code": "kyoshi", "nameEn": "Kyoshi", "nameSv": "Kyoshi", "nameFi": "Kyoshi", "nameJa": "教士", "minRankRomaji": "Rokudan", "sortOrder": 2 },
    { "code": "hanshi", "nameEn": "Hanshi", "nameSv": "Hanshi", "nameFi": "Hanshi", "nameJa": "範士", "minRankRomaji": "Nanadan", "sortOrder": 3 }
  ]
}
```

Validate that the file is well-formed JSON before continuing:

```
node -e "JSON.parse(require('node:fs').readFileSync('apps/backend/src/infrastructure/database/seeds/belt-catalog.seed.json','utf8'))"
```

The script should print nothing and exit 0. If it throws, a stray smart-quote or trailing comma snuck in — fix it before moving on.

- [ ] **Step 2: Create the seed function**

Create `apps/backend/src/infrastructure/database/seeds/belt-catalog.seed.ts`:

```ts
/**
 * Idempotent seeder for the belt catalog (systems, ranks, shogos).
 *
 * Resolves natural keys:
 * - `belt_systems` by (organisation_id, code).
 * - `belt_ranks` by (organisation_id, system_id, level), with `system_id`
 *   looked up from the system's code.
 * - `shogo_titles` by `code`, with `min_rank_id` looked up from the rank's
 *   romaji name.
 *
 * Inserts when absent, updates the listed columns when present. Rows it did
 * not author are left untouched.
 *
 * TODO: the runner that invokes this seeder is a follow-up. There is no
 * `db:seed:belt-catalog` script wired into `apps/backend/package.json` at
 * the time this file lands — it is exposed as a pure function so a future
 * runner (alongside `seed-sysadmin.ts`) can call it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq, isNull } from 'drizzle-orm';

import { type DrizzleDb } from '../client.js';
import {
  beltRanks,
  beltSystems,
  shogoTitles,
} from '../schema/index.js';

interface SeedSystem {
  code: string;
  nameEn: string;
  nameSv: string;
  nameFi: string;
  sortOrder: number;
}

interface SeedRank {
  systemCode: string;
  level: number;
  sortOrder: number;
  nameRomaji: string;
  nameEn: string;
  nameSv: string;
  nameFi: string;
  beltColor: string;
  publiclyVisible: boolean;
}

interface SeedShogo {
  code: string;
  nameEn: string;
  nameSv: string;
  nameFi: string;
  nameJa: string;
  minRankRomaji: string;
  sortOrder: number;
}

interface BeltCatalogSeedJson {
  beltSystems: SeedSystem[];
  beltRanks: SeedRank[];
  shogoTitles: SeedShogo[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, 'belt-catalog.seed.json');

export interface BeltCatalogSeedResult {
  systems: { inserted: number; updated: number };
  ranks: { inserted: number; updated: number };
  shogos: { inserted: number; updated: number };
}

export async function seedBeltCatalog(db: DrizzleDb): Promise<BeltCatalogSeedResult> {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as BeltCatalogSeedJson;

  const result: BeltCatalogSeedResult = {
    systems: { inserted: 0, updated: 0 },
    ranks: { inserted: 0, updated: 0 },
    shogos: { inserted: 0, updated: 0 },
  };

  // ---- systems (all seeded as global → organisation_id is NULL) ----
  for (const sys of fixture.beltSystems) {
    const existing = (
      await db
        .select()
        .from(beltSystems)
        .where(and(isNull(beltSystems.organisationId), eq(beltSystems.code, sys.code)))
        .limit(1)
    )[0];
    if (existing) {
      await db
        .update(beltSystems)
        .set({
          nameEn: sys.nameEn,
          nameSv: sys.nameSv,
          nameFi: sys.nameFi,
          sortOrder: sys.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(beltSystems.id, existing.id));
      result.systems.updated += 1;
    } else {
      await db.insert(beltSystems).values({
        code: sys.code,
        nameEn: sys.nameEn,
        nameSv: sys.nameSv,
        nameFi: sys.nameFi,
        organisationId: null,
        sortOrder: sys.sortOrder,
      });
      result.systems.inserted += 1;
    }
  }

  // ---- ranks ----
  for (const rank of fixture.beltRanks) {
    const system = (
      await db
        .select({ id: beltSystems.id })
        .from(beltSystems)
        .where(and(isNull(beltSystems.organisationId), eq(beltSystems.code, rank.systemCode)))
        .limit(1)
    )[0];
    if (!system) {
      throw new Error(`Seed error: belt system "${rank.systemCode}" not found for rank "${rank.nameRomaji}".`);
    }
    const existing = (
      await db
        .select()
        .from(beltRanks)
        .where(
          and(
            isNull(beltRanks.organisationId),
            eq(beltRanks.systemId, system.id),
            eq(beltRanks.level, rank.level),
          ),
        )
        .limit(1)
    )[0];
    if (existing) {
      await db
        .update(beltRanks)
        .set({
          sortOrder: rank.sortOrder,
          nameRomaji: rank.nameRomaji,
          nameEn: rank.nameEn,
          nameSv: rank.nameSv,
          nameFi: rank.nameFi,
          beltColor: rank.beltColor,
          publiclyVisible: rank.publiclyVisible,
          updatedAt: new Date(),
        })
        .where(eq(beltRanks.id, existing.id));
      result.ranks.updated += 1;
    } else {
      await db.insert(beltRanks).values({
        organisationId: null,
        systemId: system.id,
        level: rank.level,
        sortOrder: rank.sortOrder,
        nameRomaji: rank.nameRomaji,
        nameEn: rank.nameEn,
        nameSv: rank.nameSv,
        nameFi: rank.nameFi,
        beltColor: rank.beltColor,
        publiclyVisible: rank.publiclyVisible,
      });
      result.ranks.inserted += 1;
    }
  }

  // ---- shogos ----
  for (const shogo of fixture.shogoTitles) {
    const rank = (
      await db
        .select({ id: beltRanks.id })
        .from(beltRanks)
        .where(eq(beltRanks.nameRomaji, shogo.minRankRomaji))
        .limit(1)
    )[0];
    if (!rank) {
      throw new Error(`Seed error: belt rank "${shogo.minRankRomaji}" not found for shogo "${shogo.code}".`);
    }
    const existing = (
      await db.select().from(shogoTitles).where(eq(shogoTitles.code, shogo.code)).limit(1)
    )[0];
    if (existing) {
      await db
        .update(shogoTitles)
        .set({
          nameEn: shogo.nameEn,
          nameSv: shogo.nameSv,
          nameFi: shogo.nameFi,
          nameJa: shogo.nameJa,
          minRankId: rank.id,
          sortOrder: shogo.sortOrder,
        })
        .where(eq(shogoTitles.code, shogo.code));
      result.shogos.updated += 1;
    } else {
      await db.insert(shogoTitles).values({
        code: shogo.code,
        nameEn: shogo.nameEn,
        nameSv: shogo.nameSv,
        nameFi: shogo.nameFi,
        nameJa: shogo.nameJa,
        minRankId: rank.id,
        sortOrder: shogo.sortOrder,
      });
      result.shogos.inserted += 1;
    }
  }

  return result;
}
```

- [ ] **Step 3: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0.

- [ ] **Step 4: Commit**

```
git add apps/backend/src/infrastructure/database/seeds/belt-catalog.seed.json apps/backend/src/infrastructure/database/seeds/belt-catalog.seed.ts
git commit -m "feat(backend): belt-catalog seeder stub (function + JSON fixture, runner deferred)"
```

---

### Task 19: Backend — regenerate OpenAPI

**Files:**
- Modify: `packages/contracts/openapi/openapi.json` (generated)
- Modify: `packages/contracts/openapi/openapi.yaml` (generated)

- [ ] **Step 1: Regenerate the OpenAPI document**

```
pnpm openapi:generate
```

Expected: PASS — turbo runs the backend's `openapi:generate` task; the Nest app boots, Swagger serialises, and the YAML + JSON files are rewritten.

- [ ] **Step 2: Inspect the diff**

```
git status --short packages/contracts/openapi/
```

Expected: both `openapi.json` and `openapi.yaml` show as modified. The diff adds:
- **16 paths** total: 4 belt-systems (`GET`/`POST` on base, `PATCH`/`DELETE` on `:id`), 5 ranks (`GET`/`POST` on base, `GET`/`PATCH`/`DELETE` on `:id`), 4 shogo-titles (`GET`/`POST` on base, `PATCH`/`DELETE` on `:code`), 6 rank-history (`GET`/`POST` on `:userId`, `PATCH`/`DELETE` on `:id`, plus `POST :id/verify` and `POST :id/unverify`), 1 grading-history (`GET /grading-events/history/:userId`).
- Component schemas for `BeltSystem`, `CreateBeltSystemInput`, `UpdateBeltSystemInput`, `BeltRank`, `CreateBeltRankInput`, `UpdateBeltRankInput`, `ShogoTitle`, `CreateShogoTitleInput`, `UpdateShogoTitleInput`, `RankHistory`, `RankHistoryResult`, `RankHistorySource`, `CreateRankHistoryInput`, `UpdateRankHistoryInput`, `GradingHistoryRow`, `GradingHistoryResponse`.

If — and only if — `git status` reports no changes, state "OpenAPI already up to date — no drift" and skip Step 3.

- [ ] **Step 3: Commit**

```
git add packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "chore(contracts): regenerate OpenAPI with belt-catalog + rank-history + projection paths"
```

---

### Task 20: Full pipeline + manual verification

**Files:**
- (no source files — verification task; a final commit only if regenerated artefacts remain)

- [ ] **Step 1: Run the full turbo pipeline**

```
pnpm turbo run typecheck lint arch test build
```

Expected: PASS — every task across `@repo/contracts`, `backend`, and `frontend` succeeds: `typecheck` (0 errors), `lint` (0 errors), `arch` (Steiger 0 errors — note this plan adds no frontend code so the frontend `arch` is unchanged), `test` (every new spec green: belt-systems, ranks, shogo-titles contracts; rank-history contracts; belt-systems / belt-ranks / shogo-titles / rank-history / grading-history services; rank-history.auth service; rank-history.controller metadata), and `build` (contracts tsup + backend nest build + frontend Vite build all exit 0).

- [ ] **Step 2: Confirm OpenAPI has no drift**

```
pnpm openapi:generate
git status --short packages/contracts/openapi/
```

Expected: `git status` reports no changes under `packages/contracts/openapi/` — the document was already regenerated in Task 19.

- [ ] **Step 3: Manual verification checklist (do not automate)**

Perform these steps by hand against a running dev environment:

1. Apply migration `0011` to the dev database:
   ```
   pnpm --filter backend db:migrate
   ```
   Confirm the four new tables (`belt_systems`, `belt_ranks`, `shogo_titles`, `rank_history`), the two new enums (`rank_history_result`, `rank_history_source`), and the `user_profile.shogo_title` column.

2. Run the seeder once via a one-off `tsx` invocation (no runner script exists yet — see Task 18). From `apps/backend/`:
   ```
   pnpm exec tsx --env-file-if-exists=../../.env -e "import('./src/infrastructure/database/client.js').then(({ createDrizzleClient }) => import('./src/infrastructure/database/seeds/belt-catalog.seed.js').then(({ seedBeltCatalog }) => seedBeltCatalog(createDrizzleClient(process.env.DATABASE_URL)).then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); })))"
   ```
   Confirm the output reports the inserted counts (3 systems, 23 ranks, 3 shogos on first run; all updates on a re-run).

3. Start the backend dev server. Sign in as a normal user. With `curl` (cookies preserved) or via Swagger UI at `/api/docs`:
   - `GET /api/belt-systems` returns the 3 seeded systems.
   - `GET /api/ranks` returns the 23 seeded ranks.
   - `GET /api/shogo-titles` returns the 3 seeded shogos.
   - `POST /api/rank-history/<your-user-id>` with `{ "rankId": "<some-rank-uuid>", "date": "2024-09-01" }` creates an external entry with `verified=false`, `source='external'`, `recordedByUserId=<your id>`.
   - `GET /api/grading-events/history/<your-user-id>` returns the projection with the new entry; `canVerify=false` (since you are the recorder), `canEdit=true`.

4. Still as the same user, `POST /api/rank-history/<row-id>/verify` → expect 403 `FORBIDDEN` (recorder ≠  verifier).

5. Sign in as a sysadmin. `POST /api/rank-history/<row-id>/verify` → expect 200 with `verified=true` and a populated `verifiedBy` block. Re-`GET` the projection and confirm `verified=true`.

6. As sysadmin, create a row with `shogoTitle="kyoshi"` against the same user (subject), then verify it → confirm `user_profile.shogo_title` is now `"kyoshi"` (query the DB directly or via a future profile endpoint).

7. `DELETE /api/ranks/<seeded-rank-id>` for a rank referenced by a `rank_history` row → expect 409 `RANK_IN_USE`.

8. `DELETE /api/belt-systems/<kyu-system-id>` → expect 409 `SYSTEM_IN_USE`.

- [ ] **Step 4: Final commit (only if regenerated artefacts remain)**

```
git status --short
```

If `git status` shows any tracked, regenerated artefact still uncommitted (e.g. an OpenAPI file changed by Step 2), stage and commit it:

```
git add packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "chore: sync regenerated OpenAPI"
```

If `git status` is clean, state "Working tree clean — no final commit needed" and skip the commit.

---

## Notes

- **Migration is generated, not applied.** Task 4 only generates `0011_*.sql` via `db:generate`. Applying it is environment-specific and is run per-environment with `pnpm --filter backend db:migrate` (covered in the Task 20 manual checklist).
- **`event_id` has no FK constraint at v1.** The `rank_history.event_id` column exists with a partial unique index that prevents double-mirroring, but the FK to `grading_events(id)` is deferred to followup D1. The two CHECK constraints (`source`/`event_id` consistency, `verified`-triple atomicity) still apply at the DB level.
- **Verifier predicates fail closed for D2 and D3.** `RankHistoryAuthService.canVerifyWithCtx` returns `true` only for sysadmin and head-instructor-of-subject's-org in this phase. The linked-instructor (D2) and capped grading-officer (D3) branches resolve to `false` because their backing tables don't exist; activating them is a one-line code change per followup.
- **`current_rank_id` rank-delete guard is a v1 no-op.** `BeltRanksService.delete` covers three of the four reference types from spec §5 rule 6 (`rank_history`, `next_rank_id`, `shogo_titles.min_rank_id`); the fourth — `user_profile.current_rank_id` — is deferred until followup D4 ships that column. The comment in `BeltRanksService.delete` documents this explicitly.
- **No audit-log writes for rank-history operations.** Per spec §2, external entry create / edit / verify / unverify are deliberately NOT written to the audit log in v1; lifecycle visibility lives in the row itself (`recordedByUserId`, `verifiedByUserId`, `updatedByUserId`, timestamps). `RankHistoryService` therefore does not inject `AuditLogService`.
- **Shogo recompute is operative now.** Task 4 added `user_profile.shogo_title`, so the recompute path on verify/unverify writes a real column. The other half of D4 (`user_profile.current_rank_id`) remains deferred and does not block this phase.
- **No frontend code in this plan.** Spec §9 covers the frontend belt-catalog admin UI, the grading-history page, the `BeltGraphic` component, and the i18n keys — those are out of scope for this implementation plan and are tracked separately. This plan ships only the backend half (modules + DB + OpenAPI + seeder).
