/**
 * Idempotent seeder for shogo titles (honorary belt overlays).
 *
 * Resolves by `code` — the natural primary key. Inserts when absent, updates
 * when present. Rows it did not author are left untouched.
 *
 * `minRankId` is honored verbatim from the fixture (typically `null` since
 * Phase 3.5 — see migration 0024 which dropped NOT NULL on the column).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { type DrizzleDb } from '../client.js';
import { shogoTitles, type DbNewShogoTitle } from '../schema/index.js';

interface SeedShogoTitle {
  code: string;
  nameEn: string;
  nameSv: string;
  nameFi: string;
  nameJa: string;
  minRankId: string | null;
  sortOrder: number;
}

interface ShogoTitlesSeedJson {
  shogoTitles: SeedShogoTitle[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, 'shogo-titles.seed.json');

export interface ShogoTitlesSeedResult {
  inserted: number;
  updated: number;
}

export async function seedShogoTitles(db: DrizzleDb): Promise<ShogoTitlesSeedResult> {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as ShogoTitlesSeedJson;
  const result: ShogoTitlesSeedResult = { inserted: 0, updated: 0 };

  for (const shogo of fixture.shogoTitles) {
    const values: DbNewShogoTitle = {
      code: shogo.code,
      nameEn: shogo.nameEn,
      nameSv: shogo.nameSv,
      nameFi: shogo.nameFi,
      nameJa: shogo.nameJa,
      minRankId: shogo.minRankId,
      sortOrder: shogo.sortOrder,
    };

    const existing = (
      await db.select({ code: shogoTitles.code }).from(shogoTitles).where(eq(shogoTitles.code, shogo.code)).limit(1)
    )[0];

    if (existing) {
      await db.update(shogoTitles).set(values).where(eq(shogoTitles.code, shogo.code));
      result.updated += 1;
    } else {
      await db.insert(shogoTitles).values(values);
      result.inserted += 1;
    }
  }

  return result;
}
