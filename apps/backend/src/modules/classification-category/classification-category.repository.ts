import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import { classificationCategory } from '../../infrastructure/database/schema/classification-category.js';

export type ClassificationCategoryRow = typeof classificationCategory.$inferSelect;

/**
 * Repository — the only file in the classification-category module allowed to
 * touch Drizzle. Single-table CRUD over `classification_category` plus a few
 * shape-specific reads (roots, children, by-id lookup) that the service uses
 * to maintain its root cache and resolve classification → root mappings.
 *
 * Mutating calls accept an optional `DrizzleExecutor` so the service can wrap
 * the write together with an audit-log insert in a single transaction. Read
 * calls intentionally remain off the root db handle.
 */
@Injectable()
export class ClassificationCategoryRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Every row whose `parentId` is null — i.e. every taxonomy root. */
  async findRoots(): Promise<ClassificationCategoryRow[]> {
    return this.db
      .select()
      .from(classificationCategory)
      .where(isNull(classificationCategory.parentId));
  }

  /** Direct children of a given root id. `includeInactive=false` filters out soft-deleted rows. */
  async findChildren(
    parentId: string,
    includeInactive = false,
  ): Promise<ClassificationCategoryRow[]> {
    if (includeInactive) {
      return this.db
        .select()
        .from(classificationCategory)
        .where(eq(classificationCategory.parentId, parentId));
    }
    return this.db
      .select()
      .from(classificationCategory)
      .where(
        and(
          eq(classificationCategory.parentId, parentId),
          eq(classificationCategory.isActive, true),
        ),
      );
  }

  /** Looks up a root row by its `code`. Returns `null` if not seeded. */
  async findRootByCode(code: string): Promise<ClassificationCategoryRow | null> {
    const rows = await this.db
      .select()
      .from(classificationCategory)
      .where(
        and(eq(classificationCategory.code, code), isNull(classificationCategory.parentId)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** Bulk by-id lookup used by `resolveRootCodes`. Empty input → empty output. */
  async findManyByIds(ids: readonly string[]): Promise<ClassificationCategoryRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(classificationCategory)
      .where(inArray(classificationCategory.id, ids));
  }

  /** Partial update returning the new row. Throws if the row is gone. */
  async update(
    id: string,
    patch: Partial<
      Pick<
        ClassificationCategoryRow,
        'nameEn' | 'nameSv' | 'nameFi' | 'nameJa' | 'sortOrder' | 'isActive'
      >
    >,
    tx?: DrizzleExecutor,
  ): Promise<ClassificationCategoryRow> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .update(classificationCategory)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(classificationCategory.id, id))
      .returning();
    if (!row) throw new Error(`classification_category ${id} not found`);
    return row;
  }
}
