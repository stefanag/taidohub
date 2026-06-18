/**
 * Idempotent seeder for patterns + their classification edges.
 *
 * Mirrors `techniques.seed.ts` exactly — patterns and techniques share the
 * same classification-edge model, so the (rootCode, code) -> uuid lookup
 * and the DELETE-then-INSERT edge replacement work identically. The two
 * delta points vs the technique seeder are:
 *
 *   - Patterns only carry two classification dimensions (`pattern_type`,
 *     required; `hokei_subtype`, optional). `technique_type`, `sotai`,
 *     `attack_type` are technique-only.
 *   - `officialBodyOrgId` references an organisation by `<runtime:fk:
 *     organisations.slug=...>` placeholder. The fixture uses the legacy
 *     short slugs (`wtf`, `stf`) that the migrated organisations seed
 *     replaced with full descriptive slugs. The placeholders are resolved
 *     via a small alias map at seed time, so the JSON stays readable.
 *
 * Depends on `seedClassifications` having seeded the `pattern_type` and
 * `hokei_subtype` roots + children, and on `seedOrganisations` having
 * seeded WTF and SWETA.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { type DrizzleDb } from '../client.js';
import {
  classificationCategory,
  organisations,
  pattern,
  patternClassification,
} from '../schema/index.js';

interface SeedPattern {
  id: string;
  createdByOrganisationId: string | null;
  /** pattern_type code (required). */
  type: string;
  /** hokei_subtype code (optional). Present only on hokei patterns. */
  hokeiSubtype?: string;
  /**
   * Either a literal UUID, or a `<runtime:fk:organisations.slug=<slug>>`
   * placeholder. Legacy short slugs (`wtf`, `stf`) are aliased — see
   * `OFFICIAL_BODY_SLUG_ALIASES` below.
   */
  officialBodyOrgId: string | null;
  isActive: boolean;
  sortOrder: number;
  minRankId: string | null;
  nameJa: string;
  nameRomaji: string;
  nameSv: string;
  nameEn: string;
  nameFi: string;
  descriptionSv: string;
  descriptionEn: string;
  descriptionFi: string;
}

interface PatternsSeedJson {
  patterns: SeedPattern[];
}

/**
 * The fixture references organisations using the slugs that were in place
 * before the org seed was migrated to full descriptive names. Map them to
 * the canonical slugs so the lookup succeeds against the current orgs
 * table.
 */
const OFFICIAL_BODY_SLUG_ALIASES: Record<string, string> = {
  wtf: 'world-taido-federation',
  stf: 'swedish-taido-association',
};

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolvePath(HERE, 'patterns.seed.json');

export interface PatternsSeedResult {
  patterns: { inserted: number; updated: number };
  edges: { inserted: number };
}

export async function seedPatterns(db: DrizzleDb): Promise<PatternsSeedResult> {
  const raw = readFileSync(FIXTURE_PATH, 'utf8').replace(/^﻿/, '');
  const fixture = JSON.parse(raw) as PatternsSeedJson;

  // ── Classification lookup (rootCode, code) -> uuid ─────────────────────
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
          `Run seedClassifications before seedPatterns.`,
      );
    }
    return id;
  }

  // ── Organisation lookup (for officialBodyOrgId placeholders) ───────────
  const orgs = await db
    .select({ id: organisations.id, slug: organisations.slug })
    .from(organisations);
  const orgIdBySlug = new Map<string, string>();
  for (const o of orgs) {
    if (o.slug) orgIdBySlug.set(o.slug, o.id);
  }

  function resolveOfficialBodyOrgId(raw: string | null): string | null {
    if (!raw) return null;
    const match = raw.match(/^<runtime:fk:organisations\.slug=([\w-]+)>$/);
    if (!match) {
      // Already a literal UUID (or some other format) — pass through.
      return raw;
    }
    const requestedSlug = match[1]!;
    const canonicalSlug = OFFICIAL_BODY_SLUG_ALIASES[requestedSlug] ?? requestedSlug;
    const id = orgIdBySlug.get(canonicalSlug);
    if (!id) {
      throw new Error(
        `Seed error: no organisation with slug "${canonicalSlug}" ` +
          `(referenced as "${requestedSlug}" in the patterns fixture). ` +
          `Run seedOrganisations before seedPatterns.`,
      );
    }
    return id;
  }

  const result: PatternsSeedResult = {
    patterns: { inserted: 0, updated: 0 },
    edges: { inserted: 0 },
  };

  for (const p of fixture.patterns) {
    const edges: string[] = [resolveCategoryId('pattern_type', p.type)];
    if (p.hokeiSubtype) {
      edges.push(resolveCategoryId('hokei_subtype', p.hokeiSubtype));
    }

    const officialBodyOrgId = resolveOfficialBodyOrgId(p.officialBodyOrgId);

    const values = {
      id: p.id,
      createdByOrganisationId: p.createdByOrganisationId,
      officialBodyOrgId,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
      minRankId: p.minRankId,
      nameJa: p.nameJa,
      nameRomaji: p.nameRomaji,
      nameSv: p.nameSv,
      nameEn: p.nameEn,
      nameFi: p.nameFi,
      descriptionSv: p.descriptionSv,
      descriptionEn: p.descriptionEn,
      descriptionFi: p.descriptionFi,
    } as const;

    const existing = (
      await db
        .select({ id: pattern.id })
        .from(pattern)
        .where(eq(pattern.id, p.id))
        .limit(1)
    )[0];

    if (existing) {
      await db
        .update(pattern)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(pattern.id, p.id));
      result.patterns.updated += 1;
    } else {
      await db.insert(pattern).values(values);
      result.patterns.inserted += 1;
    }

    // REPLACE edges: delete-all-for-pattern then insert the fixture set.
    await db
      .delete(patternClassification)
      .where(eq(patternClassification.patternId, p.id));
    for (const [i, edgeId] of edges.entries()) {
      await db.insert(patternClassification).values({
        patternId: p.id,
        classificationCategoryId: edgeId,
        sortOrder: i,
      });
      result.edges.inserted += 1;
    }
  }

  return result;
}
