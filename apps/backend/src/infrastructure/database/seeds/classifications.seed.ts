/**
 * Idempotent seeder for the classification taxonomy (roots + one level of
 * children). Resolves by the natural key `(parent_id, code)` — the same key
 * the unique index enforces. Pre-existing rows (inserted by a prior seed or
 * migration) keep their UUIDs; only genuinely new rows get the fixture UUID.
 * Roots are seeded first so child rows can FK against them.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq, isNull } from 'drizzle-orm';

import { type DrizzleDb } from '../client.js';
import { classificationCategory } from '../schema/index.js';

interface SeedRoot {
  id: string;
  code: string;
  nameEn: string;
  nameSv: string;
  nameFi: string;
  nameJa: string;
  sortOrder: number;
}

interface SeedChild extends SeedRoot {
  parentCode: string;
}

interface ClassificationsSeedJson {
  roots: SeedRoot[];
  children: SeedChild[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(HERE, 'classifications.seed.json');

export interface ClassificationsSeedResult {
  roots: { inserted: number; updated: number };
  children: { inserted: number; updated: number };
}

export async function seedClassifications(db: DrizzleDb): Promise<ClassificationsSeedResult> {
  const raw = readFileSync(FIXTURE_PATH, 'utf8').replace(/^﻿/, '');
  const fixture = JSON.parse(raw) as ClassificationsSeedJson;

  const result: ClassificationsSeedResult = {
    roots: { inserted: 0, updated: 0 },
    children: { inserted: 0, updated: 0 },
  };

  // Roots first (children FK against root ids). Look up by (parent_id IS NULL,
  // code) — the natural key the unique index enforces — so pre-existing rows
  // (from prior seeds or migrations) get updated in place under their own id.
  const rootIdByCode = new Map<string, string>();
  for (const root of fixture.roots) {
    const existing = (
      await db
        .select({ id: classificationCategory.id })
        .from(classificationCategory)
        .where(
          and(
            isNull(classificationCategory.parentId),
            eq(classificationCategory.code, root.code),
          ),
        )
        .limit(1)
    )[0];
    if (existing) {
      rootIdByCode.set(root.code, existing.id);
      await db
        .update(classificationCategory)
        .set({
          nameEn: root.nameEn,
          nameSv: root.nameSv,
          nameFi: root.nameFi,
          nameJa: root.nameJa,
          sortOrder: root.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(classificationCategory.id, existing.id));
      result.roots.updated += 1;
    } else {
      rootIdByCode.set(root.code, root.id);
      await db.insert(classificationCategory).values({
        id: root.id,
        parentId: null,
        code: root.code,
        nameEn: root.nameEn,
        nameSv: root.nameSv,
        nameFi: root.nameFi,
        nameJa: root.nameJa,
        sortOrder: root.sortOrder,
      });
      result.roots.inserted += 1;
    }
  }

  for (const child of fixture.children) {
    const parentId = rootIdByCode.get(child.parentCode);
    if (!parentId) {
      throw new Error(
        `Seed error: classification child "${child.code}" references unknown parent code "${child.parentCode}".`,
      );
    }
    const existing = (
      await db
        .select({ id: classificationCategory.id })
        .from(classificationCategory)
        .where(
          and(
            eq(classificationCategory.parentId, parentId),
            eq(classificationCategory.code, child.code),
          ),
        )
        .limit(1)
    )[0];
    if (existing) {
      await db
        .update(classificationCategory)
        .set({
          nameEn: child.nameEn,
          nameSv: child.nameSv,
          nameFi: child.nameFi,
          nameJa: child.nameJa,
          sortOrder: child.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(classificationCategory.id, existing.id));
      result.children.updated += 1;
    } else {
      await db.insert(classificationCategory).values({
        id: child.id,
        parentId,
        code: child.code,
        nameEn: child.nameEn,
        nameSv: child.nameSv,
        nameFi: child.nameFi,
        nameJa: child.nameJa,
        sortOrder: child.sortOrder,
      });
      result.children.inserted += 1;
    }
  }

  return result;
}
