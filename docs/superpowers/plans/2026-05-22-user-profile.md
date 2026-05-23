# User Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a self-service user profile — first/last name, date of birth, taido training start date, structured address, and multiple citizenships — with a `/profile` page and a read-only Profile tab in the admin user form.

**Architecture:** A new 1:1 `user_profile` table extends the better-auth `user` table. A `ProfileModule` exposes self-service read/edit endpoints plus a sysadmin read-only view; first/last name are the source of truth and `user.name` is kept synced. The frontend adds a `/profile` page, a `profile-form` feature, a sidebar entry, and a read-only tab in the admin user form.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL, Zod 4 (`@repo/contracts`), React 19, Vite, TanStack Router/Query, Feature-Sliced Design, Vitest + Testing Library.

---

### Task 1: Contracts — profile schemas + subpath export

**Files:**
- Create: `packages/contracts/src/profile.ts`
- Create: `packages/contracts/src/__tests__/profile.test.ts`
- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/tsup.config.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Write the failing contract test**

Create `packages/contracts/src/__tests__/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { UpdateUserProfileSchema, UserProfileSchema } from '../profile.js';

const FULL_PROFILE = {
  userId: 'u-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-12-10',
  taidoStartDate: '2015-09-01',
  addressStreet: '12 Analytical Way',
  addressPostalCode: '11122',
  addressCity: 'Stockholm',
  addressCountry: 'SWE',
  citizenships: ['SWE', 'GBR'],
};

const EMPTY_PROFILE = {
  userId: 'u-1',
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  taidoStartDate: null,
  addressStreet: null,
  addressPostalCode: null,
  addressCity: null,
  addressCountry: null,
  citizenships: [],
};

describe('UserProfileSchema', () => {
  it('accepts a fully-populated profile', () => {
    expect(UserProfileSchema.safeParse(FULL_PROFILE).success).toBe(true);
  });

  it('accepts an all-null profile with an empty citizenships array', () => {
    expect(UserProfileSchema.safeParse(EMPTY_PROFILE).success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      UserProfileSchema.safeParse({ ...FULL_PROFILE, dateOfBirth: '2026-13-99' }).success,
    ).toBe(false);
  });

  it('rejects an unknown country code in addressCountry', () => {
    expect(
      UserProfileSchema.safeParse({ ...FULL_PROFILE, addressCountry: 'XXX' }).success,
    ).toBe(false);
  });

  it('rejects an unknown country code inside citizenships', () => {
    expect(
      UserProfileSchema.safeParse({ ...FULL_PROFILE, citizenships: ['SWE', 'XXX'] }).success,
    ).toBe(false);
  });
});

describe('UpdateUserProfileSchema', () => {
  it('accepts a partial patch', () => {
    expect(UpdateUserProfileSchema.safeParse({ firstName: 'Ada' }).success).toBe(true);
  });

  it('accepts explicit nulls to clear fields', () => {
    expect(
      UpdateUserProfileSchema.safeParse({ firstName: null, dateOfBirth: null, addressCountry: null })
        .success,
    ).toBe(true);
  });

  it('accepts an empty patch', () => {
    expect(UpdateUserProfileSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a bad date', () => {
    expect(UpdateUserProfileSchema.safeParse({ dateOfBirth: '2026-13-99' }).success).toBe(false);
  });

  it('rejects an unknown country code', () => {
    expect(UpdateUserProfileSchema.safeParse({ addressCountry: 'XXX' }).success).toBe(false);
  });

  it('rejects an over-long firstName', () => {
    expect(UpdateUserProfileSchema.safeParse({ firstName: 'a'.repeat(201) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter contracts test
```

Expected: FAIL — `Failed to resolve import "../profile.js"` / `UserProfileSchema is not exported`. The `profile.test.ts` suite cannot run because `src/profile.ts` does not exist yet.

- [ ] **Step 3: Create the profile contract module**

Create `packages/contracts/src/profile.ts`:

```ts
import { ISO_3166_ALPHA3_CODES } from './iso-3166-alpha3.js';
import { z } from './zod-openapi.js';

/**
 * An ISO 3166-1 alpha-3 country code — the same representation
 * `organisations.country` uses. Refined against the static
 * `ISO_3166_ALPHA3_CODES` tuple so the contract rejects free text.
 */
export const CountryCodeSchema = z
  .string()
  .refine((c) => (ISO_3166_ALPHA3_CODES as readonly string[]).includes(c), {
    message: 'Unknown country code.',
  });

/**
 * The full user profile as returned by the API. All personal fields are
 * nullable; `citizenships` is always an array (possibly empty). The
 * `created_at` / `updated_at` bookkeeping columns are deliberately not
 * exposed — the profile UI has no use for them.
 */
export const UserProfileSchema = z
  .object({
    userId: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    dateOfBirth: z.string().date().nullable(),
    taidoStartDate: z.string().date().nullable(),
    addressStreet: z.string().nullable(),
    addressPostalCode: z.string().nullable(),
    addressCity: z.string().nullable(),
    addressCountry: CountryCodeSchema.nullable(),
    citizenships: CountryCodeSchema.array(),
  })
  .meta({
    id: 'UserProfile',
    description: "A user's self-service profile — personal and taido-training details.",
    example: {
      userId: 'u-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1990-12-10',
      taidoStartDate: '2015-09-01',
      addressStreet: '12 Analytical Way',
      addressPostalCode: '11122',
      addressCity: 'Stockholm',
      addressCountry: 'SWE',
      citizenships: ['SWE', 'GBR'],
    },
  });

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * The editable subset — a partial PATCH. Every field is `.optional()`
 * (omitted = no change); text/date fields are also `.nullable()` so a user
 * can blank them out.
 */
export const UpdateUserProfileSchema = z
  .object({
    firstName: z.string().max(200).nullable().optional(),
    lastName: z.string().max(200).nullable().optional(),
    dateOfBirth: z.string().date().nullable().optional(),
    taidoStartDate: z.string().date().nullable().optional(),
    addressStreet: z.string().max(300).nullable().optional(),
    addressPostalCode: z.string().max(20).nullable().optional(),
    addressCity: z.string().max(200).nullable().optional(),
    addressCountry: CountryCodeSchema.nullable().optional(),
    citizenships: CountryCodeSchema.array().optional(),
  })
  .meta({
    id: 'UpdateUserProfileInput',
    description: 'A partial profile patch — omit a field to leave it unchanged.',
    example: { firstName: 'Ada', lastName: 'Lovelace', citizenships: ['SWE', 'GBR'] },
  });

export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileSchema>;

export const ProfileOpenApiRegistry = {
  UserProfile: UserProfileSchema,
  UpdateUserProfileInput: UpdateUserProfileSchema,
} as const;
```

- [ ] **Step 4: Add the `./profile` subpath export to `package.json`**

In `packages/contracts/package.json`, inside the `"exports"` map, add a `"./profile"` entry immediately after the `"./memberships"` block (mirror it exactly):

```json
    "./memberships": {
      "import": {
        "types": "./dist/memberships.d.ts",
        "default": "./dist/memberships.js"
      },
      "require": {
        "types": "./dist/memberships.d.cts",
        "default": "./dist/memberships.cjs"
      }
    },
    "./profile": {
      "import": {
        "types": "./dist/profile.d.ts",
        "default": "./dist/profile.js"
      },
      "require": {
        "types": "./dist/profile.d.cts",
        "default": "./dist/profile.cjs"
      }
    }
```

- [ ] **Step 5: Add the `profile` entry to `tsup.config.ts`**

In `packages/contracts/tsup.config.ts`, add `profile: 'src/profile.ts',` to the `entry` object after the `memberships` line:

```ts
  entry: {
    index: 'src/index.ts',
    users: 'src/users.ts',
    auth: 'src/auth.ts',
    casl: 'src/casl.ts',
    errors: 'src/errors.ts',
    routes: 'src/routes.ts',
    openapi: 'src/openapi.ts',
    organisations: 'src/organisations.ts',
    'audit-log': 'src/audit-log.ts',
    memberships: 'src/memberships.ts',
    profile: 'src/profile.ts',
  },
```

- [ ] **Step 6: Re-export the module from the package root**

In `packages/contracts/src/index.ts`, add `export * from './profile.js';` after the `memberships` line:

```ts
export * from './organisations.js';
export * from './audit-log.js';
export * from './memberships.js';
export * from './profile.js';
```

- [ ] **Step 7: Build the contracts package**

```
pnpm --filter contracts build
```

Expected: PASS — tsup writes `dist/profile.js`, `dist/profile.cjs`, `dist/profile.d.ts`, `dist/profile.d.cts`; build exits 0.

- [ ] **Step 8: Run the test — expect PASS**

```
pnpm --filter contracts test
```

Expected: PASS — `profile.test.ts` passes all 12 cases; the full contracts suite is green.

- [ ] **Step 9: Commit**

```
git add packages/contracts/src/profile.ts packages/contracts/src/__tests__/profile.test.ts packages/contracts/package.json packages/contracts/tsup.config.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): UserProfile + UpdateUserProfileInput schemas with @repo/contracts/profile subpath"
```

---

### Task 2: Contracts — routes + OpenAPI wiring

**Files:**
- Modify: `packages/contracts/src/routes.ts`
- Modify: `packages/contracts/src/openapi.ts`

- [ ] **Step 1: Add the profile routes to `UsersRoutes`**

In `packages/contracts/src/routes.ts`, add two entries to the `UsersRoutes` object, after `sendPasswordReset`:

```ts
export const UsersRoutes = {
  base: '/api/users',
  me: '/api/users/me',
  byId: (id: string) => `/api/users/${id}` as const,
  invite: '/api/users/invite',
  add: '/api/users/add',
  deactivate: (id: string) => `/api/users/${id}/deactivate` as const,
  reactivate: (id: string) => `/api/users/${id}/reactivate` as const,
  sendPasswordReset: (id: string) => `/api/users/${id}/send-password-reset` as const,
  meProfile: '/api/users/me/profile',
  profileById: (id: string) => `/api/users/${id}/profile` as const,
} as const;
```

- [ ] **Step 2: Wire `ProfileOpenApiRegistry` into `registerContractSchemas`**

In `packages/contracts/src/openapi.ts`, add the import after the `OrganisationsOpenApiRegistry` import:

```ts
import { AuditLogOpenApiRegistry } from './audit-log.js';
import { AuthOpenApiRegistry } from './auth.js';
import { ErrorEnvelopeOpenApiRegistry } from './errors.js';
import { OrganisationsOpenApiRegistry } from './organisations.js';
import { ProfileOpenApiRegistry } from './profile.js';
import { UsersOpenApiRegistry } from './users.js';
```

Add `ProfileOpenApiRegistry` to the default `registries` array in `registerContractSchemas`:

```ts
export function registerContractSchemas(
  document: OpenAPIObject,
  registries: ZodSchemaRegistry[] = [
    ErrorEnvelopeOpenApiRegistry,
    AuthOpenApiRegistry,
    UsersOpenApiRegistry,
    OrganisationsOpenApiRegistry,
    AuditLogOpenApiRegistry,
    ProfileOpenApiRegistry,
  ],
): OpenAPIObject {
```

Add `profile` to the `ContractRegistries` map at the bottom of the file:

```ts
export const ContractRegistries = {
  errors: ErrorEnvelopeOpenApiRegistry,
  auth: AuthOpenApiRegistry,
  users: UsersOpenApiRegistry,
  organisations: OrganisationsOpenApiRegistry,
  auditLog: AuditLogOpenApiRegistry,
  profile: ProfileOpenApiRegistry,
} as const;
```

- [ ] **Step 3: Build the contracts package**

```
pnpm --filter contracts build
```

Expected: PASS — build exits 0; `dist/routes.js` and `dist/openapi.js` are rewritten.

- [ ] **Step 4: Typecheck the contracts package**

```
pnpm --filter contracts typecheck
```

Expected: PASS — `tsc --noEmit` exits 0 with no errors.

- [ ] **Step 5: Commit**

```
git add packages/contracts/src/routes.ts packages/contracts/src/openapi.ts
git commit -m "feat(contracts): profile route constants + ProfileOpenApiRegistry wiring"
```

---

### Task 3: DB — `user_profile` table + migration

**Files:**
- Create: `apps/backend/src/infrastructure/database/schema/user-profile.ts`
- Modify: `apps/backend/src/infrastructure/database/schema/index.ts`
- Create: `apps/backend/drizzle/0010_*.sql` (generated)
- Modify: `apps/backend/drizzle/meta/_journal.json` (generated)
- Create: `apps/backend/drizzle/meta/0010_snapshot.json` (generated)

- [ ] **Step 1: Create the `user_profile` schema file**

Create `apps/backend/src/infrastructure/database/schema/user-profile.ts`:

```ts
import { date, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './users.js';

/**
 * A 1:1 extension of the better-auth `user` table. `user_id` is both the
 * primary key (enforcing the 1:1 relationship) and an FK to `user(id)` with
 * `on delete cascade` — deleting a user removes their profile.
 *
 * `date_of_birth` / `taido_start_date` are SQL `date` columns (calendar
 * dates, no time component). `citizenships` is a Postgres `text[]` column,
 * NOT NULL with an empty-array default — every user has a (possibly empty)
 * list, never null.
 */
export const userProfile = pgTable('user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  dateOfBirth: date('date_of_birth', { mode: 'string' }),
  taidoStartDate: date('taido_start_date', { mode: 'string' }),
  addressStreet: text('address_street'),
  addressPostalCode: text('address_postal_code'),
  addressCity: text('address_city'),
  addressCountry: text('address_country'),
  citizenships: text('citizenships').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export type DbUserProfile = typeof userProfile.$inferSelect;
export type DbNewUserProfile = typeof userProfile.$inferInsert;
```

- [ ] **Step 2: Re-export the table from the schema barrel**

In `apps/backend/src/infrastructure/database/schema/index.ts`, add the re-export after the `memberships` line:

```ts
export * from './users.js';
export * from './organisations.js';
export * from './audit-log.js';
export * from './memberships.js';
export * from './user-profile.js';
```

- [ ] **Step 3: Generate the migration**

```
pnpm --filter backend db:generate
```

Expected: PASS — drizzle-kit prints `[✓] Your SQL migration file ➜ drizzle/0010_<adjective_noun>.sql 🚀`, creates `drizzle/0010_<adjective_noun>.sql` with a `CREATE TABLE "user_profile" (...)` statement plus its FK to `"user"`, writes `drizzle/meta/0010_snapshot.json`, and appends an entry to `drizzle/meta/_journal.json`.

- [ ] **Step 4: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0; the new `userProfile` table and `DbUserProfile` / `DbNewUserProfile` types compile.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/infrastructure/database/schema/user-profile.ts apps/backend/src/infrastructure/database/schema/index.ts apps/backend/drizzle/0010_*.sql apps/backend/drizzle/meta/0010_snapshot.json apps/backend/drizzle/meta/_journal.json
git commit -m "feat(db): user_profile table + migration 0010 (date columns + citizenships text[])"
```

---

### Task 4: Backend — `ProfileRepository`

**Files:**
- Create: `apps/backend/src/modules/profile/profile.repository.ts`

- [ ] **Step 1: Create the repository**

Create `apps/backend/src/modules/profile/profile.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  user,
  userProfile,
  type DbUserProfile,
} from '../../infrastructure/database/schema/index.js';

/**
 * The set of `user_profile` columns the service may write. `userId` is fixed
 * by the caller and `created_at` / `updated_at` are managed here, so they are
 * deliberately excluded.
 */
export type ProfilePatch = Partial<
  Pick<
    DbUserProfile,
    | 'firstName'
    | 'lastName'
    | 'dateOfBirth'
    | 'taidoStartDate'
    | 'addressStreet'
    | 'addressPostalCode'
    | 'addressCity'
    | 'addressCountry'
    | 'citizenships'
  >
>;

/**
 * Repository — the only file in the profile module allowed to touch Drizzle.
 */
@Injectable()
export class ProfileRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByUserId(userId: string, tx?: DrizzleExecutor): Promise<DbUserProfile | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Insert the `user_profile` row or update the columns named in `patch`.
   * `userId` is the conflict target (it is the primary key).
   */
  async upsert(
    userId: string,
    patch: ProfilePatch,
    tx?: DrizzleExecutor,
  ): Promise<DbUserProfile> {
    const conn = tx ?? this.db;
    const rows = await conn
      .insert(userProfile)
      .values({ userId, ...patch })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: { ...patch, updatedAt: new Date() },
      })
      .returning();
    if (!rows[0]) throw new Error('Upsert returned no rows.');
    return rows[0];
  }

  /** Sync the denormalized `user.name` display field. */
  async syncUserName(userId: string, name: string, tx?: DrizzleExecutor): Promise<void> {
    const conn = tx ?? this.db;
    await conn
      .update(user)
      .set({ name, updatedAt: new Date() })
      .where(eq(user.id, userId));
  }
}
```

- [ ] **Step 2: Build the contracts package (consumed by the backend typecheck)**

```
pnpm --filter contracts build
```

Expected: PASS — build exits 0 (already current from Task 2; re-run guarantees `@repo/contracts/profile` types are on disk).

- [ ] **Step 3: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0; `ProfileRepository`, `ProfilePatch`, and the Drizzle calls compile.

- [ ] **Step 4: Commit**

```
git add apps/backend/src/modules/profile/profile.repository.ts
git commit -m "feat(backend): ProfileRepository — findByUserId, upsert, syncUserName"
```

---

### Task 5: Backend — `ProfileService` + specs

**Files:**
- Create: `apps/backend/src/modules/profile/profile.service.ts`
- Create: `apps/backend/src/modules/profile/profile.service.spec.ts`

- [ ] **Step 1: Write the failing service spec**

Create `apps/backend/src/modules/profile/profile.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DRIZZLE } from '../../infrastructure/database/client.js';
import { UsersRepository } from '../users/users.repository.js';

import { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';

const caller = {
  id: 'u-1',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
  image: null,
  role: 'user' as const,
  locale: 'en',
  deactivatedAt: null,
  memberships: [],
};

const sysadmin = { ...caller, id: 'u-sys', email: 'sys@example.com', role: 'sysadmin' as const };

const PROFILE_ROW = {
  userId: 'u-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-12-10',
  taidoStartDate: '2015-09-01',
  addressStreet: '12 Analytical Way',
  addressPostalCode: '11122',
  addressCity: 'Stockholm',
  addressCountry: 'SWE',
  citizenships: ['SWE', 'GBR'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DB_USER = {
  id: 'u-1',
  email: 'ada@example.com',
  emailVerified: true,
  name: 'Ada Lovelace',
  image: null,
  role: 'user',
  locale: 'en',
  deactivatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function profileRepoStub() {
  return {
    findByUserId: vi.fn(),
    upsert: vi.fn(),
    syncUserName: vi.fn().mockResolvedValue(undefined),
  } satisfies Record<keyof ProfileRepository, ReturnType<typeof vi.fn>>;
}

function usersRepoStub() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    list: vi.fn(),
  };
}

const FAKE_TX = { __tx: true } as any;
const fakeDb = {
  transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(FAKE_TX)),
};

async function makeService(
  repo: ReturnType<typeof profileRepoStub>,
  usersRepo: ReturnType<typeof usersRepoStub>,
) {
  const module = await Test.createTestingModule({
    providers: [
      ProfileService,
      { provide: ProfileRepository, useValue: repo },
      { provide: UsersRepository, useValue: usersRepo },
      { provide: DRIZZLE, useValue: fakeDb },
    ],
  }).compile();
  return module.get(ProfileService);
}

describe('ProfileService — getOwn', () => {
  let repo: ReturnType<typeof profileRepoStub>;
  let usersRepo: ReturnType<typeof usersRepoStub>;
  let service: ProfileService;

  beforeEach(async () => {
    repo = profileRepoStub();
    usersRepo = usersRepoStub();
    service = await makeService(repo, usersRepo);
  });

  it('returns the empty-profile shape when no row exists', async () => {
    repo.findByUserId.mockResolvedValue(null);
    const out = await service.getOwn(caller);
    expect(out).toEqual({
      userId: 'u-1',
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      taidoStartDate: null,
      addressStreet: null,
      addressPostalCode: null,
      addressCity: null,
      addressCountry: null,
      citizenships: [],
    });
  });

  it('returns the persisted row when one exists', async () => {
    repo.findByUserId.mockResolvedValue(PROFILE_ROW);
    const out = await service.getOwn(caller);
    expect(out).toMatchObject({ userId: 'u-1', firstName: 'Ada', citizenships: ['SWE', 'GBR'] });
    expect(out).not.toHaveProperty('createdAt');
  });
});

describe('ProfileService — getByUserId', () => {
  let repo: ReturnType<typeof profileRepoStub>;
  let usersRepo: ReturnType<typeof usersRepoStub>;
  let service: ProfileService;

  beforeEach(async () => {
    repo = profileRepoStub();
    usersRepo = usersRepoStub();
    service = await makeService(repo, usersRepo);
  });

  it('404s when the target user does not exist', async () => {
    usersRepo.findById.mockResolvedValue(null);
    await expect(service.getByUserId('nope', sysadmin)).rejects.toThrow(NotFoundException);
  });

  it('returns the empty-profile shape when the user exists but has no profile', async () => {
    usersRepo.findById.mockResolvedValue(DB_USER);
    repo.findByUserId.mockResolvedValue(null);
    const out = await service.getByUserId('u-1', sysadmin);
    expect(out).toMatchObject({ userId: 'u-1', firstName: null, citizenships: [] });
  });

  it('returns the persisted profile when the user has one', async () => {
    usersRepo.findById.mockResolvedValue(DB_USER);
    repo.findByUserId.mockResolvedValue(PROFILE_ROW);
    const out = await service.getByUserId('u-1', sysadmin);
    expect(out).toMatchObject({ userId: 'u-1', firstName: 'Ada' });
  });
});

describe('ProfileService — updateOwn', () => {
  let repo: ReturnType<typeof profileRepoStub>;
  let usersRepo: ReturnType<typeof usersRepoStub>;
  let service: ProfileService;

  beforeEach(async () => {
    repo = profileRepoStub();
    usersRepo = usersRepoStub();
    service = await makeService(repo, usersRepo);
  });

  it('upserts the profile and syncs user.name when first/last are in the patch', async () => {
    repo.findByUserId.mockResolvedValue(null);
    repo.upsert.mockResolvedValue({ ...PROFILE_ROW, firstName: 'Ada', lastName: 'Lovelace' });

    const out = await service.updateOwn(caller, { firstName: 'Ada', lastName: 'Lovelace' });

    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.upsert.mock.calls[0]?.[0]).toBe('u-1');
    expect(repo.upsert.mock.calls[0]?.[1]).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(repo.syncUserName).toHaveBeenCalledWith('u-1', 'Ada Lovelace', FAKE_TX);
    expect(out).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('combines a patched first name with the existing last name when syncing', async () => {
    repo.findByUserId.mockResolvedValue({ ...PROFILE_ROW, firstName: 'Old', lastName: 'Lovelace' });
    repo.upsert.mockResolvedValue({ ...PROFILE_ROW, firstName: 'Ada', lastName: 'Lovelace' });

    await service.updateOwn(caller, { firstName: 'Ada' });

    expect(repo.syncUserName).toHaveBeenCalledWith('u-1', 'Ada Lovelace', FAKE_TX);
  });

  it('does not sync user.name when the patch does not touch first/last', async () => {
    repo.findByUserId.mockResolvedValue(PROFILE_ROW);
    repo.upsert.mockResolvedValue({ ...PROFILE_ROW, addressCity: 'Gothenburg' });

    await service.updateOwn(caller, { addressCity: 'Gothenburg' });

    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.syncUserName).not.toHaveBeenCalled();
  });

  it('does not sync user.name when both first and last are empty', async () => {
    repo.findByUserId.mockResolvedValue({ ...PROFILE_ROW, firstName: null, lastName: null });
    repo.upsert.mockResolvedValue({ ...PROFILE_ROW, firstName: null, lastName: null });

    await service.updateOwn(caller, { firstName: null, lastName: null });

    expect(repo.syncUserName).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the spec — expect FAIL**

```
pnpm --filter backend test
```

Expected: FAIL — `profile.service.spec.ts` fails to import `./profile.service.js` (`Cannot find module './profile.service.js'`); the suite errors out.

- [ ] **Step 3: Create the service**

Create `apps/backend/src/modules/profile/profile.service.ts`:

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateUserProfileInput, UserProfile } from '@repo/contracts/profile';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { type DbUserProfile } from '../../infrastructure/database/schema/index.js';
import { UsersRepository } from '../users/users.repository.js';

import { ProfilePatch, ProfileRepository } from './profile.repository.js';

@Injectable()
export class ProfileService {
  constructor(
    private readonly repo: ProfileRepository,
    private readonly usersRepo: UsersRepository,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  /** Return the caller's own profile — the empty shape if no row exists yet. */
  async getOwn(user: AuthenticatedUser): Promise<UserProfile> {
    const row = await this.repo.findByUserId(user.id);
    return row ? this.toApi(row) : this.emptyProfile(user.id);
  }

  /**
   * Sysadmin read of any user's profile. The controller's
   * `@CheckAbility('manage', 'User')` gate covers HTTP authorization; this
   * method just performs the lookup. 404s an unknown user; returns the empty
   * shape when the user exists but has no profile row.
   */
  async getByUserId(userId: string, _caller: AuthenticatedUser): Promise<UserProfile> {
    const target = await this.usersRepo.findById(userId);
    if (!target) {
      throw new NotFoundException({
        error: { code: 'NOT_FOUND', message: `User ${userId} not found.` },
      });
    }
    const row = await this.repo.findByUserId(userId);
    return row ? this.toApi(row) : this.emptyProfile(userId);
  }

  /**
   * Upsert the caller's profile from a partial patch. If the patch changes
   * `firstName` / `lastName`, the same transaction syncs `user.name` to the
   * joined "First Last" value (left unchanged when both are empty).
   */
  async updateOwn(user: AuthenticatedUser, input: UpdateUserProfileInput): Promise<UserProfile> {
    return this.db.transaction(async (tx) => {
      const existing = await this.repo.findByUserId(user.id, tx);
      const patch = this.buildPatch(input);
      const row = await this.repo.upsert(user.id, patch, tx);

      if ('firstName' in input || 'lastName' in input) {
        const effFirst =
          'firstName' in input ? input.firstName ?? null : existing?.firstName ?? null;
        const effLast =
          'lastName' in input ? input.lastName ?? null : existing?.lastName ?? null;
        const name = [effFirst, effLast]
          .filter((s): s is string => Boolean(s))
          .join(' ')
          .trim();
        if (name) {
          await this.repo.syncUserName(user.id, name, tx);
        }
      }

      return this.toApi(row);
    });
  }

  /**
   * Translate the contract patch into a column patch, copying only the keys
   * that are actually present in `input` so `exactOptionalPropertyTypes` is
   * honoured (an absent key is never written as `undefined`).
   */
  private buildPatch(input: UpdateUserProfileInput): ProfilePatch {
    const patch: ProfilePatch = {};
    if ('firstName' in input) patch.firstName = input.firstName ?? null;
    if ('lastName' in input) patch.lastName = input.lastName ?? null;
    if ('dateOfBirth' in input) patch.dateOfBirth = input.dateOfBirth ?? null;
    if ('taidoStartDate' in input) patch.taidoStartDate = input.taidoStartDate ?? null;
    if ('addressStreet' in input) patch.addressStreet = input.addressStreet ?? null;
    if ('addressPostalCode' in input) patch.addressPostalCode = input.addressPostalCode ?? null;
    if ('addressCity' in input) patch.addressCity = input.addressCity ?? null;
    if ('addressCountry' in input) patch.addressCountry = input.addressCountry ?? null;
    if ('citizenships' in input && input.citizenships) patch.citizenships = input.citizenships;
    return patch;
  }

  private emptyProfile(userId: string): UserProfile {
    return {
      userId,
      firstName: null,
      lastName: null,
      dateOfBirth: null,
      taidoStartDate: null,
      addressStreet: null,
      addressPostalCode: null,
      addressCity: null,
      addressCountry: null,
      citizenships: [],
    };
  }

  private toApi(row: DbUserProfile): UserProfile {
    return {
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      dateOfBirth: row.dateOfBirth,
      taidoStartDate: row.taidoStartDate,
      addressStreet: row.addressStreet,
      addressPostalCode: row.addressPostalCode,
      addressCity: row.addressCity,
      addressCountry: row.addressCountry,
      citizenships: row.citizenships,
    };
  }
}
```

- [ ] **Step 4: Run the spec — expect PASS**

```
pnpm --filter backend test
```

Expected: PASS — `profile.service.spec.ts` passes all 9 cases (`getOwn` ×2, `getByUserId` ×3, `updateOwn` ×4); the rest of the backend suite stays green.

- [ ] **Step 5: Commit**

```
git add apps/backend/src/modules/profile/profile.service.ts apps/backend/src/modules/profile/profile.service.spec.ts
git commit -m "feat(backend): ProfileService — getOwn, getByUserId, updateOwn with user.name sync"
```

---

### Task 6: Backend — controller + DTOs + module + registration

**Files:**
- Create: `apps/backend/src/modules/profile/dto/user-profile.dto.ts`
- Create: `apps/backend/src/modules/profile/dto/update-user-profile.dto.ts`
- Create: `apps/backend/src/modules/profile/profile.controller.ts`
- Create: `apps/backend/src/modules/profile/profile.controller.spec.ts`
- Create: `apps/backend/src/modules/profile/profile.module.ts`
- Modify: `apps/backend/src/modules/users/users.module.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Create the response DTO**

Create `apps/backend/src/modules/profile/dto/user-profile.dto.ts`:

```ts
import { UserProfileSchema } from '@repo/contracts/profile';
import { createZodDto } from 'nestjs-zod';

export class UserProfileDto extends createZodDto(UserProfileSchema) {}
```

- [ ] **Step 2: Create the request DTO**

Create `apps/backend/src/modules/profile/dto/update-user-profile.dto.ts`:

```ts
import { UpdateUserProfileSchema } from '@repo/contracts/profile';
import { createZodDto } from 'nestjs-zod';

export class UpdateUserProfileDto extends createZodDto(UpdateUserProfileSchema) {}
```

- [ ] **Step 3: Create the controller**

Create `apps/backend/src/modules/profile/profile.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import type { UserProfile } from '@repo/contracts/profile';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { UpdateUserProfileDto } from './dto/update-user-profile.dto.js';
import { UserProfileDto } from './dto/user-profile.dto.js';
import { ProfileService } from './profile.service.js';

/**
 * Profile endpoints. Shares the `/users` prefix with `UsersController` —
 * NestJS serves multiple controllers under one prefix as long as the full
 * route paths are distinct (`/users/me/profile`, `/users/:id/profile` do not
 * collide with `/users/me`, `/users/:id`).
 */
@ApiTags('profile')
@ApiCookieAuth('session')
@Controller('users')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('me/profile')
  @ApiEndpoint({
    summary: "Get the current user's own profile.",
    operationId: 'ProfileController_getOwn',
    ok: UserProfileDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401'],
  })
  getOwn(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return this.profile.getOwn(user);
  }

  @Patch('me/profile')
  @ApiEndpoint({
    summary: "Update the current user's own profile.",
    operationId: 'ProfileController_updateOwn',
    ok: UserProfileDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401'],
  })
  updateOwn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateUserProfileDto,
  ): Promise<UserProfile> {
    return this.profile.updateOwn(user, body);
  }

  @Get(':id/profile')
  @CheckAbility('manage', 'User')
  @ApiParam({ name: 'id', description: 'User id.' })
  @ApiEndpoint({
    summary: "Get any user's profile (sysadmin only).",
    operationId: 'ProfileController_getByUserId',
    ok: UserProfileDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  getByUserId(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserProfile> {
    return this.profile.getByUserId(id, user);
  }
}
```

- [ ] **Step 4: Create the module**

Create `apps/backend/src/modules/profile/profile.module.ts`:

```ts
import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module.js';

import { ProfileController } from './profile.controller.js';
import { ProfileRepository } from './profile.repository.js';
import { ProfileService } from './profile.service.js';

@Module({
  imports: [UsersModule], // for UsersRepository (user-existence check)
  controllers: [ProfileController],
  providers: [ProfileService, ProfileRepository],
  exports: [ProfileService],
})
export class ProfileModule {}
```

- [ ] **Step 5: Export `UsersRepository` from `UsersModule`**

`ProfileService` injects `UsersRepository` for the user-existence check in `getByUserId`, so the providing module must export it — the same pattern `MembershipsModule` relies on for `OrganisationsRepository`. `UsersModule` currently exports only `UsersService`.

In `apps/backend/src/modules/users/users.module.ts`, add `UsersRepository` to the `exports` array:

```ts
@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
```

- [ ] **Step 6: Register `ProfileModule` in `AppModule`**

In `apps/backend/src/app.module.ts`, add the import after the `UsersModule` import:

```ts
import { OrganisationsModule } from './modules/organisations/organisations.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { UsersModule } from './modules/users/users.module.js';
```

Add `ProfileModule` to the `imports` array, after `UsersModule`:

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
    AuditLogModule,
  ],
```

- [ ] **Step 7: Create the controller authorization spec**

Spec §7 requires a backend-authorization test proving `GET /users/:id/profile` is sysadmin-only. The codebase has no e2e harness, so verify it at the metadata level: the `getByUserId` handler must carry the `@CheckAbility('manage', 'User')` metadata the shared `AbilityGuard` enforces, and the self-scoped `me/profile` handlers must not.

Create `apps/backend/src/modules/profile/profile.controller.spec.ts`:

```ts
import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import { CHECK_ABILITY_KEY } from '../../infrastructure/ability/check-ability.decorator.js';

import { ProfileController } from './profile.controller.js';

describe('ProfileController — authorization metadata', () => {
  it('gates GET /users/:id/profile with the sysadmin manage-User ability', () => {
    const meta = Reflect.getMetadata(
      CHECK_ABILITY_KEY,
      ProfileController.prototype.getByUserId,
    );
    expect(meta).toEqual([{ action: 'manage', subject: 'User' }]);
  });

  it('leaves the self-scoped me/profile handlers ungated', () => {
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, ProfileController.prototype.getOwn),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(CHECK_ABILITY_KEY, ProfileController.prototype.updateOwn),
    ).toBeUndefined();
  });
});
```

`CHECK_ABILITY_KEY` is the metadata key the `CheckAbility` decorator writes (via `SetMetadata`) and the `AbilityGuard` reads. Asserting it is present on `getByUserId` — and absent on `getOwn` / `updateOwn` — proves the sysadmin gate is wired without needing a running HTTP server.

- [ ] **Step 8: Typecheck the backend**

```
pnpm --filter backend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0; the controller, DTOs, module, and `AppModule` wiring compile.

- [ ] **Step 9: Run the backend test suite**

```
pnpm --filter backend test
```

Expected: PASS — all backend specs stay green, including `profile.service.spec.ts` and the new `profile.controller.spec.ts` (2 cases); the new wiring does not break existing module-resolution tests.

- [ ] **Step 10: Commit**

```
git add apps/backend/src/modules/profile/dto/user-profile.dto.ts apps/backend/src/modules/profile/dto/update-user-profile.dto.ts apps/backend/src/modules/profile/profile.controller.ts apps/backend/src/modules/profile/profile.controller.spec.ts apps/backend/src/modules/profile/profile.module.ts apps/backend/src/modules/users/users.module.ts apps/backend/src/app.module.ts
git commit -m "feat(backend): ProfileController + DTOs + ProfileModule + sysadmin-gate spec"
```

---

### Task 7: Backend — regenerate OpenAPI

**Files:**
- Modify: `packages/contracts/openapi/openapi.json` (generated)
- Modify: `packages/contracts/openapi/openapi.yaml` (generated)

- [ ] **Step 1: Regenerate the OpenAPI document**

```
pnpm openapi:generate
```

Expected: PASS — turbo runs the backend's `openapi:generate` task; it boots the Nest app, serialises the Swagger document, and rewrites `packages/contracts/openapi/openapi.json` + `openapi.yaml`. The diff adds three paths (`/api/users/me/profile` GET + PATCH, `/api/users/{id}/profile` GET) and two component schemas (`UserProfile`, `UpdateUserProfileInput`).

- [ ] **Step 2: Inspect the diff**

```
git status --short packages/contracts/openapi/
```

Expected: `openapi.json` and `openapi.yaml` show as modified. If — and only if — `git status` reports no changes (no drift), state "OpenAPI already up to date — no drift" and skip Step 3.

- [ ] **Step 3: Commit**

```
git add packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "chore(contracts): regenerate OpenAPI with profile endpoints + schemas"
```

---

### Task 8: Frontend — `entities/profile`

**Files:**
- Create: `apps/frontend/src/entities/profile/api/profile.api.ts`
- Create: `apps/frontend/src/entities/profile/api/profile.api.test.ts`
- Create: `apps/frontend/src/entities/profile/model/profile.queries.ts`
- Create: `apps/frontend/src/entities/profile/index.ts`

- [ ] **Step 1: Write the failing API test**

Create `apps/frontend/src/entities/profile/api/profile.api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/api', async (orig) => {
  const actual = await orig<typeof import('@/shared/api')>();
  return { ...actual, httpClient: vi.fn() };
});

import { getMyProfile, getUserProfile, updateMyProfile } from './profile.api.js';

import { httpClient } from '@/shared/api';

const PROFILE_RESPONSE = {
  userId: 'u-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  dateOfBirth: '1990-12-10',
  taidoStartDate: '2015-09-01',
  addressStreet: '12 Analytical Way',
  addressPostalCode: '11122',
  addressCity: 'Stockholm',
  addressCountry: 'SWE',
  citizenships: ['SWE', 'GBR'],
};

const mockedHttp = vi.mocked(httpClient);

describe('profile api', () => {
  it('getMyProfile GETs /api/users/me/profile', async () => {
    mockedHttp.mockResolvedValueOnce(PROFILE_RESPONSE);
    const out = await getMyProfile();
    expect(mockedHttp).toHaveBeenCalledWith('/api/users/me/profile');
    expect(out.firstName).toBe('Ada');
  });

  it('updateMyProfile PATCHes /api/users/me/profile with the patch body', async () => {
    mockedHttp.mockResolvedValueOnce(PROFILE_RESPONSE);
    await updateMyProfile({ firstName: 'Ada' });
    expect(mockedHttp).toHaveBeenCalledWith('/api/users/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Ada' },
    });
  });

  it('getUserProfile GETs /api/users/:id/profile', async () => {
    mockedHttp.mockResolvedValueOnce(PROFILE_RESPONSE);
    await getUserProfile('u-1');
    expect(mockedHttp).toHaveBeenCalledWith('/api/users/u-1/profile');
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend test -- --run
```

Expected: FAIL — `profile.api.test.ts` cannot resolve `./profile.api.js`; the suite errors.

- [ ] **Step 3: Create the API module**

Create `apps/frontend/src/entities/profile/api/profile.api.ts`:

```ts
import {
  UserProfileSchema,
  type UpdateUserProfileInput,
  type UserProfile,
} from '@repo/contracts/profile';
import { UsersRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the UserProfile entity. */

export async function getMyProfile(): Promise<UserProfile> {
  const raw = await httpClient(UsersRoutes.meProfile);
  return UserProfileSchema.parse(raw);
}

export async function updateMyProfile(input: UpdateUserProfileInput): Promise<UserProfile> {
  const raw = await httpClient(UsersRoutes.meProfile, { method: 'PATCH', body: input });
  return UserProfileSchema.parse(raw);
}

export async function getUserProfile(id: string): Promise<UserProfile> {
  const raw = await httpClient(UsersRoutes.profileById(id));
  return UserProfileSchema.parse(raw);
}
```

- [ ] **Step 4: Create the queries module**

Create `apps/frontend/src/entities/profile/model/profile.queries.ts`:

```ts
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import { getMyProfile, getUserProfile, updateMyProfile } from '../api/profile.api.js';

import type { UpdateUserProfileInput, UserProfile } from '@repo/contracts/profile';

export const profileKeys = {
  all: ['profile'] as const,
  me: () => [...profileKeys.all, 'me'] as const,
  byUser: (id: string) => [...profileKeys.all, 'user', id] as const,
};

export function myProfileQueryOptions() {
  return queryOptions({
    queryKey: profileKeys.me(),
    queryFn: () => getMyProfile(),
  });
}

export function userProfileQueryOptions(id: string) {
  return queryOptions({
    queryKey: profileKeys.byUser(id),
    queryFn: () => getUserProfile(id),
  });
}

/**
 * onSuccess composition: spread `options` FIRST, then define the invalidating
 * `onSuccess` AFTER, so a caller-supplied `onSuccess` cannot overwrite the
 * invalidation. Invalidates the whole profile cache; also invalidates the
 * `users` cache so a synced `name` change is reflected in the admin list.
 */
export function useUpdateMyProfile(
  options?: Omit<UseMutationOptions<UserProfile, Error, UpdateUserProfileInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateMyProfile,
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: profileKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      options?.onSuccess?.(...args);
    },
  });
}
```

- [ ] **Step 5: Create the barrel**

Create `apps/frontend/src/entities/profile/index.ts`:

```ts
export type { UpdateUserProfileInput, UserProfile } from '@repo/contracts/profile';

export { getMyProfile, getUserProfile, updateMyProfile } from './api/profile.api.js';

export {
  myProfileQueryOptions,
  profileKeys,
  userProfileQueryOptions,
  useUpdateMyProfile,
} from './model/profile.queries.js';
```

- [ ] **Step 6: Run the test — expect PASS**

```
pnpm --filter frontend test -- --run
```

Expected: PASS — `profile.api.test.ts` passes all 3 cases; the rest of the frontend suite stays green.

- [ ] **Step 7: Commit**

```
git add apps/frontend/src/entities/profile/api/profile.api.ts apps/frontend/src/entities/profile/api/profile.api.test.ts apps/frontend/src/entities/profile/model/profile.queries.ts apps/frontend/src/entities/profile/index.ts
git commit -m "feat(frontend): entities/profile — api, query options, useUpdateMyProfile"
```

---

### Task 9: Frontend — i18n keys

**Files:**
- Modify: `apps/frontend/src/i18n/locales/en.json`
- Modify: `apps/frontend/src/i18n/locales/sv.json`
- Modify: `apps/frontend/src/i18n/locales/fi.json`

- [ ] **Step 1: Add the `nav.profile` key + `profile` subtree to `en.json`**

In `apps/frontend/src/i18n/locales/en.json`, add `"profile"` to the existing `nav` object:

```json
  "nav": {
    "dashboard": "Dashboard",
    "adminOrganisations": "Organisations",
    "adminAuditLog": "Audit log",
    "adminUsers": "Users",
    "profile": "My profile"
  },
```

Then add a top-level `"profile"` object (place it immediately after the `"dashboard"` object):

```json
  "profile": {
    "title": "My profile",
    "description": "Your personal and taido-training details.",
    "fields": {
      "firstName": "First name",
      "lastName": "Last name",
      "dateOfBirth": "Date of birth",
      "taidoStartDate": "Taido training start date",
      "addressStreet": "Street address",
      "addressPostalCode": "Postal code",
      "addressCity": "City",
      "addressCountry": "Country",
      "citizenships": "Citizenships"
    },
    "addCitizenship": "Add citizenship",
    "removeCitizenship": "Remove",
    "countryNone": "None",
    "save": "Save profile",
    "saved": "Profile saved.",
    "empty": "This user has not filled in their profile yet."
  },
```

- [ ] **Step 2: Add the same keys to `sv.json` (Swedish)**

In `apps/frontend/src/i18n/locales/sv.json`, add `"profile"` to the `nav` object:

```json
    "profile": "Min profil"
```

(append it as the last key of `nav`, with a comma after the preceding entry)

Then add the top-level `"profile"` object (after the `"dashboard"` object):

```json
  "profile": {
    "title": "Min profil",
    "description": "Dina personliga uppgifter och uppgifter om taidoträning.",
    "fields": {
      "firstName": "Förnamn",
      "lastName": "Efternamn",
      "dateOfBirth": "Födelsedatum",
      "taidoStartDate": "Startdatum för taidoträning",
      "addressStreet": "Gatuadress",
      "addressPostalCode": "Postnummer",
      "addressCity": "Ort",
      "addressCountry": "Land",
      "citizenships": "Medborgarskap"
    },
    "addCitizenship": "Lägg till medborgarskap",
    "removeCitizenship": "Ta bort",
    "countryNone": "Inget",
    "save": "Spara profil",
    "saved": "Profilen sparad.",
    "empty": "Den här användaren har inte fyllt i sin profil ännu."
  },
```

- [ ] **Step 3: Add the same keys to `fi.json` (Finnish)**

In `apps/frontend/src/i18n/locales/fi.json`, add `"profile"` to the `nav` object:

```json
    "profile": "Oma profiili"
```

(append it as the last key of `nav`, with a comma after the preceding entry)

Then add the top-level `"profile"` object (after the `"dashboard"` object):

```json
  "profile": {
    "title": "Oma profiili",
    "description": "Henkilökohtaiset tietosi ja taidoharjoittelun tiedot.",
    "fields": {
      "firstName": "Etunimi",
      "lastName": "Sukunimi",
      "dateOfBirth": "Syntymäaika",
      "taidoStartDate": "Taidoharjoittelun aloituspäivä",
      "addressStreet": "Katuosoite",
      "addressPostalCode": "Postinumero",
      "addressCity": "Kaupunki",
      "addressCountry": "Maa",
      "citizenships": "Kansalaisuudet"
    },
    "addCitizenship": "Lisää kansalaisuus",
    "removeCitizenship": "Poista",
    "countryNone": "Ei mitään",
    "save": "Tallenna profiili",
    "saved": "Profiili tallennettu.",
    "empty": "Tämä käyttäjä ei ole vielä täyttänyt profiiliaan."
  },
```

- [ ] **Step 4: Typecheck the frontend**

```
pnpm --filter frontend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0; the JSON locale files remain valid (i18next types are key-agnostic, so this only confirms no JSON syntax error broke the import).

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/i18n/locales/en.json apps/frontend/src/i18n/locales/sv.json apps/frontend/src/i18n/locales/fi.json
git commit -m "feat(frontend): i18n keys for the profile page, form fields, and nav entry"
```

---

### Task 10: Frontend — `features/profile-form`

**Files:**
- Create: `apps/frontend/src/features/profile-form/ui/ProfileForm.tsx`
- Create: `apps/frontend/src/features/profile-form/ui/ProfileForm.test.tsx`
- Create: `apps/frontend/src/features/profile-form/index.ts`
- Modify: `apps/frontend/steiger.config.js`

- [ ] **Step 1: Write the failing component test**

Create `apps/frontend/src/features/profile-form/ui/ProfileForm.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileForm } from './ProfileForm.js';

import type { UserProfile } from '@/entities/profile';

import i18n from '@/i18n';

// Mock the deep entity-api module so the mutation hook picks up the stub.
vi.mock('@/entities/profile/api/profile.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/profile/api/profile.api.js')>();
  return {
    ...actual,
    updateMyProfile: vi.fn().mockImplementation((input) =>
      Promise.resolve({ ...EMPTY_PROFILE, ...input }),
    ),
  };
});

import { updateMyProfile } from '@/entities/profile/api/profile.api.js';

const EMPTY_PROFILE: UserProfile = {
  userId: 'u-1',
  firstName: null,
  lastName: null,
  dateOfBirth: null,
  taidoStartDate: null,
  addressStreet: null,
  addressPostalCode: null,
  addressCity: null,
  addressCountry: null,
  citizenships: [],
};

const SEEDED: UserProfile = {
  ...EMPTY_PROFILE,
  firstName: 'Ada',
  lastName: 'Lovelace',
  addressCity: 'Stockholm',
  citizenships: ['SWE'],
};

const mockedUpdate = vi.mocked(updateMyProfile);

function renderForm(profile: UserProfile) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <ProfileForm profile={profile} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

describe('<ProfileForm>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockedUpdate.mockClear();
  });

  it('renders the fields seeded from the profile', () => {
    renderForm(SEEDED);
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ada');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Lovelace');
    expect(screen.getByLabelText(/city/i)).toHaveValue('Stockholm');
  });

  it('submits an edited field value', async () => {
    const { user } = renderForm(SEEDED);
    const last = screen.getByLabelText(/last name/i);
    await user.clear(last);
    await user.type(last, 'Byron');
    await user.click(screen.getByRole('button', { name: /save profile/i }));
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ lastName: 'Byron' }),
      expect.anything(),
    );
  });

  it('sends an empty string field as null', async () => {
    const { user } = renderForm(SEEDED);
    const city = screen.getByLabelText(/city/i);
    await user.clear(city);
    await user.click(screen.getByRole('button', { name: /save profile/i }));
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ addressCity: null }),
      expect.anything(),
    );
  });

  it('removes a citizenship and submits the shortened list', async () => {
    const { user } = renderForm(SEEDED);
    await user.click(screen.getByRole('button', { name: /remove/i }));
    await user.click(screen.getByRole('button', { name: /save profile/i }));
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ citizenships: [] }),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Add a `steiger.config.js` override for the test's deep mock**

In `apps/frontend/steiger.config.js`, append a new config object to the array passed to `defineConfig`, immediately before the closing `]`:

```js
  {
    // The profile-form test mocks the profile entity API module by its deep
    // path because `profile.queries.ts` imports the fetcher from there
    // directly (not via the barrel). Mocking the barrel wouldn't reach that
    // import, so `vi.mock` MUST target the deep path. Allow the public-API
    // sidestep for this test file only.
    files: ['src/features/profile-form/**/*.test.{ts,tsx}'],
    rules: {
      'fsd/no-public-api-sidestep': 'off',
    },
  },
```

- [ ] **Step 3: Run the test — expect FAIL**

```
pnpm --filter frontend test -- --run
```

Expected: FAIL — `ProfileForm.test.tsx` cannot resolve `./ProfileForm.js`; the suite errors.

- [ ] **Step 4: Create the form component**

Note on imports: `UpdateUserProfileInput` / `UserProfile` / `useUpdateMyProfile` come from the `@/entities/profile` barrel; `countryName` and `ISO_3166_ALPHA3_CODES` come from the `@/entities/organisation` barrel (the contracts type re-export and the country-picker helpers live in different entities, so they are imported separately).

Create `apps/frontend/src/features/profile-form/ui/ProfileForm.tsx`:

```tsx
import type { UpdateUserProfileInput, UserProfile } from '@/entities/profile';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useUpdateMyProfile } from '@/entities/profile';
import { countryName, ISO_3166_ALPHA3_CODES } from '@/entities/organisation';
import { HttpError } from '@/shared/api';
import { Button, FormField, FormMessage, Input, Label } from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

export interface ProfileFormProps {
  /** The profile to seed the form from (the empty shape when not yet filled). */
  profile: UserProfile;
}

/** A sentinel `Select` value for the "no country" option (Select needs a non-empty string). */
const NONE = '__none__';

/**
 * Full-page form for editing the signed-in user's own profile. Empty-string
 * text/date inputs are submitted as `null` so a user can clear a field.
 */
export function ProfileForm({ profile }: ProfileFormProps): React.ReactElement {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const [firstName, setFirstName] = React.useState<string>(profile.firstName ?? '');
  const [lastName, setLastName] = React.useState<string>(profile.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = React.useState<string>(profile.dateOfBirth ?? '');
  const [taidoStartDate, setTaidoStartDate] = React.useState<string>(
    profile.taidoStartDate ?? '',
  );
  const [addressStreet, setAddressStreet] = React.useState<string>(profile.addressStreet ?? '');
  const [addressPostalCode, setAddressPostalCode] = React.useState<string>(
    profile.addressPostalCode ?? '',
  );
  const [addressCity, setAddressCity] = React.useState<string>(profile.addressCity ?? '');
  const [addressCountry, setAddressCountry] = React.useState<string>(
    profile.addressCountry ?? NONE,
  );
  const [citizenships, setCitizenships] = React.useState<string[]>(profile.citizenships);
  const [pendingCitizenship, setPendingCitizenship] = React.useState<string>('');
  const [submitError, setSubmitError] = React.useState<string | undefined>();
  const [saved, setSaved] = React.useState(false);

  /** Country options sorted by localised label. */
  const countryOptions = React.useMemo(
    () =>
      ISO_3166_ALPHA3_CODES.map((code) => ({ code, label: countryName(code, locale) })).sort(
        (a, b) => a.label.localeCompare(b.label, locale),
      ),
    [locale],
  );

  /** Country options not yet chosen as a citizenship. */
  const availableCitizenshipOptions = React.useMemo(
    () => countryOptions.filter((o) => !citizenships.includes(o.code)),
    [countryOptions, citizenships],
  );

  const update = useUpdateMyProfile({
    onSuccess: () => {
      setSaved(true);
      setSubmitError(undefined);
    },
    onError: (err) => {
      setSaved(false);
      setSubmitError(
        err instanceof HttpError
          ? err.message
          : t('common.unknownError', { defaultValue: 'Unknown error' }),
      );
    },
  });

  const addCitizenship = (): void => {
    if (!pendingCitizenship || citizenships.includes(pendingCitizenship)) return;
    setCitizenships([...citizenships, pendingCitizenship]);
    setPendingCitizenship('');
  };

  const removeCitizenship = (code: string): void => {
    setCitizenships(citizenships.filter((c) => c !== code));
  };

  /** Convert a text input value to `null` when blank, else the trimmed string. */
  const orNull = (v: string): string | null => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSaved(false);
    setSubmitError(undefined);
    const input: UpdateUserProfileInput = {
      firstName: orNull(firstName),
      lastName: orNull(lastName),
      dateOfBirth: orNull(dateOfBirth),
      taidoStartDate: orNull(taidoStartDate),
      addressStreet: orNull(addressStreet),
      addressPostalCode: orNull(addressPostalCode),
      addressCity: orNull(addressCity),
      addressCountry: addressCountry === NONE ? null : addressCountry,
      citizenships,
    };
    update.mutate(input);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField>
        <Label htmlFor="profile-first-name">{t('profile.fields.firstName')}</Label>
        <Input
          id="profile-first-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-last-name">{t('profile.fields.lastName')}</Label>
        <Input
          id="profile-last-name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-dob">{t('profile.fields.dateOfBirth')}</Label>
        <Input
          id="profile-dob"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-taido-start">{t('profile.fields.taidoStartDate')}</Label>
        <Input
          id="profile-taido-start"
          type="date"
          value={taidoStartDate}
          onChange={(e) => setTaidoStartDate(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-street">{t('profile.fields.addressStreet')}</Label>
        <Input
          id="profile-street"
          value={addressStreet}
          onChange={(e) => setAddressStreet(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-postal">{t('profile.fields.addressPostalCode')}</Label>
        <Input
          id="profile-postal"
          value={addressPostalCode}
          onChange={(e) => setAddressPostalCode(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-city">{t('profile.fields.addressCity')}</Label>
        <Input
          id="profile-city"
          value={addressCity}
          onChange={(e) => setAddressCity(e.target.value)}
        />
      </FormField>

      <FormField>
        <Label htmlFor="profile-country">{t('profile.fields.addressCountry')}</Label>
        <Select value={addressCountry} onValueChange={setAddressCountry}>
          <SelectTrigger id="profile-country" aria-label={t('profile.fields.addressCountry')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('profile.countryNone')}</SelectItem>
            {countryOptions.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.label} ({o.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField>
        <Label>{t('profile.fields.citizenships')}</Label>
        {citizenships.length === 0 ? null : (
          <ul className="divide-y">
            {citizenships.map((code) => (
              <li key={code} className="flex items-center justify-between gap-3 py-2">
                <span className="flex-1 truncate text-sm">
                  {countryName(code, locale)} ({code})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeCitizenship(code)}
                >
                  {t('profile.removeCitizenship')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-3">
          <Select value={pendingCitizenship} onValueChange={setPendingCitizenship}>
            <SelectTrigger className="flex-1" aria-label={t('profile.addCitizenship')}>
              <SelectValue placeholder={t('profile.addCitizenship')} />
            </SelectTrigger>
            <SelectContent>
              {availableCitizenshipOptions.map((o) => (
                <SelectItem key={o.code} value={o.code}>
                  {o.label} ({o.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCitizenship}
            disabled={!pendingCitizenship}
          >
            {t('profile.addCitizenship')}
          </Button>
        </div>
      </FormField>

      <FormMessage message={submitError} />
      {saved ? (
        <p role="status" className="text-sm text-on-surface-variant">
          {t('profile.saved')}
        </p>
      ) : null}

      <Button type="submit" disabled={update.isPending}>
        {t('profile.save')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Create the barrel**

Create `apps/frontend/src/features/profile-form/index.ts`:

```ts
export { ProfileForm, type ProfileFormProps } from './ui/ProfileForm.js';
```

- [ ] **Step 6: Run the test — expect PASS**

```
pnpm --filter frontend test -- --run
```

Expected: PASS — `ProfileForm.test.tsx` passes all 4 cases; the rest of the frontend suite stays green.

- [ ] **Step 7: Run the architecture lint**

```
pnpm --filter frontend arch
```

Expected: PASS — Steiger reports no errors; the `profile-form` slice respects FSD layering and the test's deep mock is permitted by the new override.

- [ ] **Step 8: Commit**

```
git add apps/frontend/src/features/profile-form/ui/ProfileForm.tsx apps/frontend/src/features/profile-form/ui/ProfileForm.test.tsx apps/frontend/src/features/profile-form/index.ts apps/frontend/steiger.config.js
git commit -m "feat(frontend): features/profile-form — editable profile form with citizenship multi-picker"
```

---

### Task 11: Frontend — `/profile` page + route

**Files:**
- Create: `apps/frontend/src/pages/profile/ui/ProfilePage.tsx`
- Create: `apps/frontend/src/pages/profile/index.ts`
- Create: `apps/frontend/src/app/router/routes/_app.profile.tsx`
- Modify: `apps/frontend/src/app/router/routeTree.gen.ts` (regenerated)

- [ ] **Step 1: Create the page component**

Create `apps/frontend/src/pages/profile/ui/ProfilePage.tsx`:

```tsx
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { myProfileQueryOptions } from '@/entities/profile';
import { ProfileForm } from '@/features/profile-form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui';

/**
 * Self-service profile page — any signed-in user can view and edit their own
 * profile here.
 */
export function ProfilePage(): React.ReactElement {
  const { t } = useTranslation();
  const profileQuery = useQuery(myProfileQueryOptions());

  return (
    <main className="container py-8">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{t('profile.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {profileQuery.isPending ? (
            <p className="text-on-surface-variant">{t('common.loading')}</p>
          ) : profileQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {profileQuery.error instanceof Error
                ? profileQuery.error.message
                : t('common.unknownError', { defaultValue: 'Unknown error' })}
            </p>
          ) : (
            <ProfileForm profile={profileQuery.data} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Create the page barrel**

Create `apps/frontend/src/pages/profile/index.ts`:

```ts
export { ProfilePage } from './ui/ProfilePage.js';
```

- [ ] **Step 3: Create the route**

Create `apps/frontend/src/app/router/routes/_app.profile.tsx`:

```tsx
import { createRoute } from '@tanstack/react-router';

import { ProfilePage } from '@/pages/profile';

import { appLayoutRoute } from './_app.js';

export const profileRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/profile',
  component: ProfilePage,
});

export const Route = profileRoute;
```

- [ ] **Step 4: Build the frontend to regenerate the route tree**

```
pnpm --filter frontend build
```

Expected: PASS — the TanStack Router Vite plugin regenerates `apps/frontend/src/app/router/routeTree.gen.ts` to include the `/profile` route under `_app`; Vite's production build finishes with exit 0.

- [ ] **Step 5: Typecheck the frontend**

```
pnpm --filter frontend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0; the page, route, and regenerated route tree compile.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/pages/profile/ui/ProfilePage.tsx apps/frontend/src/pages/profile/index.ts apps/frontend/src/app/router/routes/_app.profile.tsx apps/frontend/src/app/router/routeTree.gen.ts
git commit -m "feat(frontend): /profile page + route under the authenticated _app layout"
```

---

### Task 12: Frontend — sidebar "My profile" entry

**Files:**
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`

- [ ] **Step 1: Add the `UserRound` icon import and the NAV entry**

In `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`, add `UserRound` to the `lucide-react` import:

```tsx
import { Building2, History, LayoutDashboard, LogOut, UserRound, Users } from 'lucide-react';
```

Add a `/profile` entry to the `NAV` array (it sits in the main, non-admin nav group, so every authenticated user sees it):

```tsx
// Static nav config. Each entry is a route the authenticated user can reach
// from the sidebar. When new sections land, add a row here.
const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' as const },
  { to: '/profile', icon: UserRound, labelKey: 'nav.profile' as const },
] as const;
```

- [ ] **Step 2: Check whether `AppSidebar.test.tsx` asserts NAV entries**

```
ls apps/frontend/src/widgets/appsidebar/ui/
```

Expected output: lists the `appsidebar` UI files. If an `AppSidebar.test.tsx` exists, open it; if it asserts the exact set of nav links (e.g. a count or an exhaustive list), update it to include a "My profile" link. If no test file exists, or it only checks the admin group, no test change is needed — state which case applied.

- [ ] **Step 3: Run the frontend test suite**

```
pnpm --filter frontend test -- --run
```

Expected: PASS — the full frontend suite is green; the new NAV row does not break any existing sidebar assertion (or the assertion was updated in Step 2).

- [ ] **Step 4: Typecheck the frontend**

```
pnpm --filter frontend typecheck
```

Expected: PASS — `tsc --noEmit` exits 0; `nav.profile` is a valid translation key and the `NAV` tuple still typechecks.

- [ ] **Step 5: Commit**

```
git add apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx
git commit -m "feat(frontend): add My profile entry to the sidebar main nav"
```

---

### Task 13: Frontend — read-only Profile tab in `UserForm`

**Files:**
- Modify: `apps/frontend/src/features/user-form/ui/UserForm.tsx`
- Modify: `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`

- [ ] **Step 1: Extend `UserForm.test.tsx` with a failing Profile-tab test**

In `apps/frontend/src/features/user-form/ui/UserForm.test.tsx`, add a third `vi.mock` for the profile entity API module, alongside the existing organisation and membership mocks:

```ts
vi.mock('@/entities/profile/api/profile.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/profile/api/profile.api.js')>();
  return {
    ...actual,
    getUserProfile: vi.fn().mockResolvedValue({
      userId: '11111111-1111-4111-8111-111111111111',
      firstName: 'Ada',
      lastName: 'Lovelace',
      dateOfBirth: '1990-12-10',
      taidoStartDate: '2015-09-01',
      addressStreet: '12 Analytical Way',
      addressPostalCode: '11122',
      addressCity: 'Stockholm',
      addressCountry: 'SWE',
      citizenships: ['SWE', 'GBR'],
    }),
  };
});
```

Add a new test inside the `describe('<UserForm>', ...)` block:

```ts
it('renders the fetched profile read-only in the Profile tab', async () => {
  const { user } = renderForm();
  await user.click(screen.getByRole('tab', { name: /profile/i }));
  expect(await screen.findByText('Ada')).toBeInTheDocument();
  expect(screen.getByText('Lovelace')).toBeInTheDocument();
  expect(screen.getByText('Stockholm')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /save profile/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```
pnpm --filter frontend test -- --run
```

Expected: FAIL — the new `UserForm` test fails: there is no `tab` named "Profile" yet (`screen.getByRole('tab', { name: /profile/i })` throws).

- [ ] **Step 3: Add the read-only Profile tab to `UserForm.tsx`**

In `apps/frontend/src/features/user-form/ui/UserForm.tsx`, add the imports for the profile query and country name (after the existing `listOrganisationsQueryOptions` import):

```tsx
import { listOrganisationsQueryOptions, countryName } from '@/entities/organisation';
import { userProfileQueryOptions } from '@/entities/profile';
```

Add the profile query inside the `UserForm` component body, next to `membershipsQuery`:

```tsx
  const profileQuery = useQuery(userProfileQueryOptions(user.id));
  const profile = profileQuery.data;
  const profileIsEmpty =
    profile !== undefined &&
    profile.firstName === null &&
    profile.lastName === null &&
    profile.dateOfBirth === null &&
    profile.taidoStartDate === null &&
    profile.addressStreet === null &&
    profile.addressPostalCode === null &&
    profile.addressCity === null &&
    profile.addressCountry === null &&
    profile.citizenships.length === 0;
```

Add a third `<TabsTrigger>` to the `<TabsList>`, after the `memberships` trigger:

```tsx
        <TabsTrigger value="profile">
          {t('profile.title', { defaultValue: 'My profile' })}
        </TabsTrigger>
```

Add the corresponding `<TabsContent value="profile">` after the `memberships` `TabsContent` (just before the closing `</Tabs>`):

```tsx
      <TabsContent value="profile" className="space-y-3">
        {profileQuery.isPending ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : profileQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {profileQuery.error instanceof Error
              ? profileQuery.error.message
              : t('common.unknownError', { defaultValue: 'Unknown error' })}
          </p>
        ) : profileIsEmpty ? (
          <p className="text-on-surface-variant">{t('profile.empty')}</p>
        ) : (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-on-surface-variant">{t('profile.fields.firstName')}</dt>
            <dd>{profile?.firstName ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.lastName')}</dt>
            <dd>{profile?.lastName ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.dateOfBirth')}</dt>
            <dd>{profile?.dateOfBirth ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.taidoStartDate')}</dt>
            <dd>{profile?.taidoStartDate ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.addressStreet')}</dt>
            <dd>{profile?.addressStreet ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.addressPostalCode')}</dt>
            <dd>{profile?.addressPostalCode ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.addressCity')}</dt>
            <dd>{profile?.addressCity ?? '—'}</dd>
            <dt className="text-on-surface-variant">{t('profile.fields.addressCountry')}</dt>
            <dd>
              {profile?.addressCountry
                ? `${countryName(profile.addressCountry, i18n.language)} (${profile.addressCountry})`
                : '—'}
            </dd>
            <dt className="text-on-surface-variant">{t('profile.fields.citizenships')}</dt>
            <dd>
              {profile && profile.citizenships.length > 0
                ? profile.citizenships
                    .map((c) => `${countryName(c, i18n.language)} (${c})`)
                    .join(', ')
                : '—'}
            </dd>
          </dl>
        )}
      </TabsContent>
```

Update the `useTranslation()` destructure at the top of the component to also expose `i18n` (it currently destructures only `t`):

```tsx
  const { t, i18n } = useTranslation();
```

- [ ] **Step 4: Run the test — expect PASS**

```
pnpm --filter frontend test -- --run
```

Expected: PASS — the new `UserForm` Profile-tab test passes (the fetched `Ada` / `Lovelace` / `Stockholm` values render, no Save button); all other `UserForm` tests and the rest of the frontend suite stay green.

- [ ] **Step 5: Run the architecture lint**

```
pnpm --filter frontend arch
```

Expected: PASS — Steiger reports no errors; `user-form` already has an `fsd/no-public-api-sidestep: off` override (`src/features/user-form/**/*.test.{ts,tsx}`) that covers the new deep `profile.api.js` mock, and `UserForm.tsx` imports the profile entity through its public barrel.

- [ ] **Step 6: Commit**

```
git add apps/frontend/src/features/user-form/ui/UserForm.tsx apps/frontend/src/features/user-form/ui/UserForm.test.tsx
git commit -m "feat(frontend): read-only Profile tab in the admin UserForm"
```

---

### Task 14: Full pipeline + manual verification

**Files:**
- (no source files — verification task; a final commit only if regenerated artefacts remain)

- [ ] **Step 1: Run the full turbo pipeline**

```
pnpm turbo run typecheck lint arch test build
```

Expected: PASS — every task across `contracts`, `backend`, and `frontend` succeeds: `typecheck` (0 errors), `lint` (0 errors), `arch` (Steiger 0 errors), `test` (all suites green, including `profile.test.ts`, `profile.service.spec.ts`, `profile.api.test.ts`, `ProfileForm.test.tsx`, and the extended `UserForm.test.tsx`), and `build` (contracts tsup + backend nest build + frontend Vite build all exit 0).

- [ ] **Step 2: Confirm OpenAPI has no drift**

```
pnpm openapi:generate
git status --short packages/contracts/openapi/
```

Expected: `git status` reports no changes under `packages/contracts/openapi/` — the document was already regenerated in Task 7 and nothing further changed.

- [ ] **Step 3: Manual verification checklist (do not automate)**

Perform these steps by hand against a running dev environment:

1. Apply migration `0010` to the dev database:
   ```
   pnpm --filter backend db:migrate
   ```
   Confirm the `user_profile` table is created.
2. Start the backend and frontend dev servers. Sign in as a normal user.
3. Click "My profile" in the sidebar main nav — confirm it navigates to `/profile`.
4. Fill in every field: first name, last name, date of birth, taido start date, street, postal code, city, country, and add two or more citizenships via the multi-picker.
5. Click "Save profile" — confirm the "Profile saved." status appears.
6. Reload the page — confirm every value persisted, including all citizenships.
7. Confirm the sidebar footer / admin user list now shows the synced "First Last" name (the `user.name` sync).
8. Clear a previously-filled field (e.g. city) and save — reload and confirm it is now blank (null was sent).
9. Sign in as a sysadmin, open `/admin/users`, edit a user, and switch to the Profile tab — confirm that user's profile renders read-only with no Save action, and that a user with no profile shows the "not filled in" empty message.

- [ ] **Step 4: Final commit (only if regenerated artefacts remain)**

```
git status --short
```

If `git status` shows any tracked, regenerated artefacts still uncommitted (e.g. `routeTree.gen.ts` or an OpenAPI file changed by Step 2), stage and commit them:

```
git add apps/frontend/src/app/router/routeTree.gen.ts packages/contracts/openapi/openapi.json packages/contracts/openapi/openapi.yaml
git commit -m "chore: sync regenerated route tree and OpenAPI artefacts"
```

If `git status` is clean, state "Working tree clean — no final commit needed" and skip the commit.

---

## Notes

- **Migration is generated, not applied.** Task 3 only generates `0010_*.sql` and the `drizzle/meta/` files via `db:generate`. Applying it is environment-specific and is done per-environment with `pnpm --filter backend db:migrate` (covered in the Task 14 manual checklist) — the plan never runs `db:migrate`.
- **First SQL `date` columns and first `text[]` column.** `user_profile.date_of_birth` and `taido_start_date` are the codebase's first SQL `date` columns (mapped with Drizzle's `date('...', { mode: 'string' })`, so the TS type is `string` in `YYYY-MM-DD` form). `citizenships` is its first Postgres `text[]` column (`text('...').array().notNull().default([])`, TS type `string[]`). Both are standard Drizzle features — no special handling beyond importing `date` from `drizzle-orm/pg-core`.
- **Self-profile edits are deliberately not audited.** Per spec §2, a user editing their own low-risk personal data is not written to the audit log; the `user.name` sync is likewise not audited. `ProfileService` therefore does not depend on `AuditLogService`.
- **First/Last are the source of truth; `user.name` is the synced display field.** On `updateOwn`, when the patch touches `firstName` / `lastName`, the same transaction updates `user.name` to the joined "First Last" value (left unchanged when both are empty). The admin user-form's own `name` field on the Details tab is left unchanged (per spec §2) — the two can momentarily diverge and a profile save reconciles them.
