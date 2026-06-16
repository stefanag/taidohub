/**
 * Idempotent seeder for the classification taxonomy (roots + one level of
 * children). Resolves by `id` — every fixture row carries a stable UUID, so
 * inserts become updates on re-run. Roots are seeded first so child rows
 * can FK against them.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

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

  // Roots first (children FK against root ids).
  const rootIdByCode = new Map<string, string>();
  for (const root of fixture.roots) {
    rootIdByCode.set(root.code, root.id);
    const existing = (
      await db
        .select({ id: classificationCategory.id })
        .from(classificationCategory)
        .where(eq(classificationCategory.id, root.id))
        .limit(1)
    )[0];
    if (existing) {
      await db
        .update(classificationCategory)
        .set({
          parentId: null,
          code: root.code,
          nameEn: root.nameEn,
          nameSv: root.nameSv,
          nameFi: root.nameFi,
          nameJa: root.nameJa,
          sortOrder: root.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(classificationCategory.id, root.id));
      result.roots.updated += 1;
    } else {
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
        .where(eq(classificationCategory.id, child.id))
        .limit(1)
    )[0];
    if (existing) {
      await db
        .update(classificationCategory)
        .set({
          parentId,
          code: child.code,
          nameEn: child.nameEn,
          nameSv: child.nameSv,
          nameFi: child.nameFi,
          nameJa: child.nameJa,
          sortOrder: child.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(classificationCategory.id, child.id));
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
