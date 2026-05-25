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
