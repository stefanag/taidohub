import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  ContentTypeSchema,
  type ContentType,
  type Progress,
  UpsertProgressSchema,
  type UpsertProgressInput,
} from '@repo/contracts/progress';
import { ZodValidationPipe } from 'nestjs-zod';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { ProgressService } from './progress.service.js';

/**
 * REST surface for `user_content_progress`.
 *
 * Authorisation:
 *  - Every endpoint is self-scoped — the service stamps `actor.id` on writes
 *    and filters reads to the caller's rows. The CASL conditional `manage
 *    Progress where userId = caller.id` rule enforces the same invariant at
 *    the row level (sysadmin gets unconditional `manage`).
 *  - There is intentionally no `?userId=` query parameter on the list
 *    endpoint — admin tooling for inspecting another user's progress is out
 *    of scope for Phase 3.
 *
 * The controller path is bare — the global `api/` prefix is set in `main.ts`.
 */
@ApiTags('progress')
@ApiCookieAuth('session')
@Controller('progress')
export class ProgressController {
  constructor(private readonly service: ProgressService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('contentType') contentType?: string,
  ): Promise<Progress[]> {
    // Parse the optional query string ourselves — Zod's enum is the canonical
    // validator, so a bad value surfaces as a 400 via the global filter.
    const ct: ContentType | undefined = contentType
      ? ContentTypeSchema.parse(contentType)
      : undefined;
    return this.service.list(user, ct);
  }

  @Get('techniques/:id')
  getTechnique(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Progress> {
    return this.service.findOne(user, 'technique', id);
  }

  @Get('patterns/:id')
  getPattern(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Progress> {
    return this.service.findOne(user, 'pattern', id);
  }

  @Put('techniques/:id')
  upsertTechnique(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpsertProgressSchema)) body: UpsertProgressInput,
  ): Promise<Progress> {
    return this.service.upsert(user, 'technique', id, body);
  }

  @Put('patterns/:id')
  upsertPattern(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpsertProgressSchema)) body: UpsertProgressInput,
  ): Promise<Progress> {
    return this.service.upsert(user, 'pattern', id, body);
  }

  @Delete('techniques/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTechnique(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.service.delete(user, 'technique', id);
  }

  @Delete('patterns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePattern(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.service.delete(user, 'pattern', id);
  }
}
