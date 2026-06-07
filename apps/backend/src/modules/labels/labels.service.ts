import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateCategoryInput,
  CreateTagInput,
  TaggableType,
  UpdateCategoryInput,
  UpdateTagInput,
} from '@repo/contracts/labels';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import {
  LabelsRepository,
  type CategoryAttachmentRow,
  type CategoryRow,
  type TagAttachmentRow,
  type TagRow,
} from './labels.repository.js';

/**
 * Service — owns the label business rules:
 *   - Globals (`organisation_id IS NULL`) are sysadmin-only to create/edit/delete.
 *   - Org-scoped labels are editable only by their author, or by a sysadmin.
 *   - Categories are limited to one level of nesting (a parent must itself be a root).
 *   - Attaching a label requires the label to be visible to the caller — i.e.
 *     scoped to one of their organisations, or a global.
 *   - Detaching is allowed for the user who attached it, or for a sysadmin.
 *
 * HTTP authorization (who can call any of these methods at all) lives in CASL
 * abilities and is enforced by the controller (Task 6); this layer encodes
 * the per-row business rules.
 */
@Injectable()
export class LabelsService {
  constructor(private readonly repo: LabelsRepository) {}

  // ── Tags ───────────────────────────────────────────────────────────────
  async listTags(user: AuthenticatedUser): Promise<TagRow[]> {
    return this.repo.listVisibleTags(this.scopeOrgFor(user));
  }

  async createTag(user: AuthenticatedUser, input: CreateTagInput): Promise<TagRow> {
    const wantsGlobal = input.global ?? false;
    if (wantsGlobal && user.role !== 'sysadmin') {
      throw new ForbiddenException('Only sysadmins can create global labels.');
    }
    const organisationId = wantsGlobal ? null : this.requireUserOrg(user);
    return this.repo.insertTag({ organisationId, name: input.name, createdByUserId: user.id });
  }

  async updateTag(user: AuthenticatedUser, id: string, input: UpdateTagInput): Promise<TagRow> {
    const row = await this.repo.findTagById(id);
    if (!row) throw new NotFoundException('Tag not found.');
    this.assertCanMutateLabel(user, row);
    return this.repo.updateTagName(id, input.name);
  }

  async deleteTag(user: AuthenticatedUser, id: string): Promise<void> {
    const row = await this.repo.findTagById(id);
    if (!row) throw new NotFoundException('Tag not found.');
    this.assertCanMutateLabel(user, row);
    await this.repo.deleteTag(id);
  }

  // ── Categories ─────────────────────────────────────────────────────────
  async listCategories(user: AuthenticatedUser): Promise<CategoryRow[]> {
    return this.repo.listVisibleCategories(this.scopeOrgFor(user));
  }

  async createCategory(
    user: AuthenticatedUser,
    input: CreateCategoryInput,
  ): Promise<CategoryRow> {
    const wantsGlobal = input.global ?? false;
    if (wantsGlobal && user.role !== 'sysadmin') {
      throw new ForbiddenException('Only sysadmins can create global labels.');
    }
    if (input.parentId) {
      const parent = await this.repo.findCategoryById(input.parentId);
      if (!parent) throw new BadRequestException('Parent category does not exist.');
      if (parent.parentId !== null) {
        throw new BadRequestException('Categories may not nest deeper than one level.');
      }
    }
    const organisationId = wantsGlobal ? null : this.requireUserOrg(user);
    return this.repo.insertCategory({
      organisationId,
      parentId: input.parentId ?? null,
      name: input.name,
      createdByUserId: user.id,
    });
  }

  async updateCategory(
    user: AuthenticatedUser,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryRow> {
    const row = await this.repo.findCategoryById(id);
    if (!row) throw new NotFoundException('Category not found.');
    this.assertCanMutateLabel(user, row);
    return this.repo.updateCategoryName(id, input.name);
  }

  async deleteCategory(user: AuthenticatedUser, id: string): Promise<void> {
    const row = await this.repo.findCategoryById(id);
    if (!row) throw new NotFoundException('Category not found.');
    this.assertCanMutateLabel(user, row);
    await this.repo.deleteCategory(id);
  }

  // ── Attachments ────────────────────────────────────────────────────────
  /**
   * List the labels attached to a given target. Visibility of attachments
   * piggybacks on the target-side ability check the controller performs.
   */
  async listAttachmentsForTarget(
    user: AuthenticatedUser,
    targetType: TaggableType,
    targetId: string,
  ): Promise<{ tags: TagAttachmentRow[]; categories: CategoryAttachmentRow[] }> {
    void user;
    const [tags, categories] = await Promise.all([
      this.repo.listTagAttachmentsByTarget(targetType, targetId),
      this.repo.listCategoryAttachmentsByTarget(targetType, targetId),
    ]);
    return { tags, categories };
  }

  async attachTag(
    user: AuthenticatedUser,
    input: { tagId: string; targetType: TaggableType; targetId: string },
  ): Promise<TagAttachmentRow> {
    const t = await this.repo.findTagById(input.tagId);
    if (!t) throw new NotFoundException('Tag not found.');
    this.assertCanUseLabel(user, t);
    return this.repo.insertTagAttachment({
      tagId: input.tagId,
      targetType: input.targetType,
      targetId: input.targetId,
      attachedByUserId: user.id,
    });
  }

  async attachCategory(
    user: AuthenticatedUser,
    input: { categoryId: string; targetType: TaggableType; targetId: string },
  ): Promise<CategoryAttachmentRow> {
    const c = await this.repo.findCategoryById(input.categoryId);
    if (!c) throw new NotFoundException('Category not found.');
    this.assertCanUseLabel(user, c);
    return this.repo.insertCategoryAttachment({
      categoryId: input.categoryId,
      targetType: input.targetType,
      targetId: input.targetId,
      attachedByUserId: user.id,
    });
  }

  async detachTag(user: AuthenticatedUser, attachmentId: string): Promise<void> {
    const att = await this.repo.findTagAttachmentById(attachmentId);
    if (!att) throw new NotFoundException('Attachment not found.');
    if (user.role !== 'sysadmin' && att.attachedByUserId !== user.id) {
      throw new ForbiddenException('Not allowed to detach this tag.');
    }
    await this.repo.deleteTagAttachment(attachmentId);
  }

  async detachCategory(user: AuthenticatedUser, attachmentId: string): Promise<void> {
    const att = await this.repo.findCategoryAttachmentById(attachmentId);
    if (!att) throw new NotFoundException('Attachment not found.');
    if (user.role !== 'sysadmin' && att.attachedByUserId !== user.id) {
      throw new ForbiddenException('Not allowed to detach this category.');
    }
    await this.repo.deleteCategoryAttachment(attachmentId);
  }

  /** Hook called by other modules when their primary entity is deleted. */
  async detachAllForTarget(targetType: TaggableType, targetId: string): Promise<void> {
    await this.repo.detachAllForTarget(targetType, targetId);
  }

  /**
   * Filter helper consumed by integrating modules — returns the set of target
   * ids that satisfy ALL of the supplied tag and category constraints, or
   * `undefined` when no filter is supplied (meaning "no narrowing").
   */
  async filterTargetsByLabels(
    targetType: TaggableType,
    filter: { tagIds?: string[]; categoryIds?: string[] },
  ): Promise<{ targetIds: string[] | undefined }> {
    const tagIds = filter.tagIds ?? [];
    const categoryIds = filter.categoryIds ?? [];
    if (tagIds.length === 0 && categoryIds.length === 0) {
      return { targetIds: undefined };
    }
    const tagSet =
      tagIds.length === 0
        ? undefined
        : new Set(await this.repo.targetsWithAllTags(targetType, tagIds));
    const catSet =
      categoryIds.length === 0
        ? undefined
        : new Set(await this.repo.targetsWithAllCategories(targetType, categoryIds));
    if (tagSet && catSet) {
      return { targetIds: Array.from(tagSet).filter((id) => catSet.has(id)) };
    }
    return { targetIds: Array.from((tagSet ?? catSet)!) };
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  /**
   * Gate mutations on a tag/category row:
   *   - Sysadmins may modify anything.
   *   - Globals (no org) are otherwise read-only.
   *   - Org-scoped labels may only be modified by their original author.
   */
  private assertCanMutateLabel(
    user: AuthenticatedUser,
    row: { createdByUserId: string | null; organisationId: string | null },
  ) {
    if (user.role === 'sysadmin') return;
    if (row.organisationId === null) {
      throw new ForbiddenException('Sysadmin-owned labels are read-only.');
    }
    if (row.createdByUserId !== user.id) {
      throw new ForbiddenException('You can only modify labels you authored.');
    }
  }

  /**
   * Gate using a label for attachment: the label must be visible to the
   * caller — i.e. a sysadmin global, or scoped to one of the caller's
   * organisations. Sysadmins can use anything.
   */
  private assertCanUseLabel(user: AuthenticatedUser, row: { organisationId: string | null }) {
    if (user.role === 'sysadmin') return;
    if (row.organisationId === null) return;
    const userOrgs = new Set(user.memberships.map((m) => m.organisationId));
    if (!userOrgs.has(row.organisationId)) {
      throw new ForbiddenException('Label is not visible to your organisation.');
    }
  }

  /** Sysadmins see everything (null); everyone else is scoped to their org. */
  private scopeOrgFor(user: AuthenticatedUser): string | null {
    return user.role === 'sysadmin' ? null : this.requireUserOrg(user);
  }

  /**
   * Pick the user's "active" organisation for the purpose of owning a newly
   * created org-scoped label. The codebase treats the first membership as
   * the active org (the controller in Task 6 may narrow this further via an
   * `X-Active-Organisation` header or similar mechanism).
   */
  private requireUserOrg(user: AuthenticatedUser): string {
    const orgId = user.memberships[0]?.organisationId;
    if (!orgId) {
      throw new ForbiddenException('User has no active organisation.');
    }
    return orgId;
  }
}
