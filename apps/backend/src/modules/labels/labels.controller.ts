import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  forwardRef,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  CreateCategoryAttachmentSchema,
  CreateCategorySchema,
  CreateTagAttachmentSchema,
  CreateTagSchema,
  TaggableTypeSchema,
  UpdateCategorySchema,
  UpdateTagSchema,
  type CreateCategoryAttachmentInput,
  type CreateCategoryInput,
  type CreateTagAttachmentInput,
  type CreateTagInput,
  type TaggableType,
  type UpdateCategoryInput,
  type UpdateTagInput,
} from '@repo/contracts/labels';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { OrganisationsRepository } from '../organisations/organisations.repository.js';

import { LabelsService } from './labels.service.js';

const TargetQuerySchema = z.object({
  targetType: TaggableTypeSchema,
  targetId: z.string().min(1),
});

const ACTIVE_ORG_HEADER = 'x-active-organisation';

/**
 * REST controller for tags, categories, and their attachments.
 *
 * Active organisation is resolved from the `X-Active-Organisation` header.
 * If the header is absent the controller passes `null` to the service, which
 * rejects non-sysadmin callers (see `LabelsService.assertCanListWithOrg`
 * and `LabelsService.resolveOwningOrg`).
 *
 * Target-side authorisation for attach / list-attachments is performed here
 * because `LabelsService` documents that the controller MUST authorise the
 * target row. Phase A only supports `'organisation'` as a taggable target.
 *
 * `LabelsService.detachAllForTarget` is intentionally not exposed — it is
 * an internal cascade hook for other modules to call when their primary
 * entity is deleted.
 */
@ApiTags('labels')
@ApiCookieAuth('session')
@ApiHeader({
  name: ACTIVE_ORG_HEADER,
  required: false,
  description:
    'Active organisation id. Required for org-scoped list/create requests; sysadmins may omit it to operate across all organisations.',
})
@Controller('api/labels')
export class LabelsController {
  constructor(
    private readonly service: LabelsService,
    private readonly abilityFactory: AbilityFactory,
    @Inject(forwardRef(() => OrganisationsRepository))
    private readonly orgsRepo: OrganisationsRepository,
  ) {}

  // ── Tags ─────────────────────────────────────────────────────────────
  @Get('tags')
  listTags(
    @CurrentUser() user: AuthenticatedUser,
    @Headers(ACTIVE_ORG_HEADER) activeOrg: string | undefined,
  ) {
    return this.service.listTags(user, activeOrg ?? null);
  }

  @Post('tags')
  createTag(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTagSchema)) body: CreateTagInput,
    @Headers(ACTIVE_ORG_HEADER) activeOrg: string | undefined,
  ) {
    return this.service.createTag(user, body, activeOrg ?? null);
  }

  @Patch('tags/:id')
  updateTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTagSchema)) body: UpdateTagInput,
  ) {
    return this.service.updateTag(user, id, body);
  }

  @Delete('tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.service.deleteTag(user, id);
  }

  // ── Categories ───────────────────────────────────────────────────────
  @Get('categories')
  listCategories(
    @CurrentUser() user: AuthenticatedUser,
    @Headers(ACTIVE_ORG_HEADER) activeOrg: string | undefined,
  ) {
    return this.service.listCategories(user, activeOrg ?? null);
  }

  @Post('categories')
  createCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateCategorySchema)) body: CreateCategoryInput,
    @Headers(ACTIVE_ORG_HEADER) activeOrg: string | undefined,
  ) {
    return this.service.createCategory(user, body, activeOrg ?? null);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.service.updateCategory(user, id, body);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.service.deleteCategory(user, id);
  }

  // ── Attachments ──────────────────────────────────────────────────────
  @Get('attachments')
  async listAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(TargetQuerySchema))
    q: z.infer<typeof TargetQuerySchema>,
  ) {
    await this.assertCanReadTarget(user, q.targetType, q.targetId);
    return this.service.listAttachmentsForTarget(user, q.targetType, q.targetId);
  }

  @Post('tag-attachments')
  async attachTag(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTagAttachmentSchema))
    body: CreateTagAttachmentInput,
  ) {
    await this.assertCanManageTarget(user, body.targetType, body.targetId);
    return this.service.attachTag(user, body);
  }

  @Post('category-attachments')
  async attachCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateCategoryAttachmentSchema))
    body: CreateCategoryAttachmentInput,
  ) {
    await this.assertCanManageTarget(user, body.targetType, body.targetId);
    return this.service.attachCategory(user, body);
  }

  @Delete('tag-attachments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  detachTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.service.detachTag(user, id);
  }

  @Delete('category-attachments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  detachCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.service.detachCategory(user, id);
  }

  // ── Target-side authorisation helpers ────────────────────────────────
  /**
   * Phase A supports only `'organisation'` as a taggable target for end-user
   * attach/detach via this controller. Other taggable types (`'user'`,
   * `'rank_history'`) are reserved for Phase B follow-up specs that will add
   * their own controller routes.
   *
   * Uses the same CASL instance-subject construction as `OrganisationsService.assertCan`
   * so per-org `{ id }` rules evaluate correctly. A bare subject-type string
   * would match any user with any `Organisation` rule, defeating per-org scoping.
   */
  private async assertCanManageTarget(
    user: AuthenticatedUser,
    targetType: TaggableType,
    targetId: string,
  ): Promise<void> {
    if (targetType !== 'organisation') {
      throw new BadRequestException(
        'Only organisation targets are supported in this version.',
      );
    }
    const org = await this.orgsRepo.findById(targetId);
    if (!org) throw new NotFoundException('Organisation not found.');
    const ability = this.abilityFactory.createForUser(user);
    const subject = { __caslSubjectType__: 'Organisation', id: org.id } as const;
    if (!ability.can('update', subject)) {
      throw new ForbiddenException('Not allowed to manage this organisation.');
    }
  }

  private async assertCanReadTarget(
    user: AuthenticatedUser,
    targetType: TaggableType,
    targetId: string,
  ): Promise<void> {
    if (targetType !== 'organisation') {
      throw new BadRequestException(
        'Only organisation targets are supported in this version.',
      );
    }
    const org = await this.orgsRepo.findById(targetId);
    if (!org) throw new NotFoundException('Organisation not found.');
    const ability = this.abilityFactory.createForUser(user);
    const subject = { __caslSubjectType__: 'Organisation', id: org.id } as const;
    if (!ability.can('read', subject)) {
      throw new ForbiddenException('Not allowed to read this organisation.');
    }
  }
}
