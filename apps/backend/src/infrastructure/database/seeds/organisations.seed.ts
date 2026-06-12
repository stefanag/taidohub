/**
 * Idempotent seeder for the organisation hierarchy (federation/club tree).
 *
 * Resolves by `id` — every fixture row carries a stable UUID, so inserts
 * become updates on re-run. Rows it did not author are left untouched.
 *
 * Insert order is a topological walk of `parent_id`: parents before children.
 * This keeps the `parent_id → organisations.id` FK happy on first run.
 *
 * Exposed as a pure function so `seed.ts` can compose it alongside
 * `seedSysadmin`.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { type DrizzleDb } from '../client.js';
import { organisations, type DbNewOrganisation } from '../schema/index.js';

interface SeedOrganisation {
  id: string;
  parentId: string | null;
  type: 'international_federation' | 'national_federation' | 'club';
  shortCode: string;
  country: string | null;
  nameEn: string;
  nameSv: string;
  nameFi: string;
  nameJa: string | null;
  logoUrl: string | null;
  address: string | null;
  contactEmail: string | null;
  headInstructorId: string | null;
  slug: string | null;
}

interface OrganisationsSeedJson {
  organisations: SeedOrganisation[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, 'organisations.seed.json');

export interface OrganisationsSeedResult {
  inserted: number;
  updated: number;
}

function topoSort(rows: readonly SeedOrganisation[]): SeedOrganisation[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const visited = new Set<string>();
  const sorted: SeedOrganisation[] = [];

  function visit(row: SeedOrganisation): void {
    if (visited.has(row.id)) return;
    if (row.parentId) {
      const parent = byId.get(row.parentId);
      if (parent) visit(parent);
    }
    visited.add(row.id);
    sorted.push(row);
  }

  for (const row of rows) visit(row);
  return sorted;
}

export async function seedOrganisations(db: DrizzleDb): Promise<OrganisationsSeedResult> {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as OrganisationsSeedJson;
  const result: OrganisationsSeedResult = { inserted: 0, updated: 0 };

  for (const org of topoSort(fixture.organisations)) {
    const values: DbNewOrganisation = {
      id: org.id,
      parentId: org.parentId,
      type: org.type,
      shortCode: org.shortCode,
      country: org.country,
      nameEn: org.nameEn,
      nameSv: org.nameSv,
      nameFi: org.nameFi,
      nameJa: org.nameJa,
      logoUrl: org.logoUrl,
      address: org.address,
      contactEmail: org.contactEmail,
      headInstructorId: org.headInstructorId,
      slug: org.slug,
    };

    const existing = (
      await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.id, org.id)).limit(1)
    )[0];

    if (existing) {
      await db
        .update(organisations)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(organisations.id, org.id));
      result.updated += 1;
    } else {
      await db.insert(organisations).values(values);
      result.inserted += 1;
    }
  }

  return result;
}
