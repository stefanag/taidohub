/**
 * Idempotent seeder for techniques + their classification edges.
 *
 * Resolves by `id` — every fixture row carries a stable UUID, so inserts
 * become updates on re-run. Classification edges in `technique_classification`
 * are REPLACED per technique on each run: delete-all-then-insert keeps the
 * join in sync with the fixture without leaving stale edges behind.
 *
 * Depends on `seedClassifications` having already run — the lookup
 * `${rootCode}:${code} → uuid` is built from the live `classification_category`
 * table at the start of the seed.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { type DrizzleDb } from '../client.js';
import {
  classificationCategory,
  technique,
  techniqueClassification,
} from '../schema/index.js';

interface SeedTechnique {
  id: string;
  createdByOrganisationId: string | null;
  /** technique_type code (required). */
  type: string;
  isKihon: boolean;
  isActive: boolean;
  sortOrder: number;
  minRankId: string | null;
  nameJa: string;
  nameRomaji: string;
  nameSv: string;
  nameEn: string;
  nameFi: string;
  /** sotai_category code, or null when the technique has no sotai dimension. */
  sotaiCategory: string | null;
  /** attack_type code, or null when the technique has no attack dimension. */
  attackType: string | null;
  descriptionSv: string;
  descriptionEn: string;
  descriptionFi: string;
}

interface TechniquesSeedJson {
  techniques: SeedTechnique[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolvePath(HERE, 'techniques.seed.json');

export interface TechniquesSeedResult {
  techniques: { inserted: number; updated: number };
  edges: { inserted: number };
}

export async function seedTechniques(db: DrizzleDb): Promise<TechniquesSeedResult> {
  const raw = readFileSync(FIXTURE_PATH, 'utf8').replace(/^ /, '');
  const fixture = JSON.parse(raw) as TechniquesSeedJson;

  // Build `${rootCode}:${code} → uuid` lookup against the live taxonomy.
  // Roots have `parent_id IS NULL`; a child's root code is the code of the
  // row its parent_id points at.
  const allCategories = await db
    .select({
      id: classificationCategory.id,
      parentId: classificationCategory.parentId,
      code: classificationCategory.code,
    })
    .from(classificationCategory);

  const rootCodeById = new Map<string, string>();
  for (const c of allCategories) {
    if (c.parentId === null) rootCodeById.set(c.id, c.code);
  }
  const lookup = new Map<string, string>();
  for (const c of allCategories) {
    if (c.parentId === null) continue;
    const rootCode = rootCodeById.get(c.parentId);
    if (!rootCode) continue;
    lookup.set(`${rootCode}:${c.code}`, c.id);
  }

  function resolveCategoryId(rootCode: string, code: string): string {
    const id = lookup.get(`${rootCode}:${code}`);
    if (!id) {
      throw new Error(
        `Seed error: no classification_category for ${rootCode}:${code}. ` +
          `Run seedClassifications before seedTechniques.`,
      );
    }
    return id;
  }

  const result: TechniquesSeedResult = {
    techniques: { inserted: 0, updated: 0 },
    edges: { inserted: 0 },
  };

  for (const t of fixture.techniques) {
    const edges: string[] = [resolveCategoryId('technique_type', t.type)];
    if (t.sotaiCategory) edges.push(resolveCategoryId('sotai_category', t.sotaiCategory));
    if (t.attackType) edges.push(resolveCategoryId('attack_type', t.attackType));

    const values = {
      id: t.id,
      createdByOrganisationId: t.createdByOrganisationId,
      isKihon: t.isKihon,
      isActive: t.isActive,
      sortOrder: t.sortOrder,
      minRankId: t.minRankId,
      nameJa: t.nameJa,
      nameRomaji: t.nameRomaji,
      nameSv: t.nameSv,
      nameEn: t.nameEn,
      nameFi: t.nameFi,
      descriptionSv: t.descriptionSv,
      descriptionEn: t.descriptionEn,
      descriptionFi: t.descriptionFi,
    } as const;

    const existing = (
      await db
        .select({ id: technique.id })
        .from(technique)
        .where(eq(technique.id, t.id))
        .limit(1)
    )[0];

    if (existing) {
      await db
        .update(technique)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(technique.id, t.id));
      result.techniques.updated += 1;
    } else {
      await db.insert(technique).values(values);
      result.techniques.inserted += 1;
    }

    // REPLACE edges: delete-all-for-technique then insert the fixture set.
    // Keeps the join in sync without orphaning edges from removed dimensions.
    await db
      .delete(techniqueClassification)
      .where(eq(techniqueClassification.techniqueId, t.id));
    for (const [i, edgeId] of edges.entries()) {
      await db.insert(techniqueClassification).values({
        techniqueId: t.id,
        classificationCategoryId: edgeId,
        sortOrder: i,
      });
      result.edges.inserted += 1;
    }
  }

  return result;
}
