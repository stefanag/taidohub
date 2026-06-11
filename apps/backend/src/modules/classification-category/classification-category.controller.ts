import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  type ClassificationCategory,
  RootCodeSchema,
  type RootCode,
  UpdateClassificationCategorySchema,
  type UpdateClassificationCategoryInput,
} from '@repo/contracts/classification-category';
import { ZodValidationPipe } from 'nestjs-zod';

import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { ClassificationCategoryService } from './classification-category.service.js';

/**
 * Classification-category HTTP surface.
 *
 * - `GET /classification-categories?root=<code>&includeInactive=1` is open to
 *   any authenticated user (the universal-read CASL rule grants `read` on
 *   `ClassificationCategory`). The global `AuthGuard` still rejects anonymous
 *   callers with 401.
 * - `PATCH /classification-categories/:id` is gated by `manage`, which only
 *   `sysadmin` satisfies.
 *
 * The controller path is bare — the global `api/` prefix is set in `main.ts`.
 */
@ApiTags('classification-categories')
@ApiCookieAuth('session')
@Controller('classification-categories')
export class ClassificationCategoryController {
  constructor(private readonly service: ClassificationCategoryService) {}

  @Get()
  list(
    @Query('root', new ZodValidationPipe(RootCodeSchema)) root: RootCode,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<ClassificationCategory[]> {
    return this.service.listByRoot(root, { includeInactive: includeInactive === '1' });
  }

  @Patch(':id')
  @CheckAbility('manage', 'ClassificationCategory')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateClassificationCategorySchema))
    body: UpdateClassificationCategoryInput,
  ): Promise<ClassificationCategory> {
    return this.service.update(user, id, body);
  }
}
