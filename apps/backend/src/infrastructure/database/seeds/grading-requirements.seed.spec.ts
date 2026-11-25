import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadGradingRequirementsFixture } from './grading-requirements.seed.js';

/**
 * The requirements fixture references catalogue rows by id. These checks
 * catch a catalogue edit that would leave the fixture pointing at nothing,
 * before a deploy's seed run fails on a foreign key.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const read = <T>(file: string): T => JSON.parse(readFileSync(join(HERE, file), 'utf8')) as T;
const listOf = <T>(json: unknown): T[] =>
  (Array.isArray(json) ? json : Object.values(json as Record<string, unknown>)[0]) as T[];

const fixture = loadGradingRequirementsFixture();
const techniques = listOf<{ id: string; nameRomaji: string }>(read('techniques.seed.json'));
const patterns = listOf<{ id: string; nameRomaji: string }>(read('patterns.seed.json'));
const ranks = read<{ beltRanks: { slug: string; organisationId?: string }[] }>('belt-catalog.seed.json').beltRanks;
const organisations = listOf<{ id: string; slug: string }>(read('organisations.seed.json'));

describe('grading-requirements fixture', () => {
  const techniqueIds = new Map(techniques.map((t) => [t.id, t.nameRomaji]));
  const patternIds = new Map(patterns.map((p) => [p.id, p.nameRomaji]));

  it('references only techniques and patterns that are seeded, under the names it shows', () => {
    for (const req of fixture.requirements) {
      for (const t of req.kihon) expect(techniqueIds.get(t.id), `${req.rankSlug}: ${t.name}`).toBe(t.name);
      for (const p of [...req.patterns, ...req.hokeiGroups.flatMap((g) => g.patterns)]) {
        expect(patternIds.get(p.id), `${req.rankSlug}: ${p.name}`).toBe(p.name);
      }
    }
  });

  it("names ranks that exist in the set organisation's own ladder", () => {
    for (const set of fixture.requirementSets) {
      const org = organisations.find((o) => o.slug === set.organisationSlug);
      expect(org, set.organisationSlug).toBeDefined();
      const own = new Set(ranks.filter((r) => r.organisationId === org!.id).map((r) => r.slug));
      for (const req of fixture.requirements.filter((r) => r.setId === set.id)) {
        expect(own.has(req.rankSlug), req.rankSlug).toBe(true);
      }
    }
  });

  it('covers 8 kyu to 1 kyu with content and 1 dan to 8 dan with time in grade', () => {
    const bySlug = new Map(fixture.requirements.map((r) => [r.rankSlug, r]));
    for (const kyu of ['8', '7', '6', '5', '4', '3', '2', '1']) {
      expect(bySlug.get(`${kyu}-kyu`)?.kihon.length, `${kyu}-kyu`).toBeGreaterThan(0);
    }
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((d) => bySlug.get(`${d}-dan`)?.minMonthsSincePreviousRank)).toEqual([
      12, 24, 36, 48, 60, 72, 96, 120,
    ]);
  });

  it('never asks a hokei group for more patterns than it holds', () => {
    for (const req of fixture.requirements) {
      for (const g of req.hokeiGroups) expect(g.pickCount).toBeLessThanOrEqual(g.patterns.length);
    }
  });
});
