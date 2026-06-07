import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { TaggableType } from '@repo/contracts/labels';

import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import {
  category,
  categoryAttachment,
  tag,
  tagAttachment,
} from '../../infrastructure/database/schema/index.js';

export type TagRow = typeof tag.$inferSelect;
export type CategoryRow = typeof category.$inferSelect;
export type TagAttachmentRow = typeof tagAttachment.$inferSelect;
export type CategoryAttachmentRow = typeof categoryAttachment.$inferSelect;

/**
 * Repository — the only file in the labels module allowed to touch Drizzle.
 *
 * "Visible" labels for a user are everything scoped to their organisation
 * plus the sysadmin globals (`organisation_id IS NULL`). Sysadmins pass
 * `null` as the org filter and see every row.
 */
@Injectable()
export class LabelsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  // ── Tags ───────────────────────────────────────────────────────────────
  async listVisibleTags(organisationId: string | null): Promise<TagRow[]> {
    if (organisationId === null) {
      return this.db.select().from(tag);
    }
    return this.db
      .select()
      .from(tag)
      .where(or(eq(tag.organisationId, organisationId), isNull(tag.organisationId)));
  }

  async findTagById(id: string): Promise<TagRow | undefined> {
    const rows = await this.db.select().from(tag).where(eq(tag.id, id)).limit(1);
    return rows[0];
  }

  async insertTag(input: {
    organisationId: string | null;
    name: string;
    createdByUserId: string;
  }): Promise<TagRow> {
    const [row] = await this.db.insert(tag).values(input).returning();
    if (!row) throw new Error('Insert returned no rows.');
    return row;
  }

  async updateTagName(id: string, name: string): Promise<TagRow> {
    const [row] = await this.db
      .update(tag)
      .set({ name, updatedAt: new Date() })
      .where(eq(tag.id, id))
      .returning();
    if (!row) throw new Error('Update returned no rows.');
    return row;
  }

  async deleteTag(id: string): Promise<void> {
    await this.db.delete(tag).where(eq(tag.id, id));
  }

  // ── Categories ─────────────────────────────────────────────────────────
  async listVisibleCategories(organisationId: string | null): Promise<CategoryRow[]> {
    if (organisationId === null) {
      return this.db.select().from(category);
    }
    return this.db
      .select()
      .from(category)
      .where(or(eq(category.organisationId, organisationId), isNull(category.organisationId)));
  }

  async findCategoryById(id: string): Promise<CategoryRow | undefined> {
    const rows = await this.db.select().from(category).where(eq(category.id, id)).limit(1);
    return rows[0];
  }

  async listCategoryChildren(parentId: string): Promise<CategoryRow[]> {
    return this.db.select().from(category).where(eq(category.parentId, parentId));
  }

  async insertCategory(input: {
    organisationId: string | null;
    parentId: string | null;
    name: string;
    createdByUserId: string;
  }): Promise<CategoryRow> {
    const [row] = await this.db.insert(category).values(input).returning();
    if (!row) throw new Error('Insert returned no rows.');
    return row;
  }

  async updateCategoryName(id: string, name: string): Promise<CategoryRow> {
    const [row] = await this.db
      .update(category)
      .set({ name, updatedAt: new Date() })
      .where(eq(category.id, id))
      .returning();
    if (!row) throw new Error('Update returned no rows.');
    return row;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.db.delete(category).where(eq(category.id, id));
  }

  // ── Attachments ────────────────────────────────────────────────────────
  async listTagAttachmentsByTarget(
    targetType: TaggableType,
    targetId: string,
  ): Promise<TagAttachmentRow[]> {
    return this.db
      .select()
      .from(tagAttachment)
      .where(and(eq(tagAttachment.targetType, targetType), eq(tagAttachment.targetId, targetId)));
  }

  async listCategoryAttachmentsByTarget(
    targetType: TaggableType,
    targetId: string,
  ): Promise<CategoryAttachmentRow[]> {
    return this.db
      .select()
      .from(categoryAttachment)
      .where(
        and(
          eq(categoryAttachment.targetType, targetType),
          eq(categoryAttachment.targetId, targetId),
        ),
      );
  }

  /**
   * Idempotent insert — duplicate `(tag_id, target_type, target_id)` triples
   * silently no-op and return the existing row.
   */
  async insertTagAttachment(input: {
    tagId: string;
    targetType: TaggableType;
    targetId: string;
    attachedByUserId: string;
  }): Promise<TagAttachmentRow> {
    const [row] = await this.db
      .insert(tagAttachment)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const rows = await this.db
      .select()
      .from(tagAttachment)
      .where(
        and(
          eq(tagAttachment.tagId, input.tagId),
          eq(tagAttachment.targetType, input.targetType),
          eq(tagAttachment.targetId, input.targetId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error('Attachment row vanished after conflict resolution.');
    return rows[0];
  }

  async insertCategoryAttachment(input: {
    categoryId: string;
    targetType: TaggableType;
    targetId: string;
    attachedByUserId: string;
  }): Promise<CategoryAttachmentRow> {
    const [row] = await this.db
      .insert(categoryAttachment)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const rows = await this.db
      .select()
      .from(categoryAttachment)
      .where(
        and(
          eq(categoryAttachment.categoryId, input.categoryId),
          eq(categoryAttachment.targetType, input.targetType),
          eq(categoryAttachment.targetId, input.targetId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new Error('Attachment row vanished after conflict resolution.');
    return rows[0];
  }

  async deleteTagAttachment(id: string): Promise<void> {
    await this.db.delete(tagAttachment).where(eq(tagAttachment.id, id));
  }

  async deleteCategoryAttachment(id: string): Promise<void> {
    await this.db.delete(categoryAttachment).where(eq(categoryAttachment.id, id));
  }

  async findTagAttachmentById(id: string): Promise<TagAttachmentRow | undefined> {
    const rows = await this.db
      .select()
      .from(tagAttachment)
      .where(eq(tagAttachment.id, id))
      .limit(1);
    return rows[0];
  }

  async findCategoryAttachmentById(id: string): Promise<CategoryAttachmentRow | undefined> {
    const rows = await this.db
      .select()
      .from(categoryAttachment)
      .where(eq(categoryAttachment.id, id))
      .limit(1);
    return rows[0];
  }

  /** Cascade hook: drop every label attachment pinned to the given target. */
  async detachAllForTarget(targetType: TaggableType, targetId: string): Promise<void> {
    await this.db
      .delete(tagAttachment)
      .where(and(eq(tagAttachment.targetType, targetType), eq(tagAttachment.targetId, targetId)));
    await this.db
      .delete(categoryAttachment)
      .where(
        and(
          eq(categoryAttachment.targetType, targetType),
          eq(categoryAttachment.targetId, targetId),
        ),
      );
  }

  /** Return target ids of `targetType` rows that carry ALL the given tag ids (multi-AND). */
  async targetsWithAllTags(targetType: TaggableType, tagIds: string[]): Promise<string[]> {
    if (tagIds.length === 0) return [];
    const rows = await this.db
      .select({ targetId: tagAttachment.targetId })
      .from(tagAttachment)
      .where(and(eq(tagAttachment.targetType, targetType), inArray(tagAttachment.tagId, tagIds)))
      .groupBy(tagAttachment.targetId)
      .having(sql`count(distinct ${tagAttachment.tagId}) = ${tagIds.length}`);
    return rows.map((r) => r.targetId);
  }

  /**
   * Same multi-AND semantics as {@link targetsWithAllTags}, but each filter
   * category is expanded to itself plus its direct children — a target
   * satisfies the filter if it carries any descendant within the group.
   */
  async targetsWithAllCategories(
    targetType: TaggableType,
    categoryIds: string[],
  ): Promise<string[]> {
    if (categoryIds.length === 0) return [];
    const expansions: string[][] = [];
    for (const cid of categoryIds) {
      const children = await this.db
        .select({ id: category.id })
        .from(category)
        .where(eq(category.parentId, cid));
      expansions.push([cid, ...children.map((c) => c.id)]);
    }
    const sets: Set<string>[] = [];
    for (const group of expansions) {
      const rows = await this.db
        .select({ targetId: categoryAttachment.targetId })
        .from(categoryAttachment)
        .where(
          and(
            eq(categoryAttachment.targetType, targetType),
            inArray(categoryAttachment.categoryId, group),
          ),
        );
      sets.push(new Set(rows.map((r) => r.targetId)));
    }
    if (sets.length === 0) return [];
    const [first, ...rest] = sets;
    return Array.from(first!).filter((id) => rest.every((s) => s.has(id)));
  }
}
