import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  SetGradingRequirementsSchema,
  type SetGradingRequirementsInput,
  type GradingRequirements,
} from '@repo/contracts/grading-requirements';
import { ZodValidationPipe } from 'nestjs-zod';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { RankRequirementsService } from './rank-requirements.service.js';

/**
 * REST surface for rank-level grading requirements.
 *
 * Path: `GET|PUT|DELETE /api/requirements/:rankId`
 *
 * Authorisation is entirely delegated to `RankRequirementsService` — this
 * controller is a thin pass-through with input validation only.
 */
@ApiTags('grading-requirements')
@ApiCookieAuth('session')
@Controller('requirements')
export class RankRequirementsController {
  constructor(private readonly svc: RankRequirementsService) {}

  /**
   * Resolve requirements for a rank.
   *
   * - `?setId=<uuid>` — resolve for a specific requirement set scope.
   * - `?forUserId=<uuid>` — resolve for a student via the ancestor-walk.
   * - Neither — resolve for the calling user via the ancestor-walk.
   *
   * `setId` and `forUserId` are mutually exclusive; passing both → 400.
   */
  @Get(':rankId')
  async get(
    @Param('rankId', new ParseUUIDPipe()) rankId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('setId') setId?: string,
    @Query('forUserId') forUserId?: string,
  ): Promise<GradingRequirements> {
    if (setId && forUserId) {
      throw new BadRequestException({
        error: 'setId and forUserId are mutually exclusive',
        code: 'VALIDATION_ERROR',
      });
    }
    if (setId) return this.svc.resolveForSet(rankId, setId, user);
    return this.svc.resolveForUser(rankId, forUserId ?? user.id, user);
  }

  /**
   * Whole-scope replace for a rank within a specific set.
   *
   * Body must include a non-empty `setId`. The service will 400 if it is
   * absent (the Zod schema requires it via `z.string().min(1)`).
   */
  @Put(':rankId')
  async put(
    @Param('rankId', new ParseUUIDPipe()) rankId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SetGradingRequirementsSchema))
    body: SetGradingRequirementsInput,
  ): Promise<GradingRequirements> {
    return this.svc.replace(rankId, body, user);
  }

  /**
   * Clear all requirements for a rank within a specific set scope.
   *
   * `?setId=` is required — omitting it → 400.
   */
  @Delete(':rankId')
  async delete(
    @Param('rankId', new ParseUUIDPipe()) rankId: string,
    @Query('setId') setId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    if (!setId) {
      throw new BadRequestException({
        error: 'setId is required',
        code: 'VALIDATION_ERROR',
      });
    }
    await this.svc.clearForScope(rankId, setId, user);
    return { ok: true };
  }
}
