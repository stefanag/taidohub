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
 *   - Org-scoped labels are editable only by their author, or by a sysadmin,
 *     AND only while the author still belongs to the owning organisation.
 *   - Categories are limited to one level of nesting (a parent must itself be a root).
 *   - Attaching a label requires the label to be visible to the caller — i.e.
 *     scoped to one of their organisations, or a global.
 *   - Detaching is allowed for the user who attached it, or for a sysadmin.
 *
 * HTTP authorization (who can call any of these methods at all) lives in CASL
 * abilities and is enforced by the controller (Task 6); this layer encodes
 * the per-row business rules.
 *
 * The active organisation for create/list calls is supplied explicitly by the
 * controller (typically resolved from an `X-Active-Organisation` header or
 * session). The service then asserts the caller actually belongs to it.
 */
@Injectable()
export class LabelsService {
  constructor(private readonly repo: LabelsRepository) {}

  // ── Tags ───────────────────────────────────────────────────────────────
  async listTags(
    user: AuthenticatedUser,
    activeOrganisationId: string | null,
  ): Promise<TagRow[]> {
    void user;
    return this.repo.listVisibleTags(activeOrganisationId);
  }

  async createTag(
    user: AuthenticatedUser,
    input: CreateTagInput,
    activeOrganisationId: string | null,
  ): Promise<TagRow> {
    const organisationId = this.resolveOwningOrg(user, input.global ?? false, activeOrganisationId);
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
  async listCategories(
    user: AuthenticatedUser,
    activeOrganisationId: string | null,
  ): Promise<CategoryRow[]> {
    void user;
    return this.repo.listVisibleCategories(activeOrganisationId);
  }

  async createCategory(
    user: AuthenticatedUser,
    input: CreateCategoryInput,
    activeOrganisationId: string | null,
  ): Promise<CategoryRow> {
    const organisationId = this.resolveOwningOrg(user, input.global ?? false, activeOrganisationId);
    if (input.parentId) {
      const parent = await this.repo.findCategoryById(input.parentId);
      if (!parent) throw new BadRequestException('Parent category does not exist.');
      if (parent.parentId !== null) {
        throw new BadRequestException('Categories may not nest deeper than one level.');
      }
      // Parent must be visible to the caller — either a sysadmin-owned global
      // or scoped to one of the caller's organisations.
      if (parent.organisationId !== null) {
        const userOrgs = new Set(user.memberships.map((m) => m.organisationId));
        if (!userOrgs.has(parent.organisationId)) {
          throw new ForbiddenException('Parent category is not visible to your organisation.');
        }
      }
    }
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
   * **CONTROLLER MUST AUTHORIZE THE TARGET BEFORE CALLING.** This method
   * returns label attachments without verifying that the caller has read
   * access to `(targetType, targetId)`. The CALLER is responsible for
   * confirming the user can read the target row — typically via
   * `ability.can('read', targetSubject)` — prior to invocation.
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

  /**
   * **CONTROLLER MUST AUTHORIZE THE TARGET BEFORE CALLING.** This method
   * validates only label-side visibility (that the user can use the tag).
   * The CALLER is responsible for verifying that the user has write/manage
   * permission on the target row referenced by `(targetType, targetId)` —
   * typically via `ability.can('update', targetSubject)`.
   */
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

  /**
   * **CONTROLLER MUST AUTHORIZE THE TARGET BEFORE CALLING.** This method
   * validates only label-side visibility (that the user can use the category).
   * The CALLER is responsible for verifying that the user has write/manage
   * permission on the target row referenced by `(targetType, targetId)` —
   * typically via `ability.can('update', targetSubject)`.
   */
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

  /**
   * Cascade hook called by other modules when their primary entity is deleted.
   * The CALLING MODULE is responsible for authorising the target deletion
   * before invoking this. **DO NOT expose this method directly via the
   * controller** — it has no principal check.
   */
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
   *   - Org-scoped labels may only be modified by their original author AND
   *     only while the author is still a member of the owning organisation
   *     (so leaving the org revokes the privilege).
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
    const userOrgs = new Set(user.memberships.map((m) => m.organisationId));
    if (!userOrgs.has(row.organisationId)) {
      throw new ForbiddenException('Label is not visible to your organisation.');
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

  /**
   * Resolve and authorise the owning organisation for a newly-created label.
   *
   * - `wantsGlobal` requires the caller be a sysadmin and resolves to `null`.
   * - Otherwise the controller MUST supply the active organisation explicitly
   *   (no implicit "first membership" fallback), and the caller MUST be a
   *   member of it.
   */
  private resolveOwningOrg(
    user: AuthenticatedUser,
    wantsGlobal: boolean,
    activeOrganisationId: string | null,
  ): string | null {
    if (wantsGlobal) {
      if (user.role !== 'sysadmin') {
        throw new ForbiddenException('Only sysadmins can create global labels.');
      }
      return null;
    }
    if (!activeOrganisationId) {
      throw new BadRequestException('Active organisation is required for org-scoped labels.');
    }
    const userOrgs = new Set(user.memberships.map((m) => m.organisationId));
    if (!userOrgs.has(activeOrganisationId)) {
      throw new ForbiddenException('You are not a member of that organisation.');
    }
    return activeOrganisationId;
  }
}
