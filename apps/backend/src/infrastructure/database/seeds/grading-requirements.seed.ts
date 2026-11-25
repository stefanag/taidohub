/**
 * Idempotent seeder for federation grading requirements.
 *
 * Source: the STF training matrix ("Träningsmatrikel för Svenska
 * Taidoförbundet", valid from 2024-01-24, updated 2024-08-18) for 8 kyu – 1 kyu,
 * and the STF dan-grade rules (2024-02-11, §3.5) for minimum time in grade,
 * 1 dan – 8 dan. The fixture references catalogue rows by id; it was built
 * against `techniques.seed.json` and `patterns.seed.json`.
 *
 * - The requirement set is resolved by its fixed id. A new set is created
 *   active, after deactivating every other active set of the same
 *   organisation in the same transaction (one active set per organisation).
 *   On re-runs the set's name and effective date are refreshed, but its
 *   active flag is left alone: an admin may have switched sets since.
 * - Each `(rank, set)` scope is replaced as a whole (scalar row, techniques,
 *   patterns, hokei groups), in one transaction per rank — the same
 *   semantics as `PUT /grading-requirements/:rankId`. The fixture owns this
 *   set: edit it through a cloned set in the admin UI, not in place.
 * - Ranks resolve by slug within the set's organisation, falling back to the
 *   global rank with that slug.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq, isNull, ne } from 'drizzle-orm';
import { type AnyPgColumn } from 'drizzle-orm/pg-core';

import { type DrizzleDb } from '../client.js';
import {
  beltRanks,
  organisations,
  rankGradingRequirement,
  rankRequirementHokeiGroup,
  rankRequirementHokeiGroupPattern,
  rankRequirementPattern,
  rankRequirementTechnique,
  requirementSet,
} from '../schema/index.js';

interface CatalogueRef {
  id: string;
  /** For people reading the fixture; not used by the seeder. */
  name: string;
}

interface SeedRequirementSet {
  id: string;
  name: string;
  organisationSlug: string;
  effectiveDate: string;
}

interface SeedRankRequirement {
  setId: string;
  rankSlug: string;
  kihon: CatalogueRef[];
  patterns: CatalogueRef[];
  hokeiGroups: {
    pickCount: number;
    patterns: CatalogueRef[];
    labelSv: string | null;
    labelEn: string | null;
    labelFi: string | null;
  }[];
  jissenMinutes: number | null;
  minMonthsSincePreviousRank: number | null;
}

export interface GradingRequirementsFixture {
  requirementSets: SeedRequirementSet[];
  requirements: SeedRankRequirement[];
}

export interface GradingRequirementsSeedResult {
  sets: { inserted: number; updated: number };
  ranks: number;
}

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'grading-requirements.seed.json');

export function loadGradingRequirementsFixture(): GradingRequirementsFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GradingRequirementsFixture;
}

export async function seedGradingRequirements(
  db: DrizzleDb,
  fixture: GradingRequirementsFixture = loadGradingRequirementsFixture(),
): Promise<GradingRequirementsSeedResult> {
  const result: GradingRequirementsSeedResult = { sets: { inserted: 0, updated: 0 }, ranks: 0 };
  const orgIdBySet = new Map<string, string>();

  for (const set of fixture.requirementSets) {
    const org = (
      await db
        .select({ id: organisations.id })
        .from(organisations)
        .where(eq(organisations.slug, set.organisationSlug))
        .limit(1)
    )[0];
    if (!org) {
      throw new Error(
        `Seed error: organisation "${set.organisationSlug}" for requirement set "${set.name}" not found.`,
      );
    }
    orgIdBySet.set(set.id, org.id);

    const existing = (
      await db.select({ id: requirementSet.id }).from(requirementSet).where(eq(requirementSet.id, set.id)).limit(1)
    )[0];
    if (existing) {
      await db
        .update(requirementSet)
        .set({ name: set.name, effectiveDate: set.effectiveDate, updatedAt: new Date() })
        .where(eq(requirementSet.id, set.id));
      result.sets.updated += 1;
    } else {
      await db.transaction(async (tx) => {
        await tx
          .update(requirementSet)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(requirementSet.organisationId, org.id),
              eq(requirementSet.isActive, true),
              ne(requirementSet.id, set.id),
            ),
          );
        await tx.insert(requirementSet).values({
          id: set.id,
          name: set.name,
          organisationId: org.id,
          effectiveDate: set.effectiveDate,
          isActive: true,
        });
      });
      result.sets.inserted += 1;
    }
  }

  for (const req of fixture.requirements) {
    const orgId = orgIdBySet.get(req.setId);
    if (!orgId) throw new Error(`Seed error: requirement for ${req.rankSlug} names unknown set ${req.setId}.`);
    const rankId = await resolveRankId(db, req.rankSlug, orgId);

    await db.transaction(async (tx) => {
      const scope = (t: { rankId: AnyPgColumn; setId: AnyPgColumn }) =>
        and(eq(t.rankId, rankId), eq(t.setId, req.setId));

      // Hokei group patterns cascade with their group.
      await tx.delete(rankRequirementHokeiGroup).where(scope(rankRequirementHokeiGroup));
      await tx.delete(rankRequirementPattern).where(scope(rankRequirementPattern));
      await tx.delete(rankRequirementTechnique).where(scope(rankRequirementTechnique));
      await tx.delete(rankGradingRequirement).where(scope(rankGradingRequirement));

      await tx.insert(rankGradingRequirement).values({
        rankId,
        setId: req.setId,
        jissenMinutes: req.jissenMinutes,
        minMonthsSincePreviousRank: req.minMonthsSincePreviousRank,
      });
      if (req.kihon.length > 0) {
        await tx
          .insert(rankRequirementTechnique)
          .values(req.kihon.map((t) => ({ rankId, setId: req.setId, techniqueId: t.id })));
      }
      if (req.patterns.length > 0) {
        await tx
          .insert(rankRequirementPattern)
          .values(req.patterns.map((p) => ({ rankId, setId: req.setId, patternId: p.id })));
      }
      for (const [groupOrder, group] of req.hokeiGroups.entries()) {
        const [created] = await tx
          .insert(rankRequirementHokeiGroup)
          .values({
            rankId,
            setId: req.setId,
            groupOrder,
            // Never demand more patterns than the group holds.
            pickCount: Math.min(group.pickCount, group.patterns.length),
            labelSv: group.labelSv,
            labelEn: group.labelEn,
            labelFi: group.labelFi,
          })
          .returning({ id: rankRequirementHokeiGroup.id });
        await tx.insert(rankRequirementHokeiGroupPattern).values(
          group.patterns.map((p, sortOrder) => ({ groupId: created!.id, patternId: p.id, sortOrder })),
        );
      }
    });
    result.ranks += 1;
  }

  return result;
}

async function resolveRankId(db: DrizzleDb, slug: string, organisationId: string): Promise<string> {
  const own = (
    await db
      .select({ id: beltRanks.id })
      .from(beltRanks)
      .where(and(eq(beltRanks.slug, slug), eq(beltRanks.organisationId, organisationId)))
      .limit(1)
  )[0];
  if (own) return own.id;
  const global = (
    await db
      .select({ id: beltRanks.id })
      .from(beltRanks)
      .where(and(eq(beltRanks.slug, slug), isNull(beltRanks.organisationId)))
      .limit(1)
  )[0];
  if (!global) throw new Error(`Seed error: no belt rank with slug "${slug}". Run seedBeltCatalog first.`);
  return global.id;
}
