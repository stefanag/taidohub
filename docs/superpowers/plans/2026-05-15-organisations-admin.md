# Organisations Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a sysadmin-facing organisations admin page (`/admin/organisations`) with full CRUD, hierarchy validation, and tree-view UI.

**Architecture:** New Drizzle `organisations` table with `parent_id` self-FK and a strict-ladder type constraint enforced in the NestJS service. Admin-gated REST endpoints under `/api/admin/organisations` mirror the existing `posts` slice. The frontend builds a tree client-side from the flat list, with per-row Edit / Move / Delete dialogs. Authorization flows through the existing CASL pipeline (new `Organisation` subject).

**Tech Stack:** Drizzle ORM 0.45 (PostgreSQL), NestJS 11, `@casl/ability` 6, Zod 4, `nestjs-zod` 5, TanStack Router (file-based), TanStack Query 5, react-hook-form, shadcn primitives, i18next 26, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-05-15-organisations-admin-design.md`

---

## File Structure

### `packages/contracts/`
- Create: `src/organisations.ts` — Zod schemas + types + ISO list helper
- Modify: `src/index.ts` — re-export
- Modify: `src/routes.ts` — add `OrganisationsRoutes`
- Modify: `src/casl.ts` — add `'Organisation'` to `SubjectSchema` + `OrganisationSubjectShape`
- Modify: `tsup.config.ts` — add `organisations` entry
- Modify: `package.json` — add `./organisations` export
- Test: `src/__tests__/organisations.test.ts` (new dir if needed)

### `apps/backend/`
- Create: `src/infrastructure/database/schema/organisations.ts`
- Modify: `src/infrastructure/database/schema/index.ts`
- Create: `drizzle/0003_<name>.sql` (generated)
- Create: `src/modules/organisations/organisations.module.ts`
- Create: `src/modules/organisations/organisations.controller.ts`
- Create: `src/modules/organisations/organisations.service.ts`
- Create: `src/modules/organisations/organisations.repository.ts`
- Create: `src/modules/organisations/organisations.abilities.ts`
- Create: `src/modules/organisations/dto/{organisation,create-organisation,update-organisation,list-organisations-query,list-organisations-response}.dto.ts`
- Modify: `src/infrastructure/ability/ability.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/modules/organisations/organisations.service.spec.ts`
- Test: `test/organisations.e2e-spec.ts` (or matching pattern used in repo)

### `apps/frontend/`
- Create: `src/shared/ui/dialog.tsx` `dropdown-menu.tsx` `select.tsx` `tabs.tsx` (shadcn add)
- Create: `src/entities/organisation/api/organisation.api.ts`
- Create: `src/entities/organisation/model/organisation.queries.ts`
- Create: `src/entities/organisation/lib/buildTree.ts`
- Create: `src/entities/organisation/lib/displayName.ts`
- Create: `src/entities/organisation/index.ts`
- Create: `src/features/organisation-form/ui/OrganisationForm.tsx`
- Create: `src/features/organisation-form/index.ts`
- Create: `src/features/organisation-move-dialog/ui/OrganisationMoveDialog.tsx`
- Create: `src/features/organisation-move-dialog/index.ts`
- Create: `src/features/organisation-delete-dialog/ui/OrganisationDeleteDialog.tsx`
- Create: `src/features/organisation-delete-dialog/index.ts`
- Create: `src/widgets/organisation-tree/ui/OrganisationTree.tsx`
- Create: `src/widgets/organisation-tree/index.ts`
- Create: `src/pages/admin-organisations/ui/AdminOrganisationsPage.tsx`
- Create: `src/pages/admin-organisations/ui/AdminOrganisationsPage.stories.tsx`
- Create: `src/pages/admin-organisations/index.ts`
- Create: `src/app/router/routes/_app.admin.organisations.tsx`
- Modify: `src/widgets/appsidebar/ui/AppSidebar.tsx`
- Modify: `src/widgets/appsidebar/ui/AppSidebar.test.tsx`
- Modify: `src/i18n/locales/{en,sv,fi}.json`
- Test: alongside each unit (Vitest `.test.tsx` siblings)

---

## Task 1: Contracts — schemas, ISO list, CASL subject, routes

**Files:**
- Create: `packages/contracts/src/organisations.ts`
- Create: `packages/contracts/src/iso-3166-alpha3.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/routes.ts`
- Modify: `packages/contracts/src/casl.ts`
- Modify: `packages/contracts/tsup.config.ts`
- Modify: `packages/contracts/package.json`
- Test: `packages/contracts/src/__tests__/organisations.test.ts`

- [ ] **Step 1: Write the ISO 3166-1 alpha-3 list**

`packages/contracts/src/iso-3166-alpha3.ts`:
```ts
/**
 * Static ISO 3166-1 alpha-3 country codes. Trimmed for runtime cost.
 * If you need a code that isn't here, add it — don't fall back to free text.
 */
export const ISO_3166_ALPHA3_CODES = [
  'AFG','ALB','DZA','AND','AGO','ATG','ARG','ARM','AUS','AUT','AZE','BHS','BHR','BGD','BRB','BLR','BEL','BLZ','BEN','BTN',
  'BOL','BIH','BWA','BRA','BRN','BGR','BFA','BDI','CPV','KHM','CMR','CAN','CAF','TCD','CHL','CHN','COL','COM','COG','COD',
  'CRI','CIV','HRV','CUB','CYP','CZE','DNK','DJI','DMA','DOM','ECU','EGY','SLV','GNQ','ERI','EST','SWZ','ETH','FJI','FIN',
  'FRA','GAB','GMB','GEO','DEU','GHA','GRC','GRD','GTM','GIN','GNB','GUY','HTI','HND','HUN','ISL','IND','IDN','IRN','IRQ',
  'IRL','ISR','ITA','JAM','JPN','JOR','KAZ','KEN','KIR','KWT','KGZ','LAO','LVA','LBN','LSO','LBR','LBY','LIE','LTU','LUX',
  'MDG','MWI','MYS','MDV','MLI','MLT','MHL','MRT','MUS','MEX','FSM','MDA','MCO','MNG','MNE','MAR','MOZ','MMR','NAM','NRU',
  'NPL','NLD','NZL','NIC','NER','NGA','PRK','MKD','NOR','OMN','PAK','PLW','PSE','PAN','PNG','PRY','PER','PHL','POL','PRT',
  'QAT','ROU','RUS','RWA','KNA','LCA','VCT','WSM','SMR','STP','SAU','SEN','SRB','SYC','SLE','SGP','SVK','SVN','SLB','SOM',
  'ZAF','KOR','SSD','ESP','LKA','SDN','SUR','SWE','CHE','SYR','TWN','TJK','TZA','THA','TLS','TGO','TON','TTO','TUN','TUR',
  'TKM','TUV','UGA','UKR','ARE','GBR','USA','URY','UZB','VUT','VAT','VEN','VNM','YEM','ZMB','ZWE',
] as const;

export type IsoAlpha3 = (typeof ISO_3166_ALPHA3_CODES)[number];

const SET = new Set<string>(ISO_3166_ALPHA3_CODES);
export function isIsoAlpha3(code: string): code is IsoAlpha3 {
  return SET.has(code);
}
```

- [ ] **Step 2: Write the Zod schemas + types**

`packages/contracts/src/organisations.ts`:
```ts
import { z } from './zod-openapi.js';
import { isIsoAlpha3, ISO_3166_ALPHA3_CODES } from './iso-3166-alpha3.js';

const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO_DATETIME_EXAMPLE = '2025-04-02T08:00:00.000Z';

export const OrganisationTypeSchema = z
  .enum(['international_federation', 'national_federation', 'club'])
  .meta({ id: 'OrganisationType', description: 'Organisation type (immutable after create).' });

export type OrganisationType = z.infer<typeof OrganisationTypeSchema>;

const CountrySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Country must be ISO 3166-1 alpha-3.')
  .refine(isIsoAlpha3, { message: 'Unknown country code.' });

const OptionalEmail = z.string().email().nullable().optional();

export const OrganisationSchema = z
  .object({
    id: z.string().uuid().describe('Unique identifier.'),
    parentId: z.string().uuid().nullable().describe('Parent organisation id, null for international federations.'),
    type: OrganisationTypeSchema,
    shortCode: z.string().min(1).max(20).describe('Short display code, e.g. "WTF".'),
    slug: z.string().min(1).max(100).nullable().describe('URL-safe full name. Unique when present.'),
    country: CountrySchema.describe('ISO 3166-1 alpha-3 country code.'),
    nameEn: z.string().min(1).max(200),
    nameSv: z.string().min(1).max(200),
    nameFi: z.string().min(1).max(200),
    nameJa: z.string().max(200).nullable(),
    logoUrl: z.string().url().nullable(),
    address: z.string().nullable(),
    contactEmail: OptionalEmail,
    headInstructorId: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({
    id: 'Organisation',
    example: {
      id: UUID_EXAMPLE,
      parentId: null,
      type: 'international_federation',
      shortCode: 'WTF',
      slug: 'world-taido-federation',
      country: 'JPN',
      nameEn: 'World Taido Federation',
      nameSv: 'Världstaidoförbundet',
      nameFi: 'Maailman Taidoliitto',
      nameJa: '世界躰道連盟',
      logoUrl: null,
      address: null,
      contactEmail: null,
      headInstructorId: null,
      createdAt: ISO_DATETIME_EXAMPLE,
      updatedAt: ISO_DATETIME_EXAMPLE,
    },
  });

export const CreateOrganisationSchema = OrganisationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).meta({ id: 'CreateOrganisationInput' });

export const UpdateOrganisationSchema = CreateOrganisationSchema.partial()
  .omit({ type: true }) // type is immutable
  .meta({ id: 'UpdateOrganisationInput' });

export const ListOrganisationsQuerySchema = z
  .object({
    type: OrganisationTypeSchema.optional(),
    country: CountrySchema.optional(),
    parentId: z.string().uuid().nullable().optional(),
    q: z.string().optional(),
  })
  .meta({ id: 'ListOrganisationsQuery' });

export const ListOrganisationsResponseSchema = z
  .object({
    data: OrganisationSchema.array(),
    total: z.number().int().nonnegative(),
  })
  .meta({ id: 'ListOrganisationsResponse' });

export type Organisation = z.infer<typeof OrganisationSchema>;
export type CreateOrganisationInput = z.infer<typeof CreateOrganisationSchema>;
export type UpdateOrganisationInput = z.infer<typeof UpdateOrganisationSchema>;
export type ListOrganisationsQuery = z.infer<typeof ListOrganisationsQuerySchema>;
export type ListOrganisationsResponse = z.infer<typeof ListOrganisationsResponseSchema>;

export const OrganisationsOpenApiRegistry = {
  Organisation: OrganisationSchema,
  OrganisationType: OrganisationTypeSchema,
  CreateOrganisationInput: CreateOrganisationSchema,
  UpdateOrganisationInput: UpdateOrganisationSchema,
  ListOrganisationsQuery: ListOrganisationsQuerySchema,
  ListOrganisationsResponse: ListOrganisationsResponseSchema,
} as const;

export { ISO_3166_ALPHA3_CODES, isIsoAlpha3 } from './iso-3166-alpha3.js';
export type { IsoAlpha3 } from './iso-3166-alpha3.js';
```

- [ ] **Step 3: Add `Organisation` to the CASL subject vocabulary**

Modify `packages/contracts/src/casl.ts`:
- In `SubjectSchema = z.enum([...])`, add `'Organisation'`.
- Below the existing `UserSubjectShape`, add:
```ts
export type OrganisationSubjectShape = {
  readonly __caslSubjectType__: 'Organisation';
  id?: string;
};
```
- Add `OrganisationSubjectShape` to the `AppSubject` union.

- [ ] **Step 4: Add the routes constant**

Modify `packages/contracts/src/routes.ts`, add to the bottom:
```ts
export const OrganisationsRoutes = {
  base: '/api/admin/organisations',
  byId: (id: string) => `/api/admin/organisations/${id}` as const,
} as const;
```

- [ ] **Step 5: Wire up barrel, tsup entry, package exports**

Modify `packages/contracts/src/index.ts`, add after the existing exports:
```ts
export * from './organisations.js';
```

Modify `packages/contracts/tsup.config.ts`, add `organisations: 'src/organisations.ts'` to `entry`.

Modify `packages/contracts/package.json`, add this block alongside the other subpath exports:
```json
"./organisations": {
  "import": {
    "types": "./dist/organisations.d.ts",
    "default": "./dist/organisations.js"
  },
  "require": {
    "types": "./dist/organisations.d.cts",
    "default": "./dist/organisations.cjs"
  }
}
```

- [ ] **Step 6: Write contract tests**

`packages/contracts/src/__tests__/organisations.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import {
  CreateOrganisationSchema,
  OrganisationSchema,
  UpdateOrganisationSchema,
  isIsoAlpha3,
} from '../organisations.js';

const VALID_BASE = {
  parentId: null,
  type: 'international_federation' as const,
  shortCode: 'WTF',
  slug: 'world-taido-federation',
  country: 'JPN',
  nameEn: 'World Taido Federation',
  nameSv: 'Världstaidoförbundet',
  nameFi: 'Maailman Taidoliitto',
  nameJa: '世界躰道連盟',
  logoUrl: null,
  address: null,
  contactEmail: null,
  headInstructorId: null,
};

describe('isIsoAlpha3', () => {
  it('accepts known codes', () => {
    expect(isIsoAlpha3('SWE')).toBe(true);
    expect(isIsoAlpha3('FIN')).toBe(true);
    expect(isIsoAlpha3('JPN')).toBe(true);
  });

  it('rejects unknown / lowercase', () => {
    expect(isIsoAlpha3('XXX')).toBe(false);
    expect(isIsoAlpha3('swe')).toBe(false);
  });
});

describe('CreateOrganisationSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = CreateOrganisationSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(true);
  });

  it('rejects unknown country codes', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, country: 'XYZ' });
    expect(result.success).toBe(false);
  });

  it('rejects bad type', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, type: 'school' });
    expect(result.success).toBe(false);
  });

  it('rejects empty required name', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, nameEn: '' });
    expect(result.success).toBe(false);
  });

  it('allows nullable name_ja', () => {
    const result = CreateOrganisationSchema.safeParse({ ...VALID_BASE, nameJa: null });
    expect(result.success).toBe(true);
  });
});

describe('UpdateOrganisationSchema', () => {
  it('rejects `type` field', () => {
    const result = UpdateOrganisationSchema.safeParse({ type: 'club' });
    expect(result.success).toBe(false);
  });

  it('accepts a partial update', () => {
    const result = UpdateOrganisationSchema.safeParse({ nameEn: 'New name' });
    expect(result.success).toBe(true);
  });
});

describe('OrganisationSchema', () => {
  it('requires id, timestamps', () => {
    const result = OrganisationSchema.safeParse(VALID_BASE);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 7: Run tests + typecheck + build**

```bash
pnpm --filter @repo/contracts test
pnpm --filter @repo/contracts typecheck
pnpm --filter @repo/contracts build
```
Expected: all green, `dist/organisations.{js,cjs,d.ts,d.cts}` produced.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/
git commit -m "feat(contracts): add Organisation schemas + CASL subject + routes"
```

---

## Task 2: Backend — Drizzle schema + migration

**Files:**
- Create: `apps/backend/src/infrastructure/database/schema/organisations.ts`
- Modify: `apps/backend/src/infrastructure/database/schema/index.ts`
- Create: `apps/backend/drizzle/0003_*.sql` (generated)

- [ ] **Step 1: Write the schema**

`apps/backend/src/infrastructure/database/schema/organisations.ts`:
```ts
import { AnyPgColumn, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from './users.js';

/**
 * `organisations` — federation/club hierarchy. Self-referential parent_id;
 * the strict-ladder rules (IF → null, NF → IF, club → NF|club) are enforced
 * in the service layer, not the database.
 */
export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => organisations.id, { onDelete: 'restrict' }),
    type: text('type', { enum: ['international_federation', 'national_federation', 'club'] }).notNull(),
    shortCode: text('short_code').notNull(),
    slug: text('slug'),
    country: text('country').notNull(),
    nameEn: text('name_en').notNull(),
    nameSv: text('name_sv').notNull(),
    nameFi: text('name_fi').notNull(),
    nameJa: text('name_ja'),
    logoUrl: text('logo_url'),
    address: text('address'),
    contactEmail: text('contact_email'),
    headInstructorId: text('head_instructor_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    parentIdx: index('organisations_parent_id_idx').on(table.parentId),
    typeIdx: index('organisations_type_idx').on(table.type),
    countryIdx: index('organisations_country_idx').on(table.country),
    slugUnique: uniqueIndex('organisations_slug_unique').on(table.slug),
    shortCodeUnique: uniqueIndex('organisations_short_code_country_type_unique').on(
      table.country,
      table.type,
      table.shortCode,
    ),
  }),
);

export type DbOrganisation = typeof organisations.$inferSelect;
export type DbNewOrganisation = typeof organisations.$inferInsert;
```

- [ ] **Step 2: Re-export from the schema barrel**

Modify `apps/backend/src/infrastructure/database/schema/index.ts`, append:
```ts
export * from './organisations.js';
```

- [ ] **Step 3: Generate the migration**

```bash
pnpm --filter backend db:generate
```
Expected: new `drizzle/0003_*.sql` file created. Open it and sanity-check that it includes:
- `CREATE TABLE "organisations" (...)` with all columns
- Foreign keys to `organisations.id` (RESTRICT) and `"user".id` (SET NULL)
- Indexes for parent_id / type / country
- Unique indexes for slug and (country, type, short_code)

- [ ] **Step 4: Apply the migration locally**

```bash
pnpm --filter backend db:migrate
```
Expected: prints "applied" for the new migration, exits 0. Re-running is a no-op.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/database/schema/ apps/backend/drizzle/
git commit -m "feat(backend): add organisations table"
```

---

## Task 3: Backend — CASL ability rules + module wiring

**Files:**
- Create: `apps/backend/src/modules/organisations/organisations.abilities.ts`
- Modify: `apps/backend/src/infrastructure/ability/ability.module.ts`

- [ ] **Step 1: Write the rule contributor**

`apps/backend/src/modules/organisations/organisations.abilities.ts`:
```ts
import { type AbilityBuilder } from '@casl/ability';
import { Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  type AbilityRuleContributor,
  type AppAbility,
} from '../../infrastructure/ability/ability.types.js';

/**
 * Organisation rules: only `role === 'admin'` can do anything. v1 surfaces
 * no public/anonymous read; relax later if non-admins need the tree.
 */
@Injectable()
export class OrganisationsAbilityRules implements AbilityRuleContributor {
  contributeTo(builder: AbilityBuilder<AppAbility>, user: AuthenticatedUser | null): void {
    if (user?.role === 'admin') {
      builder.can('manage', 'Organisation');
    }
  }
}
```

- [ ] **Step 2: Register the rules in `AbilityModule`**

Modify `apps/backend/src/infrastructure/ability/ability.module.ts`:
- Add the import:
```ts
import { OrganisationsAbilityRules } from '../../modules/organisations/organisations.abilities.js';
```
- Add `OrganisationsAbilityRules` to the `providers` array alongside `PostsAbilityRules` and `UsersAbilityRules`.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/organisations/organisations.abilities.ts apps/backend/src/infrastructure/ability/ability.module.ts
git commit -m "feat(backend): add Organisation CASL rules"
```

---

## Task 4: Backend — repository

**Files:**
- Create: `apps/backend/src/modules/organisations/organisations.repository.ts`

- [ ] **Step 1: Write the repository**

`apps/backend/src/modules/organisations/organisations.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateOrganisationInput,
  ListOrganisationsQuery,
  UpdateOrganisationInput,
} from '@repo/contracts/organisations';
import { and, count, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { organisations, type DbOrganisation } from '../../infrastructure/database/schema/index.js';

@Injectable()
export class OrganisationsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<DbOrganisation | null> {
    const rows = await this.db.select().from(organisations).where(eq(organisations.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async list(filter: ListOrganisationsQuery): Promise<{ data: DbOrganisation[]; total: number }> {
    const filters: SQL[] = [];
    if (filter.type) filters.push(eq(organisations.type, filter.type));
    if (filter.country) filters.push(eq(organisations.country, filter.country));
    if (filter.parentId === null) {
      filters.push(isNull(organisations.parentId));
    } else if (filter.parentId !== undefined) {
      filters.push(eq(organisations.parentId, filter.parentId));
    }
    if (filter.q) {
      const needle = `%${filter.q}%`;
      const search = or(
        ilike(organisations.nameEn, needle),
        ilike(organisations.nameSv, needle),
        ilike(organisations.nameFi, needle),
        ilike(organisations.shortCode, needle),
      );
      if (search) filters.push(search);
    }
    const where = filters.length ? and(...filters) : undefined;

    const data = await this.db.select().from(organisations).where(where).orderBy(organisations.nameEn);
    const totalRows = await this.db.select({ value: count() }).from(organisations).where(where);
    return { data, total: Number(totalRows[0]?.value ?? 0) };
  }

  async create(input: CreateOrganisationInput): Promise<DbOrganisation> {
    const rows = await this.db
      .insert(organisations)
      .values({
        parentId: input.parentId,
        type: input.type,
        shortCode: input.shortCode,
        slug: input.slug,
        country: input.country,
        nameEn: input.nameEn,
        nameSv: input.nameSv,
        nameFi: input.nameFi,
        nameJa: input.nameJa,
        logoUrl: input.logoUrl,
        address: input.address,
        contactEmail: input.contactEmail ?? null,
        headInstructorId: input.headInstructorId,
      })
      .returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(id: string, input: UpdateOrganisationInput): Promise<DbOrganisation | null> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      'parentId','shortCode','slug','country','nameEn','nameSv','nameFi','nameJa',
      'logoUrl','address','contactEmail','headInstructorId',
    ] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }
    const rows = await this.db.update(organisations).set(patch).where(eq(organisations.id, id)).returning();
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(organisations).where(eq(organisations.id, id)).returning({ id: organisations.id });
    return rows.length > 0;
  }

  async countChildren(id: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(organisations)
      .where(eq(organisations.parentId, id));
    return Number(rows[0]?.value ?? 0);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/modules/organisations/organisations.repository.ts
git commit -m "feat(backend): add organisations repository"
```

---

## Task 5: Backend — service with hierarchy + cycle detection

**Files:**
- Create: `apps/backend/src/modules/organisations/organisations.service.ts`
- Test: `apps/backend/src/modules/organisations/organisations.service.spec.ts`

- [ ] **Step 1: Write failing tests for hierarchy + cycle + delete-with-children**

`apps/backend/src/modules/organisations/organisations.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { OrganisationsRepository } from './organisations.repository.js';
import { OrganisationsService } from './organisations.service.js';

const admin = { id: 'u-admin', email: 'admin@example.com', role: 'admin' as const };
const civilian = { id: 'u-user', email: 'user@example.com', role: 'user' as const };

const IF_ROW = {
  id: 'if-1', parentId: null, type: 'international_federation', shortCode: 'WTF',
  slug: null, country: 'JPN', nameEn: 'WTF', nameSv: 'WTF', nameFi: 'WTF', nameJa: null,
  logoUrl: null, address: null, contactEmail: null, headInstructorId: null,
  createdAt: new Date(), updatedAt: new Date(),
};
const NF_ROW = { ...IF_ROW, id: 'nf-1', parentId: 'if-1', type: 'national_federation', shortCode: 'STF', country: 'SWE' };
const CLUB_ROW = { ...IF_ROW, id: 'club-1', parentId: 'nf-1', type: 'club', shortCode: 'STK', country: 'SWE' };
const SUBCLUB_ROW = { ...CLUB_ROW, id: 'club-2', parentId: 'club-1', shortCode: 'STK2' };

function repoStub() {
  return {
    findById: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    countChildren: vi.fn(),
  } satisfies Record<keyof OrganisationsRepository, ReturnType<typeof vi.fn>>;
}

async function makeService(repo: ReturnType<typeof repoStub>) {
  const module = await Test.createTestingModule({
    providers: [
      OrganisationsService,
      AbilityFactory,
      { provide: 'POSTS_ABILITY_RULES', useValue: { contributeTo: () => {} } },
      { provide: 'USERS_ABILITY_RULES', useValue: { contributeTo: () => {} } },
      { provide: OrganisationsRepository, useValue: repo },
    ],
  })
    .overrideProvider(AbilityFactory)
    .useValue({
      createForUser: (u: typeof admin | null) => ({
        can: (_a: string, _s: string) => u?.role === 'admin',
        cannot: () => false,
        rulesFor: () => [],
      }),
    } as unknown as AbilityFactory)
    .compile();
  return module.get(OrganisationsService);
}

describe('OrganisationsService — hierarchy', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: OrganisationsService;
  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('creates an IF with parentId=null', async () => {
    repo.create.mockResolvedValue(IF_ROW);
    const out = await service.create({ ...IF_ROW, parentId: null, type: 'international_federation' } as any, admin);
    expect(out.id).toBe('if-1');
  });

  it('rejects an IF with a parent', async () => {
    await expect(
      service.create({ ...IF_ROW, parentId: 'nf-1', type: 'international_federation' } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an NF without a parent', async () => {
    await expect(
      service.create({ ...NF_ROW, parentId: null, type: 'national_federation' } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an NF whose parent is not an IF', async () => {
    repo.findById.mockResolvedValue(NF_ROW);
    await expect(
      service.create({ ...NF_ROW, parentId: 'nf-1', type: 'national_federation' } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts an NF whose parent is an IF', async () => {
    repo.findById.mockResolvedValue(IF_ROW);
    repo.create.mockResolvedValue(NF_ROW);
    const out = await service.create({ ...NF_ROW, parentId: 'if-1', type: 'national_federation' } as any, admin);
    expect(out.type).toBe('national_federation');
  });

  it('accepts a club whose parent is another club', async () => {
    repo.findById.mockResolvedValue(CLUB_ROW);
    repo.create.mockResolvedValue(SUBCLUB_ROW);
    const out = await service.create({ ...SUBCLUB_ROW, parentId: 'club-1', type: 'club' } as any, admin);
    expect(out.type).toBe('club');
  });

  it('rejects a club whose parent is an IF', async () => {
    repo.findById.mockResolvedValue(IF_ROW);
    await expect(
      service.create({ ...CLUB_ROW, parentId: 'if-1', type: 'club' } as any, admin),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('OrganisationsService — cycle detection', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: OrganisationsService;
  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('rejects reparenting a node under one of its descendants', async () => {
    // Trying to move club-1 under club-2 (its own child) → cycle
    repo.findById.mockImplementation(async (id: string) => {
      if (id === 'club-1') return CLUB_ROW;
      if (id === 'club-2') return SUBCLUB_ROW;
      return null;
    });
    await expect(service.update('club-1', { parentId: 'club-2' }, admin)).rejects.toThrow(BadRequestException);
  });
});

describe('OrganisationsService — delete', () => {
  let repo: ReturnType<typeof repoStub>;
  let service: OrganisationsService;
  beforeEach(async () => {
    repo = repoStub();
    service = await makeService(repo);
  });

  it('returns 409 when target has children', async () => {
    repo.findById.mockResolvedValue(IF_ROW);
    repo.countChildren.mockResolvedValue(2);
    await expect(service.delete('if-1', admin)).rejects.toThrow(ConflictException);
  });

  it('deletes when childless', async () => {
    repo.findById.mockResolvedValue(IF_ROW);
    repo.countChildren.mockResolvedValue(0);
    repo.delete.mockResolvedValue(true);
    await expect(service.delete('if-1', admin)).resolves.toBeUndefined();
  });

  it('404s when target not found', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.delete('nope', admin)).rejects.toThrow(NotFoundException);
  });
});

describe('OrganisationsService — authorization', () => {
  it('non-admin cannot create', async () => {
    const repo = repoStub();
    const service = await makeService(repo);
    await expect(
      service.create({ ...IF_ROW, parentId: null, type: 'international_federation' } as any, civilian),
    ).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run tests, confirm they fail**

```bash
pnpm --filter backend test src/modules/organisations
```
Expected: tests fail (module doesn't exist yet).

- [ ] **Step 3: Implement the service**

`apps/backend/src/modules/organisations/organisations.service.ts`:
```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ForbiddenError } from '@casl/ability';
import type {
  CreateOrganisationInput,
  ListOrganisationsQuery,
  ListOrganisationsResponse,
  Organisation,
  OrganisationType,
  UpdateOrganisationInput,
} from '@repo/contracts/organisations';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { type DbOrganisation } from '../../infrastructure/database/schema/index.js';

import { OrganisationsRepository } from './organisations.repository.js';

@Injectable()
export class OrganisationsService {
  constructor(
    private readonly repo: OrganisationsRepository,
    private readonly abilities: AbilityFactory,
  ) {}

  async list(query: ListOrganisationsQuery, user: AuthenticatedUser | null): Promise<ListOrganisationsResponse> {
    this.assertCan(user, 'read');
    const { data, total } = await this.repo.list(query);
    return { data: data.map((r) => this.toApi(r)), total };
  }

  async findOne(id: string, user: AuthenticatedUser | null): Promise<Organisation> {
    this.assertCan(user, 'read');
    const row = await this.requireById(id);
    return this.toApi(row);
  }

  async create(input: CreateOrganisationInput, user: AuthenticatedUser): Promise<Organisation> {
    this.assertCan(user, 'create');
    await this.validateHierarchy(input.type, input.parentId);
    const row = await this.repo.create(input);
    return this.toApi(row);
  }

  async update(id: string, input: UpdateOrganisationInput, user: AuthenticatedUser): Promise<Organisation> {
    this.assertCan(user, 'update');
    const existing = await this.requireById(id);

    if (input.parentId !== undefined) {
      await this.validateHierarchy(existing.type, input.parentId);
      if (input.parentId !== null) {
        await this.assertNoCycle(id, input.parentId);
      }
    }

    const row = await this.repo.update(id, input);
    if (!row) throw new NotFoundException(this.notFound(id));
    return this.toApi(row);
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    this.assertCan(user, 'delete');
    await this.requireById(id);
    const childCount = await this.repo.countChildren(id);
    if (childCount > 0) {
      throw new ConflictException({
        error: { code: 'HAS_CHILDREN', message: `Organisation ${id} still has ${childCount} child(ren).` },
      });
    }
    await this.repo.delete(id);
  }

  private async validateHierarchy(type: OrganisationType, parentId: string | null): Promise<void> {
    if (type === 'international_federation') {
      if (parentId !== null) {
        throw new BadRequestException({
          error: { code: 'INVALID_PARENT', message: 'International federations cannot have a parent.' },
        });
      }
      return;
    }
    if (parentId === null) {
      throw new BadRequestException({
        error: { code: 'INVALID_PARENT', message: `A ${type} must have a parent.` },
      });
    }
    const parent = await this.repo.findById(parentId);
    if (!parent) {
      throw new BadRequestException({
        error: { code: 'INVALID_PARENT', message: `Parent ${parentId} not found.` },
      });
    }
    if (type === 'national_federation' && parent.type !== 'international_federation') {
      throw new BadRequestException({
        error: { code: 'INVALID_PARENT', message: 'National federations must be parented by an international federation.' },
      });
    }
    if (type === 'club' && parent.type !== 'national_federation' && parent.type !== 'club') {
      throw new BadRequestException({
        error: { code: 'INVALID_PARENT', message: 'A club must be parented by a national federation or another club.' },
      });
    }
  }

  /** Walk up from `parentId`; if we reach `nodeId`, that's a cycle. */
  private async assertNoCycle(nodeId: string, parentId: string): Promise<void> {
    let cursor: string | null = parentId;
    const visited = new Set<string>();
    while (cursor !== null) {
      if (cursor === nodeId) {
        throw new BadRequestException({
          error: { code: 'CYCLE', message: 'Reparenting would create a cycle.' },
        });
      }
      if (visited.has(cursor)) break; // defensive: shouldn't happen on a consistent tree
      visited.add(cursor);
      const row = await this.repo.findById(cursor);
      cursor = row?.parentId ?? null;
    }
  }

  private assertCan(user: AuthenticatedUser | null, action: 'create' | 'read' | 'update' | 'delete'): void {
    const ability = this.abilities.createForUser(user);
    try {
      ForbiddenError.from(ability).throwUnlessCan(action, 'Organisation');
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw new ForbiddenException({
          error: { code: 'FORBIDDEN', message: err.message },
        });
      }
      throw err;
    }
  }

  private async requireById(id: string): Promise<DbOrganisation> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException(this.notFound(id));
    return row;
  }

  private notFound(id: string) {
    return { error: { code: 'NOT_FOUND', message: `Organisation ${id} not found.` } };
  }

  private toApi(row: DbOrganisation): Organisation {
    return {
      id: row.id,
      parentId: row.parentId,
      type: row.type as OrganisationType,
      shortCode: row.shortCode,
      slug: row.slug,
      country: row.country,
      nameEn: row.nameEn,
      nameSv: row.nameSv,
      nameFi: row.nameFi,
      nameJa: row.nameJa,
      logoUrl: row.logoUrl,
      address: row.address,
      contactEmail: row.contactEmail,
      headInstructorId: row.headInstructorId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run tests, confirm green**

```bash
pnpm --filter backend test src/modules/organisations
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/organisations/organisations.service.ts apps/backend/src/modules/organisations/organisations.service.spec.ts
git commit -m "feat(backend): organisations service with hierarchy + cycle + delete-with-children"
```

---

## Task 6: Backend — DTOs, controller, module wiring

**Files:**
- Create: `apps/backend/src/modules/organisations/dto/{organisation,create-organisation,update-organisation,list-organisations-query,list-organisations-response}.dto.ts`
- Create: `apps/backend/src/modules/organisations/organisations.controller.ts`
- Create: `apps/backend/src/modules/organisations/organisations.module.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: DTOs**

Five files, all one-liner createZodDto wrappers. Example:

`organisation.dto.ts`:
```ts
import { OrganisationSchema } from '@repo/contracts/organisations';
import { createZodDto } from 'nestjs-zod';
export class OrganisationDto extends createZodDto(OrganisationSchema) {}
```

Repeat for `CreateOrganisationDto`, `UpdateOrganisationDto`, `ListOrganisationsQueryDto`, `ListOrganisationsResponseDto` against the matching schemas.

- [ ] **Step 2: Controller**

`apps/backend/src/modules/organisations/organisations.controller.ts`:
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
  Query,
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
import type {
  ListOrganisationsResponse,
  Organisation,
} from '@repo/contracts/organisations';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';

import { CreateOrganisationDto } from './dto/create-organisation.dto.js';
import { ListOrganisationsQueryDto } from './dto/list-organisations-query.dto.js';
import { ListOrganisationsResponseDto } from './dto/list-organisations-response.dto.js';
import { OrganisationDto } from './dto/organisation.dto.js';
import { UpdateOrganisationDto } from './dto/update-organisation.dto.js';
import { OrganisationsService } from './organisations.service.js';

@ApiTags('organisations')
@ApiCookieAuth('session')
@Controller('admin/organisations')
export class OrganisationsController {
  constructor(private readonly orgs: OrganisationsService) {}

  @Get()
  @CheckAbility('read', 'Organisation')
  @ApiEndpoint({
    summary: 'List organisations (flat).',
    operationId: 'OrganisationsController_list',
    ok: ListOrganisationsResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  list(
    @Query() query: ListOrganisationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListOrganisationsResponse> {
    return this.orgs.list(query, user);
  }

  @Get(':id')
  @CheckAbility('read', 'Organisation')
  @ApiParam({ name: 'id', description: 'Organisation UUID.' })
  @ApiEndpoint({
    summary: 'Get an organisation by id.',
    operationId: 'OrganisationsController_findOne',
    ok: OrganisationDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Organisation> {
    return this.orgs.findOne(id, user);
  }

  @Post()
  @ApiBody({ type: CreateOrganisationDto })
  @ApiCreatedResponse({ type: OrganisationDto })
  @ApiEndpoint({
    summary: 'Create an organisation.',
    operationId: 'OrganisationsController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403'],
  })
  create(
    @Body() body: CreateOrganisationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Organisation> {
    return this.orgs.create(body, user);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Organisation UUID.' })
  @ApiBody({ type: UpdateOrganisationDto })
  @ApiOkResponse({ type: OrganisationDto })
  @ApiEndpoint({
    summary: 'Update or move an organisation.',
    operationId: 'OrganisationsController_update',
    ok: OrganisationDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateOrganisationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Organisation> {
    return this.orgs.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Organisation UUID.' })
  @ApiNoContentResponse({ description: 'Organisation deleted.' })
  @ApiEndpoint({
    summary: 'Delete an organisation (must be childless).',
    operationId: 'OrganisationsController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.orgs.delete(id, user);
  }
}
```

- [ ] **Step 3: Module**

`apps/backend/src/modules/organisations/organisations.module.ts`:
```ts
import { Module } from '@nestjs/common';

import { OrganisationsController } from './organisations.controller.js';
import { OrganisationsRepository } from './organisations.repository.js';
import { OrganisationsService } from './organisations.service.js';

@Module({
  controllers: [OrganisationsController],
  providers: [OrganisationsService, OrganisationsRepository],
  exports: [OrganisationsService],
})
export class OrganisationsModule {}
```

- [ ] **Step 4: Register in `AppModule`**

Modify `apps/backend/src/app.module.ts`:
- Import `OrganisationsModule`.
- Add it to the `imports` array after `PostsModule`.

- [ ] **Step 5: Run typecheck + tests**

```bash
pnpm --filter backend typecheck
pnpm --filter backend test
```
Expected: green.

- [ ] **Step 6: Smoke-test the API**

```bash
pnpm --filter backend dev   # in another shell
# In a third shell, sign in as the seeded sysadmin, then:
curl -s -b cookies.txt http://localhost:3000/api/admin/organisations | jq .
```
Expected: `{"data":[],"total":0}` for an empty table; `403` if cookie is missing.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/organisations/ apps/backend/src/app.module.ts
git commit -m "feat(backend): organisations controller + module wiring"
```

---

## Task 7: Frontend — add shadcn primitives

**Files:**
- Create: `apps/frontend/src/shared/ui/dialog.tsx`
- Create: `apps/frontend/src/shared/ui/dropdown-menu.tsx`
- Create: `apps/frontend/src/shared/ui/select.tsx`
- Create: `apps/frontend/src/shared/ui/tabs.tsx`
- Modify: `apps/frontend/src/shared/ui/index.ts` (barrel re-exports)

- [ ] **Step 1: Run the shadcn CLI for each primitive**

```bash
cd apps/frontend
pnpm dlx shadcn@latest add dialog dropdown-menu select tabs
```
Expected: four new files created under `src/shared/ui/`.

- [ ] **Step 2: Add re-exports to `index.ts`**

Modify `apps/frontend/src/shared/ui/index.ts` and append exports for the new components (follow the pattern of existing barrels, e.g. `export * from './dialog.js';`).

- [ ] **Step 3: Typecheck + build**

```bash
pnpm --filter frontend typecheck
pnpm --filter frontend build
```
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/shared/ui/ apps/frontend/package.json apps/frontend/pnpm-lock.yaml
git commit -m "chore(frontend): add shadcn dialog/dropdown-menu/select/tabs primitives"
```

(Note: `pnpm-lock.yaml` will only change if Radix deps were newly installed.)

---

## Task 8: Frontend — entities/organisation slice

**Files:**
- Create: `apps/frontend/src/entities/organisation/api/organisation.api.ts`
- Create: `apps/frontend/src/entities/organisation/model/organisation.queries.ts`
- Create: `apps/frontend/src/entities/organisation/lib/buildTree.ts`
- Create: `apps/frontend/src/entities/organisation/lib/displayName.ts`
- Create: `apps/frontend/src/entities/organisation/index.ts`
- Test: `apps/frontend/src/entities/organisation/lib/buildTree.test.ts`
- Test: `apps/frontend/src/entities/organisation/lib/displayName.test.ts`

- [ ] **Step 1: API fetchers**

`apps/frontend/src/entities/organisation/api/organisation.api.ts`:
```ts
import {
  ListOrganisationsResponseSchema,
  OrganisationSchema,
  type CreateOrganisationInput,
  type ListOrganisationsQuery,
  type ListOrganisationsResponse,
  type Organisation,
  type UpdateOrganisationInput,
} from '@repo/contracts/organisations';
import { OrganisationsRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api/httpClient';

export async function listOrganisations(query: ListOrganisationsQuery = {}): Promise<ListOrganisationsResponse> {
  const raw = await httpClient(OrganisationsRoutes.base, {
    query: {
      type: query.type,
      country: query.country,
      parentId: query.parentId ?? undefined,
      q: query.q,
    },
  });
  return ListOrganisationsResponseSchema.parse(raw);
}

export async function getOrganisation(id: string): Promise<Organisation> {
  const raw = await httpClient(OrganisationsRoutes.byId(id));
  return OrganisationSchema.parse(raw);
}

export async function createOrganisation(input: CreateOrganisationInput): Promise<Organisation> {
  const raw = await httpClient(OrganisationsRoutes.base, { method: 'POST', body: input });
  return OrganisationSchema.parse(raw);
}

export async function updateOrganisation(id: string, input: UpdateOrganisationInput): Promise<Organisation> {
  const raw = await httpClient(OrganisationsRoutes.byId(id), { method: 'PATCH', body: input });
  return OrganisationSchema.parse(raw);
}

export async function deleteOrganisation(id: string): Promise<void> {
  await httpClient(OrganisationsRoutes.byId(id), { method: 'DELETE' });
}
```

- [ ] **Step 2: Query options + mutation hooks**

`apps/frontend/src/entities/organisation/model/organisation.queries.ts`:
```ts
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import type {
  CreateOrganisationInput,
  ListOrganisationsQuery,
  Organisation,
  UpdateOrganisationInput,
} from '@repo/contracts/organisations';

import {
  createOrganisation,
  deleteOrganisation,
  getOrganisation,
  listOrganisations,
  updateOrganisation,
} from '../api/organisation.api.js';

export const organisationKeys = {
  all: ['organisations'] as const,
  lists: () => [...organisationKeys.all, 'list'] as const,
  list: (query: ListOrganisationsQuery) => [...organisationKeys.lists(), query] as const,
  details: () => [...organisationKeys.all, 'detail'] as const,
  detail: (id: string) => [...organisationKeys.details(), id] as const,
};

export function listOrganisationsQueryOptions(query: ListOrganisationsQuery = {}) {
  return queryOptions({
    queryKey: organisationKeys.list(query),
    queryFn: () => listOrganisations(query),
  });
}

export function organisationQueryOptions(id: string) {
  return queryOptions({
    queryKey: organisationKeys.detail(id),
    queryFn: () => getOrganisation(id),
    enabled: Boolean(id),
  });
}

export function useCreateOrganisation(
  options?: Omit<UseMutationOptions<Organisation, Error, CreateOrganisationInput>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrganisation,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: organisationKeys.lists() });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export interface UpdateOrganisationVariables {
  id: string;
  input: UpdateOrganisationInput;
}

export function useUpdateOrganisation(
  options?: Omit<UseMutationOptions<Organisation, Error, UpdateOrganisationVariables>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: UpdateOrganisationVariables) => updateOrganisation(id, input),
    onSuccess: (data, vars, ...rest) => {
      void queryClient.invalidateQueries({ queryKey: organisationKeys.detail(vars.id) });
      void queryClient.invalidateQueries({ queryKey: organisationKeys.lists() });
      options?.onSuccess?.(data, vars, ...rest);
    },
    ...options,
  });
}

export function useDeleteOrganisation(
  options?: Omit<UseMutationOptions<void, Error, string>, 'mutationFn'>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOrganisation(id),
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: organisationKeys.all });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}
```

- [ ] **Step 3: `buildTree` utility — failing test first**

`apps/frontend/src/entities/organisation/lib/buildTree.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { buildTree, type OrganisationNode } from './buildTree.js';
import type { Organisation } from '@repo/contracts/organisations';

const ROW = (id: string, parentId: string | null, nameEn: string): Organisation => ({
  id, parentId, type: 'club' as const, shortCode: id.toUpperCase(), slug: null,
  country: 'SWE', nameEn, nameSv: nameEn, nameFi: nameEn, nameJa: null,
  logoUrl: null, address: null, contactEmail: null, headInstructorId: null,
  createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
});

describe('buildTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('nests children under parents', () => {
    const tree = buildTree([ROW('a', null, 'Root'), ROW('b', 'a', 'Child'), ROW('c', 'b', 'Grandchild')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('b');
    expect(tree[0].children[0].children[0].id).toBe('c');
  });

  it('treats orphans (missing parent) as roots', () => {
    const tree = buildTree([ROW('b', 'missing', 'Orphan')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('b');
  });

  it('supports multiple roots', () => {
    const tree = buildTree([ROW('a', null, 'A'), ROW('b', null, 'B')]);
    expect(tree).toHaveLength(2);
  });

  it('children inherit type from buildTree<OrganisationNode>', () => {
    const tree: OrganisationNode[] = buildTree([ROW('a', null, 'A')]);
    expect(tree[0].children).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm --filter frontend test src/entities/organisation/lib/buildTree.test.ts --run
```
Expected: FAIL (no buildTree).

- [ ] **Step 5: Implement `buildTree`**

`apps/frontend/src/entities/organisation/lib/buildTree.ts`:
```ts
import type { Organisation } from '@repo/contracts/organisations';

export interface OrganisationNode extends Organisation {
  children: OrganisationNode[];
}

/**
 * Convert a flat list to a forest. Orphans (rows whose parentId is not in the
 * list) are surfaced as additional roots so a broken DB state remains visible
 * to the sysadmin instead of being silently hidden.
 */
export function buildTree(rows: readonly Organisation[]): OrganisationNode[] {
  const byId = new Map<string, OrganisationNode>();
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [] });
  }
  const roots: OrganisationNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
```

- [ ] **Step 6: Run test, confirm green**

```bash
pnpm --filter frontend test src/entities/organisation/lib/buildTree.test.ts --run
```
Expected: PASS.

- [ ] **Step 7: `displayName` utility + test**

`apps/frontend/src/entities/organisation/lib/displayName.ts`:
```ts
import type { Organisation } from '@repo/contracts/organisations';

type Locale = 'en' | 'sv' | 'fi' | 'ja';

/** Pick the localized name with a deterministic fallback to English. */
export function displayName(org: Organisation, locale: Locale | string): string {
  const lookup: Record<Locale, string | null> = {
    en: org.nameEn,
    sv: org.nameSv,
    fi: org.nameFi,
    ja: org.nameJa,
  };
  const lang = (locale.split('-')[0] ?? 'en') as Locale;
  return lookup[lang] && lookup[lang]!.length > 0 ? lookup[lang]! : org.nameEn;
}
```

`displayName.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { displayName } from './displayName.js';

const ORG = {
  id: 'x', parentId: null, type: 'club' as const, shortCode: 'X', slug: null, country: 'SWE',
  nameEn: 'Stockholm', nameSv: 'Stockholm SE', nameFi: 'Tukholma', nameJa: 'ストックホルム',
  logoUrl: null, address: null, contactEmail: null, headInstructorId: null,
  createdAt: '', updatedAt: '',
};

describe('displayName', () => {
  it('returns the locale-matching name', () => {
    expect(displayName(ORG, 'sv')).toBe('Stockholm SE');
    expect(displayName(ORG, 'fi')).toBe('Tukholma');
    expect(displayName(ORG, 'ja')).toBe('ストックホルム');
  });

  it('falls back to English for unknown locale', () => {
    expect(displayName(ORG, 'de')).toBe('Stockholm');
  });

  it('falls back to English when locale-specific value is null/empty', () => {
    expect(displayName({ ...ORG, nameJa: null }, 'ja')).toBe('Stockholm');
  });
});
```

- [ ] **Step 8: Barrel**

`apps/frontend/src/entities/organisation/index.ts`:
```ts
export type {
  CreateOrganisationInput,
  ListOrganisationsQuery,
  ListOrganisationsResponse,
  Organisation,
  OrganisationType,
  UpdateOrganisationInput,
} from '@repo/contracts/organisations';

export {
  createOrganisation,
  deleteOrganisation,
  getOrganisation,
  listOrganisations,
  updateOrganisation,
} from './api/organisation.api.js';

export {
  listOrganisationsQueryOptions,
  organisationKeys,
  organisationQueryOptions,
  useCreateOrganisation,
  useDeleteOrganisation,
  useUpdateOrganisation,
  type UpdateOrganisationVariables,
} from './model/organisation.queries.js';

export { buildTree, type OrganisationNode } from './lib/buildTree.js';
export { displayName } from './lib/displayName.js';
```

- [ ] **Step 9: Run tests + typecheck**

```bash
pnpm --filter frontend test src/entities/organisation --run
pnpm --filter frontend typecheck
```

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/entities/organisation/
git commit -m "feat(frontend): entities/organisation slice"
```

---

## Task 9: Frontend — organisation-form feature

**Files:**
- Create: `apps/frontend/src/features/organisation-form/ui/OrganisationForm.tsx`
- Create: `apps/frontend/src/features/organisation-form/index.ts`
- Test: `apps/frontend/src/features/organisation-form/ui/OrganisationForm.test.tsx`

- [ ] **Step 1: Build the form**

`apps/frontend/src/features/organisation-form/ui/OrganisationForm.tsx`:

The form is a single React component using `react-hook-form` + Zod (`zodResolver`). It accepts:
```ts
interface OrganisationFormProps {
  mode: 'create' | 'edit';
  initialValues?: Partial<CreateOrganisationInput>;
  parentCandidates: Organisation[];      // pre-filtered to legal parents for the chosen type
  onSubmit: (values: CreateOrganisationInput | UpdateOrganisationInput) => Promise<void>;
  submitting?: boolean;
}
```

Render structure:
- Header (selectable Type — disabled in edit mode)
- `<Tabs>` with one tab per locale: `En` / `Sv` / `Fi` / `Ja`, each tab contains a single `<Input>` for the corresponding `name_<locale>` field.
- Top-level fields: shortCode, slug, country (`<Select>` populated from `ISO_3166_ALPHA3_CODES`), parent (`<Select>` populated from `parentCandidates`), contactEmail, logoUrl, address.
- Submit button uses `t('common.save')` / `t('common.create')`.

Validation: derive the form schema from `CreateOrganisationSchema` / `UpdateOrganisationSchema` (`@repo/contracts/organisations`) so client validation matches the server. Use `zodResolver(schema)` from `@hookform/resolvers/zod`.

- [ ] **Step 2: Tests**

`OrganisationForm.test.tsx` should at minimum:
- Render in `create` mode with no initial values; submit without required fields → see Zod error messages on `nameEn`, `nameSv`, `nameFi`, `country`, `shortCode`.
- Render in `edit` mode with `initialValues`; the Type select is disabled.
- Submitting with valid values calls `onSubmit` with the right payload shape.

i18n setup for the test: import the real `i18n` instance and call `await i18n.changeLanguage('en')` in `beforeEach` (this is what `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.test.tsx` does — copy that pattern verbatim). Wrap rendered output in `<I18nextProvider i18n={i18n}>` if `useTranslation` complains about missing context. Do NOT mock `useTranslation` — translated strings are part of what we're asserting on.

- [ ] **Step 3: Barrel**

`apps/frontend/src/features/organisation-form/index.ts`:
```ts
export { OrganisationForm } from './ui/OrganisationForm.js';
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter frontend test src/features/organisation-form --run
pnpm --filter frontend typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/organisation-form/
git commit -m "feat(frontend): organisation-form (create/edit)"
```

---

## Task 10: Frontend — move + delete dialogs

**Files:**
- Create: `apps/frontend/src/features/organisation-move-dialog/ui/OrganisationMoveDialog.tsx`
- Create: `apps/frontend/src/features/organisation-move-dialog/index.ts`
- Create: `apps/frontend/src/features/organisation-delete-dialog/ui/OrganisationDeleteDialog.tsx`
- Create: `apps/frontend/src/features/organisation-delete-dialog/index.ts`
- Tests next to each `.tsx`.

- [ ] **Step 1: Move dialog**

`OrganisationMoveDialog.tsx`. Props:
```ts
interface OrganisationMoveDialogProps {
  organisation: Organisation;          // the node being moved
  candidates: Organisation[];          // pre-filtered legal parents (excluding self and descendants)
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (parentId: string | null) => Promise<void>;
}
```
- Wraps shadcn `<Dialog>`.
- Body: `<Select>` for the new parent, including a "None (top-level IF)" option only when `organisation.type === 'international_federation'`.
- Confirm button disabled while submitting.

Helper used in the page layer (NOT inside the dialog) to compute `candidates`:
```ts
// In the parent layer:
import { buildTree, type OrganisationNode } from '@/entities/organisation';

function descendantIds(node: OrganisationNode): Set<string> {
  const set = new Set<string>([node.id]);
  for (const child of node.children) for (const id of descendantIds(child)) set.add(id);
  return set;
}
```

Then `candidates = allOrgs.filter(o => !descendantIds(node).has(o.id) && legalParent(org.type, o.type))`.

- [ ] **Step 2: Delete dialog**

`OrganisationDeleteDialog.tsx`. Props:
```ts
interface OrganisationDeleteDialogProps {
  organisation: Organisation;
  childCount: number;       // computed from the tree
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}
```
- Confirmation copy uses `t('admin.organisations.confirm.delete', { name })`.
- When `childCount > 0`, swap the confirm button for a disabled note `t('admin.organisations.errors.hasChildren', { count: childCount })`.

- [ ] **Step 3: Tests**

- Move dialog: invoking confirm calls `onConfirm` with the selected parent; non-legal parents are absent from the Select options (caller's responsibility — verify the dialog renders only the candidates passed in).
- Delete dialog: with `childCount > 0` the confirm button is disabled and the hasChildren message is shown; with `childCount === 0` confirm triggers `onConfirm`.

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm --filter frontend test src/features/organisation-move-dialog src/features/organisation-delete-dialog --run
pnpm --filter frontend typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/organisation-move-dialog/ apps/frontend/src/features/organisation-delete-dialog/
git commit -m "feat(frontend): organisation move + delete dialogs"
```

---

## Task 11: Frontend — organisation-tree widget

**Files:**
- Create: `apps/frontend/src/widgets/organisation-tree/ui/OrganisationTree.tsx`
- Create: `apps/frontend/src/widgets/organisation-tree/index.ts`
- Test: `apps/frontend/src/widgets/organisation-tree/ui/OrganisationTree.test.tsx`

- [ ] **Step 1: Build the widget**

Props:
```ts
interface OrganisationTreeProps {
  nodes: OrganisationNode[];
  onEdit: (org: Organisation) => void;
  onMove: (org: Organisation) => void;
  onDelete: (org: Organisation) => void;
}
```

Render:
- Recursive `<TreeRow>` (helper component inside the same file). Each row:
  - Expand/collapse chevron when the node has children (local `useState` per row, default expanded).
  - Indentation by `depth * 1.25rem`.
  - Localized display name from `displayName(node, i18n.language)`.
  - Type/country badge.
  - Right-side `<DropdownMenu>` with Edit / Move / Delete items invoking the respective callbacks.
  - Children rendered recursively at `depth + 1`.

- [ ] **Step 2: Tests**

- Renders all nodes (root + descendants visible after expand).
- Clicking the chevron toggles visibility of children.
- Clicking dropdown items invokes the right callback with the right `Organisation`.

- [ ] **Step 3: Run tests + typecheck**

```bash
pnpm --filter frontend test src/widgets/organisation-tree --run
pnpm --filter frontend typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/widgets/organisation-tree/
git commit -m "feat(frontend): organisation-tree widget"
```

---

## Task 12: Frontend — admin-organisations page + route

**Files:**
- Create: `apps/frontend/src/pages/admin-organisations/ui/AdminOrganisationsPage.tsx`
- Create: `apps/frontend/src/pages/admin-organisations/ui/AdminOrganisationsPage.stories.tsx`
- Create: `apps/frontend/src/pages/admin-organisations/index.ts`
- Create: `apps/frontend/src/app/router/routes/_app.admin.organisations.tsx`

- [ ] **Step 1: Page**

`AdminOrganisationsPage.tsx`:
- Calls `useQuery(listOrganisationsQueryOptions())` to fetch the flat list.
- Memoizes `buildTree(data?.data ?? [])`.
- Local state machine: `mode = 'idle' | { kind: 'create' } | { kind: 'edit', org: Organisation } | { kind: 'move', org: Organisation } | { kind: 'delete', org: Organisation }`.
- Page header has `<h1>` (`t('admin.organisations.title')`) and `t('admin.organisations.newOrganisation')` button → sets mode to create.
- Renders `<OrganisationTree>` with `onEdit/onMove/onDelete` callbacks setting the mode.
- Renders the three feature dialogs/modals (create/edit form inside its own `<Dialog>`), each driven by `mode`.
- On mutation success: clear mode, query is invalidated by the mutation hook.

- [ ] **Step 2: Storybook stub**

Mirror `PostsPage.stories.tsx`:
```ts
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AdminOrganisationsPage } from './AdminOrganisationsPage.js';
const meta = { title: 'Pages/AdminOrganisations', component: AdminOrganisationsPage, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof AdminOrganisationsPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
```

- [ ] **Step 3: Route file**

`apps/frontend/src/app/router/routes/_app.admin.organisations.tsx`:
```ts
import { createRoute, redirect } from '@tanstack/react-router';

import { authClient } from '@/features/auth-by-email';
import { AdminOrganisationsPage } from '@/pages/admin-organisations';

import { appLayoutRoute } from './_app.js';

export const adminOrganisationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/organisations',
  beforeLoad: async () => {
    try {
      const result = await authClient.getSession();
      const role = result.data?.user.role;
      if (role !== 'admin') {
        throw redirect({ to: '/dashboard' });
      }
    } catch (err) {
      // Re-throw redirects; swallow network errors and treat as no access.
      if (err && typeof err === 'object' && 'options' in err) throw err;
      throw redirect({ to: '/login' });
    }
  },
  component: AdminOrganisationsPage,
});

export const Route = adminOrganisationsRoute;
```

(The TanStack Router file-based plugin auto-discovers this — no aggregator file to update.)

- [ ] **Step 4: Verify routeTree.gen.ts regenerates**

Run the dev server briefly:
```bash
pnpm --filter frontend dev &
# wait until the plugin announces it regenerated routeTree.gen.ts, then kill it
```
Expected: `routeTree.gen.ts` now contains a line for `_app.admin.organisations`.

- [ ] **Step 5: Run typecheck + build**

```bash
pnpm --filter frontend typecheck
pnpm --filter frontend build
```

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/admin-organisations/ apps/frontend/src/app/router/routes/_app.admin.organisations.tsx apps/frontend/src/app/router/routeTree.gen.ts
git commit -m "feat(frontend): admin organisations page + route"
```

---

## Task 13: AppSidebar admin group + i18n + final verification

**Files:**
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`
- Modify: `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.test.tsx`
- Modify: `apps/frontend/src/i18n/locales/{en,sv,fi}.json`

- [ ] **Step 1: i18n keys**

Add to all three locale files under a new `admin` namespace. English:
```json
"admin": {
  "title": "Admin",
  "organisations": {
    "title": "Organisations",
    "newOrganisation": "New organisation",
    "actions": { "edit": "Edit", "move": "Move…", "delete": "Delete" },
    "types": {
      "internationalFederation": "International federation",
      "nationalFederation": "National federation",
      "club": "Club"
    },
    "fields": {
      "shortCode": "Short code",
      "slug": "Slug",
      "country": "Country",
      "nameEn": "Name (English)",
      "nameSv": "Name (Swedish)",
      "nameFi": "Name (Finnish)",
      "nameJa": "Name (Japanese)",
      "address": "Address",
      "contactEmail": "Contact email",
      "logoUrl": "Logo URL",
      "headInstructor": "Head instructor",
      "parent": "Parent"
    },
    "confirm": { "delete": "Delete \"{{name}}\"? This cannot be undone." },
    "errors": {
      "hasChildren": "This organisation still has {{count}} child(ren). Reparent or delete them first.",
      "invalidParent": "That parent isn't allowed for this type.",
      "cycle": "Move would create a cycle."
    }
  }
}
```
Add equivalent Swedish + Finnish translations (use the same key shape; ask the user for translation review only if uncertain — sensible Google-Translate-quality translations are acceptable as a first pass and easy to correct later).

Also add to `nav`:
- en: `"adminOrganisations": "Organisations"`
- sv: `"adminOrganisations": "Organisationer"`
- fi: `"adminOrganisations": "Organisaatiot"`

- [ ] **Step 2: AppSidebar admin group**

Modify `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.tsx`:
- Add the `Building2` icon import from `lucide-react`.
- Use `useAbility()` from `@/shared/lib/casl/ability-context` to read `ability.can('manage', 'Organisation')`.
- Below the existing main `<SidebarGroup>`, add a conditional `<SidebarGroup>`:
```tsx
{ability.can('manage', 'Organisation') ? (
  <SidebarGroup>
    <SidebarGroupLabel>{t('admin.title')}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname.startsWith('/admin/organisations')}>
            <Link to="/admin/organisations">
              <Building2 />
              <span>{t('nav.adminOrganisations')}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
) : null}
```

- [ ] **Step 3: Update AppSidebar tests**

Modify `apps/frontend/src/widgets/appsidebar/ui/AppSidebar.test.tsx`:
- Add a new test that, with a session whose user has `role: 'admin'`, the "Organisations" admin link is rendered.
- Add a test that, with `role: 'user'`, the "Organisations" admin link is NOT rendered.
- (If the existing test file does not mock `useAbility`, wrap `<AppSidebar>` in the real `AbilityProvider` instead and seed it with the appropriate ability.)

- [ ] **Step 4: Run the whole frontend test + typecheck + build**

```bash
pnpm --filter frontend test --run
pnpm --filter frontend typecheck
pnpm --filter frontend build
```
Expected: all green.

- [ ] **Step 5: Run the whole backend test + typecheck**

```bash
pnpm --filter backend test
pnpm --filter backend typecheck
```

- [ ] **Step 6: Manual smoke test**

In two shells:
```bash
pnpm --filter backend dev
pnpm --filter frontend dev
```

In the browser:
1. Sign in as the seeded sysadmin (admin role).
2. Confirm "Admin → Organisations" appears in the sidebar.
3. Click it → land on `/admin/organisations`, empty tree.
4. "New organisation" → create an IF (e.g. `WTF`, country `JPN`).
5. Create a child NF (e.g. `STF`, country `SWE`, parent `WTF`).
6. Create a club under the NF.
7. Use the row dropdown → Move the club to a different NF (or create a second NF first).
8. Try to delete the NF that still has the club → see the hasChildren conflict UI.
9. Delete the club, then delete the NF.
10. Sign out, sign in as a non-admin user → confirm "Admin" group is absent.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/widgets/appsidebar/ apps/frontend/src/i18n/
git commit -m "feat(frontend): admin sidebar group + organisations i18n"
```

---

## Done

All 13 tasks complete. Open a PR titled `feat: organisations admin (sysadmin CRUD + tree)`. Reference `docs/superpowers/specs/2026-05-15-organisations-admin-design.md` and `docs/followups.md` in the description.
