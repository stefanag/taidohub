import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { LabelsRepository, type CategoryRow, type TagRow } from './labels.repository.js';
import { LabelsService } from './labels.service.js';

function userFixture(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u-1',
    email: 'u-1@example.com',
    emailVerified: true,
    name: 'User One',
    image: null,
    role: 'user',
    locale: 'en',
    deactivatedAt: null,
    memberships: [{ organisationId: 'org-1', role: 'orgadmin' }],
    ...overrides,
  } as AuthenticatedUser;
}

function tagRow(overrides: Partial<TagRow> = {}): TagRow {
  return {
    id: 't-1',
    organisationId: 'org-1',
    name: 'rookie',
    createdByUserId: 'u-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TagRow;
}

function categoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'c-1',
    organisationId: 'org-1',
    parentId: null,
    name: 'Region',
    createdByUserId: 'u-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CategoryRow;
}

describe('LabelsService', () => {
  let repo: { [K in keyof LabelsRepository]: ReturnType<typeof vi.fn> };
  let service: LabelsService;

  beforeEach(() => {
    repo = {
      listVisibleTags: vi.fn(),
      findTagById: vi.fn(),
      insertTag: vi.fn(),
      updateTagName: vi.fn(),
      deleteTag: vi.fn(),
      listVisibleCategories: vi.fn(),
      findCategoryById: vi.fn(),
      listCategoryChildren: vi.fn(),
      insertCategory: vi.fn(),
      updateCategoryName: vi.fn(),
      deleteCategory: vi.fn(),
      listTagAttachmentsByTarget: vi.fn(),
      listCategoryAttachmentsByTarget: vi.fn(),
      insertTagAttachment: vi.fn(),
      insertCategoryAttachment: vi.fn(),
      deleteTagAttachment: vi.fn(),
      deleteCategoryAttachment: vi.fn(),
      findTagAttachmentById: vi.fn(),
      findCategoryAttachmentById: vi.fn(),
      detachAllForTarget: vi.fn(),
      targetsWithAllTags: vi.fn(),
      targetsWithAllCategories: vi.fn(),
    };
    service = new LabelsService(repo as unknown as LabelsRepository);
  });

  describe('createTag', () => {
    it('creates an org-scoped tag for a regular user', async () => {
      repo.insertTag.mockResolvedValue(tagRow());
      await service.createTag(userFixture(), { name: 'rookie', global: false }, 'org-1');
      expect(repo.insertTag).toHaveBeenCalledWith({
        organisationId: 'org-1',
        name: 'rookie',
        createdByUserId: 'u-1',
      });
    });

    it('forbids a regular user from creating a global tag', async () => {
      await expect(
        service.createTag(userFixture(), { name: 'rookie', global: true }, null),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a sysadmin to create a global tag (organisationId: null)', async () => {
      repo.insertTag.mockResolvedValue(tagRow({ organisationId: null }));
      await service.createTag(
        userFixture({ role: 'sysadmin', memberships: [] }),
        { name: 'honorary', global: true },
        null,
      );
      expect(repo.insertTag).toHaveBeenCalledWith({
        organisationId: null,
        name: 'honorary',
        createdByUserId: 'u-1',
      });
    });

    it('forbids creating an org-scoped tag when the user is not a member of the active org', async () => {
      await expect(
        service.createTag(
          userFixture({ memberships: [{ organisationId: 'org-1', role: 'orgadmin' }] }),
          { name: 'rookie', global: false },
          'org-2',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('updateTag', () => {
    it('forbids a regular user from editing a sysadmin global', async () => {
      repo.findTagById.mockResolvedValue(
        tagRow({ organisationId: null, createdByUserId: 'u-admin' }),
      );
      await expect(
        service.updateTag(userFixture(), 't-1', { name: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("forbids a regular user from editing another user's org tag", async () => {
      repo.findTagById.mockResolvedValue(tagRow({ createdByUserId: 'other' }));
      await expect(
        service.updateTag(userFixture(), 't-1', { name: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the author to edit their own tag', async () => {
      repo.findTagById.mockResolvedValue(tagRow());
      repo.updateTagName.mockResolvedValue(tagRow({ name: 'renamed' }));
      const out = await service.updateTag(userFixture(), 't-1', { name: 'renamed' });
      expect(out.name).toBe('renamed');
    });

    it('allows a sysadmin to edit any tag (including globals)', async () => {
      repo.findTagById.mockResolvedValue(
        tagRow({ organisationId: null, createdByUserId: 'u-other' }),
      );
      repo.updateTagName.mockResolvedValue(
        tagRow({ organisationId: null, createdByUserId: 'u-other', name: 'renamed' }),
      );
      const out = await service.updateTag(
        userFixture({ role: 'sysadmin', memberships: [] }),
        't-1',
        { name: 'renamed' },
      );
      expect(out.name).toBe('renamed');
    });

    it('404s when the tag does not exist', async () => {
      repo.findTagById.mockResolvedValue(undefined);
      await expect(
        service.updateTag(userFixture(), 't-missing', { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forbids the original author from editing a tag they no longer have access to (left org)', async () => {
      // Tag is scoped to org-2 and was authored by u-1.
      repo.findTagById.mockResolvedValue(tagRow({ organisationId: 'org-2' }));
      // u-1 is no longer a member of org-2.
      await expect(
        service.updateTag(
          userFixture({ memberships: [{ organisationId: 'org-1', role: 'orgadmin' }] }),
          't-1',
          { name: 'x' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createCategory', () => {
    it('rejects creating a grandchild (parent already has a parent)', async () => {
      repo.findCategoryById.mockResolvedValue(categoryRow({ parentId: 'c-root' }));
      await expect(
        service.createCategory(
          userFixture(),
          { name: 'x', parentId: 'c-1', global: false },
          'org-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a child of a top-level category', async () => {
      repo.findCategoryById.mockResolvedValue(categoryRow({ id: 'c-root', parentId: null }));
      repo.insertCategory.mockResolvedValue(categoryRow({ parentId: 'c-root' }));
      await service.createCategory(
        userFixture(),
        {
          name: 'Stockholm',
          parentId: 'c-root',
          global: false,
        },
        'org-1',
      );
      expect(repo.insertCategory).toHaveBeenCalledWith({
        organisationId: 'org-1',
        parentId: 'c-root',
        name: 'Stockholm',
        createdByUserId: 'u-1',
      });
    });

    it('400s when the named parent does not exist', async () => {
      repo.findCategoryById.mockResolvedValue(undefined);
      await expect(
        service.createCategory(
          userFixture(),
          {
            name: 'x',
            parentId: 'c-missing',
            global: false,
          },
          'org-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forbids a regular user from creating a global category', async () => {
      await expect(
        service.createCategory(
          userFixture(),
          { name: 'x', parentId: null, global: true },
          null,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects creating a child whose parent is in another organisation', async () => {
      repo.findCategoryById.mockResolvedValue(categoryRow({ organisationId: 'org-2' }));
      await expect(
        service.createCategory(
          userFixture({ memberships: [{ organisationId: 'org-1', role: 'orgadmin' }] }),
          { name: 'Stockholm', parentId: 'c-1', global: false },
          'org-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('attachTag', () => {
    it('forbids attaching a tag from another organisation', async () => {
      repo.findTagById.mockResolvedValue(tagRow({ organisationId: 'org-2' }));
      await expect(
        service.attachTag(userFixture(), {
          tagId: 't-1',
          targetType: 'organisation',
          targetId: 'org-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows attaching a sysadmin-owned global to an own-org target', async () => {
      repo.findTagById.mockResolvedValue(tagRow({ organisationId: null }));
      repo.insertTagAttachment.mockResolvedValue({
        id: 'a-1',
        tagId: 't-1',
        targetType: 'organisation',
        targetId: 'org-1',
        attachedByUserId: 'u-1',
        attachedAt: new Date(),
      });
      const out = await service.attachTag(userFixture(), {
        tagId: 't-1',
        targetType: 'organisation',
        targetId: 'org-1',
      });
      expect(out.targetId).toBe('org-1');
    });

    it('is idempotent — duplicate attach returns the existing row', async () => {
      repo.findTagById.mockResolvedValue(tagRow());
      const existing = {
        id: 'a-existing',
        tagId: 't-1',
        targetType: 'organisation' as const,
        targetId: 'org-1',
        attachedByUserId: 'u-1',
        attachedAt: new Date(),
      };
      repo.insertTagAttachment.mockResolvedValue(existing);
      const out = await service.attachTag(userFixture(), {
        tagId: 't-1',
        targetType: 'organisation',
        targetId: 'org-1',
      });
      expect(out.id).toBe('a-existing');
    });

    it('404s when the tag does not exist', async () => {
      repo.findTagById.mockResolvedValue(undefined);
      await expect(
        service.attachTag(userFixture(), {
          tagId: 't-missing',
          targetType: 'organisation',
          targetId: 'org-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('detachTag', () => {
    it('allows the user who attached it to detach', async () => {
      repo.findTagAttachmentById.mockResolvedValue({
        id: 'a-1',
        tagId: 't-1',
        targetType: 'organisation',
        targetId: 'org-1',
        attachedByUserId: 'u-1',
        attachedAt: new Date(),
      });
      await service.detachTag(userFixture(), 'a-1');
      expect(repo.deleteTagAttachment).toHaveBeenCalledWith('a-1');
    });

    it('forbids another user from detaching', async () => {
      repo.findTagAttachmentById.mockResolvedValue({
        id: 'a-1',
        tagId: 't-1',
        targetType: 'organisation',
        targetId: 'org-1',
        attachedByUserId: 'u-other',
        attachedAt: new Date(),
      });
      await expect(service.detachTag(userFixture(), 'a-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows a sysadmin to detach anyone’s attachment', async () => {
      repo.findTagAttachmentById.mockResolvedValue({
        id: 'a-1',
        tagId: 't-1',
        targetType: 'organisation',
        targetId: 'org-1',
        attachedByUserId: 'u-other',
        attachedAt: new Date(),
      });
      await service.detachTag(
        userFixture({ role: 'sysadmin', memberships: [] }),
        'a-1',
      );
      expect(repo.deleteTagAttachment).toHaveBeenCalledWith('a-1');
    });
  });

  describe('detachAllForTarget', () => {
    it('delegates straight to the repository', async () => {
      await service.detachAllForTarget('organisation', 'org-1');
      expect(repo.detachAllForTarget).toHaveBeenCalledWith('organisation', 'org-1');
    });
  });

  describe('filterTargetsByLabels', () => {
    it('returns undefined when no filter is supplied', async () => {
      const out = await service.filterTargetsByLabels('organisation', {});
      expect(out.targetIds).toBeUndefined();
    });

    it('intersects tag and category result sets', async () => {
      repo.targetsWithAllTags.mockResolvedValue(['o-1', 'o-2', 'o-3']);
      repo.targetsWithAllCategories.mockResolvedValue(['o-2', 'o-3', 'o-4']);
      const out = await service.filterTargetsByLabels('organisation', {
        tagIds: ['t-1'],
        categoryIds: ['c-1'],
      });
      expect(out.targetIds?.sort()).toEqual(['o-2', 'o-3']);
    });

    it('returns only tag matches when no category filter is set', async () => {
      repo.targetsWithAllTags.mockResolvedValue(['o-1', 'o-2']);
      const out = await service.filterTargetsByLabels('organisation', { tagIds: ['t-1'] });
      expect(out.targetIds?.sort()).toEqual(['o-1', 'o-2']);
      expect(repo.targetsWithAllCategories).not.toHaveBeenCalled();
    });

    it('returns only category matches when no tag filter is set', async () => {
      repo.targetsWithAllCategories.mockResolvedValue(['o-3']);
      const out = await service.filterTargetsByLabels('organisation', { categoryIds: ['c-1'] });
      expect(out.targetIds).toEqual(['o-3']);
      expect(repo.targetsWithAllTags).not.toHaveBeenCalled();
    });
  });

  describe('listTags / listCategories visibility guard', () => {
    it('forbids a regular user from listing with activeOrganisationId=null', async () => {
      await expect(
        service.listTags(userFixture(), null),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.listCategories(userFixture(), null),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows sysadmin to list with activeOrganisationId=null', async () => {
      repo.listVisibleTags.mockResolvedValue([]);
      repo.listVisibleCategories.mockResolvedValue([]);
      await service.listTags(userFixture({ role: 'sysadmin' }), null);
      await service.listCategories(userFixture({ role: 'sysadmin' }), null);
      expect(repo.listVisibleTags).toHaveBeenCalledWith(null);
      expect(repo.listVisibleCategories).toHaveBeenCalledWith(null);
    });

    it('forbids listing with an organisation the user is not a member of', async () => {
      await expect(
        service.listTags(
          userFixture({ memberships: [{ organisationId: 'org-1', role: 'orgadmin' }] }),
          'org-2',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows listing with one of the user’s own organisations', async () => {
      repo.listVisibleTags.mockResolvedValue([]);
      await service.listTags(
        userFixture({ memberships: [{ organisationId: 'org-1', role: 'orgadmin' }] }),
        'org-1',
      );
      expect(repo.listVisibleTags).toHaveBeenCalledWith('org-1');
    });
  });
});
