/**
 * Idempotent seeder for the belt catalog (systems + ranks + shogo titles).
 *
 * Resolves natural keys:
 * - `belt_systems` by (organisation_id, code) — `organisation_id` honored
 *   from the fixture (null = global, uuid = org-scoped).
 * - `belt_ranks` by (organisation_id, system_id, level), with `system_id`
 *   looked up from the system's code scoped to the same organisation_id.
 * - `shogo_titles` by `code`. `min_rank_id` is honored verbatim from the
 *   fixture (nullable since migration 0024).
 *
 * Inserts when absent, updates the listed columns when present. Rows it did
 * not author are left untouched.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq, isNull, type SQL } from 'drizzle-orm';

import { type DrizzleDb } from '../client.js';
import {
  beltRanks,
  beltSystems,
  shogoTitles,
} from '../schema/index.js';

interface SeedSystem {
  id?: string;
  organisationId?: string | null;
  code: string;
  nameEn: string;
  nameSv: string;
  nameFi: string;
  sortOrder: number;
}

interface SeedRank {
  id: string;
  organisationId?: string | null;
  systemCode: string;
  level: number;
  sortOrder: number;
  nameRomaji: string;
  nameJa?: string | null;
  nameEn: string;
  nameSv: string;
  nameFi: string;
  beltColor: string;
  imageUrl?: string | null;
  descriptionEn?: string | null;
  descriptionSv?: string | null;
  descriptionFi?: string | null;
  publiclyVisible: boolean;
  slug?: string | null;
}

interface SeedShogo {
  code: string;
  nameEn: string;
  nameSv: string;
  nameFi: string;
  nameJa: string;
  minRankId: string | null;
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

function orgScopeOnSystem(orgId: string | null | undefined): SQL {
  return orgId == null ? isNull(beltSystems.organisationId) : eq(beltSystems.organisationId, orgId);
}

function orgScopeOnRank(orgId: string | null | undefined): SQL {
  return orgId == null ? isNull(beltRanks.organisationId) : eq(beltRanks.organisationId, orgId);
}

export async function seedBeltCatalog(db: DrizzleDb): Promise<BeltCatalogSeedResult> {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as BeltCatalogSeedJson;

  const result: BeltCatalogSeedResult = {
    systems: { inserted: 0, updated: 0 },
    ranks: { inserted: 0, updated: 0 },
    shogos: { inserted: 0, updated: 0 },
  };

  // ---- systems (resolved by (organisation_id, code)) ----
  for (const sys of fixture.beltSystems) {
    const orgId = sys.organisationId ?? null;
    const existing = (
      await db
        .select({ id: beltSystems.id })
        .from(beltSystems)
        .where(and(orgScopeOnSystem(orgId), eq(beltSystems.code, sys.code)))
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
        id: sys.id,
        code: sys.code,
        nameEn: sys.nameEn,
        nameSv: sys.nameSv,
        nameFi: sys.nameFi,
        organisationId: orgId,
        sortOrder: sys.sortOrder,
      });
      result.systems.inserted += 1;
    }
  }

  // ---- ranks (system_id resolved within the same organisation scope) ----
  for (const rank of fixture.beltRanks) {
    const orgId = rank.organisationId ?? null;
    const system = (
      await db
        .select({ id: beltSystems.id })
        .from(beltSystems)
        .where(and(orgScopeOnSystem(orgId), eq(beltSystems.code, rank.systemCode)))
        .limit(1)
    )[0];
    if (!system) {
      throw new Error(
        `Seed error: belt system "${rank.systemCode}" not found in org ${orgId ?? 'GLOBAL'} for rank "${rank.nameRomaji}".`,
      );
    }
    const existing = (
      await db
        .select({ id: beltRanks.id })
        .from(beltRanks)
        .where(
          and(
            orgScopeOnRank(orgId),
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
          nameJa: rank.nameJa ?? null,
          nameEn: rank.nameEn,
          nameSv: rank.nameSv,
          nameFi: rank.nameFi,
          beltColor: rank.beltColor,
          imageUrl: rank.imageUrl ?? null,
          descriptionEn: rank.descriptionEn ?? null,
          descriptionSv: rank.descriptionSv ?? null,
          descriptionFi: rank.descriptionFi ?? null,
          publiclyVisible: rank.publiclyVisible,
          slug: rank.slug ?? null,
          updatedAt: new Date(),
        })
        .where(eq(beltRanks.id, existing.id));
      result.ranks.updated += 1;
    } else {
      await db.insert(beltRanks).values({
        id: rank.id,
        organisationId: orgId,
        systemId: system.id,
        level: rank.level,
        sortOrder: rank.sortOrder,
        nameRomaji: rank.nameRomaji,
        nameJa: rank.nameJa ?? null,
        nameEn: rank.nameEn,
        nameSv: rank.nameSv,
        nameFi: rank.nameFi,
        beltColor: rank.beltColor,
        imageUrl: rank.imageUrl ?? null,
        descriptionEn: rank.descriptionEn ?? null,
        descriptionSv: rank.descriptionSv ?? null,
        descriptionFi: rank.descriptionFi ?? null,
        publiclyVisible: rank.publiclyVisible,
        slug: rank.slug ?? null,
      });
      result.ranks.inserted += 1;
    }
  }

  // ---- shogo titles (resolved by `code`) ----
  for (const shogo of fixture.shogoTitles) {
    const existing = (
      await db.select({ code: shogoTitles.code }).from(shogoTitles).where(eq(shogoTitles.code, shogo.code)).limit(1)
    )[0];
    if (existing) {
      await db
        .update(shogoTitles)
        .set({
          nameEn: shogo.nameEn,
          nameSv: shogo.nameSv,
          nameFi: shogo.nameFi,
          nameJa: shogo.nameJa,
          minRankId: shogo.minRankId,
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
        minRankId: shogo.minRankId,
        sortOrder: shogo.sortOrder,
      });
      result.shogos.inserted += 1;
    }
  }

  return result;
}
