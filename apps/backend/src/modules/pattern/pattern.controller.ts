import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  CreatePatternSchema,
  type CreatePatternInput,
  type Pattern,
  UpdatePatternSchema,
  type UpdatePatternInput,
} from '@repo/contracts/patterns';
import { ZodValidationPipe } from 'nestjs-zod';

import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { PatternService } from './pattern.service.js';

/**
 * REST surface for patterns.
 *
 * Authorisation:
 *  - `GET` endpoints rely on the universal `read` CASL rule — any authenticated
 *    user can list and fetch.
 *  - `POST` is gated by `@CheckAbility('create', 'Pattern')` (sysadmin or
 *    orgadmin).
 *  - `PATCH` / `DELETE` are NOT decorated — the row-level check
 *    (`createdByOrganisationId ∈ user's admin-orgs`) is performed inside the
 *    service so it can see the actual row.
 *
 * The controller path is bare — the global `api/` prefix is set in `main.ts`.
 */
@ApiTags('patterns')
@ApiCookieAuth('session')
@Controller('patterns')
export class PatternController {
  constructor(private readonly service: PatternService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classificationIds') classificationIds?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('organisationId') organisationId?: string,
    @Query('strictClassificationIds') strict?: string,
  ): Promise<Pattern[]> {
    return this.service.list(user, {
      classificationIds: classificationIds
        ? classificationIds.split(',').filter(Boolean)
        : [],
      includeInactive: includeInactive === '1',
      organisationId: organisationId ?? null,
      strict: strict === '1',
    });
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<Pattern> {
    return this.service.findOne(user, id);
  }

  @Post()
  @CheckAbility('create', 'Pattern')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreatePatternSchema)) body: CreatePatternInput,
  ): Promise<Pattern> {
    return this.service.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdatePatternSchema)) body: UpdatePatternInput,
  ): Promise<Pattern> {
    return this.service.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.service.delete(user, id);
  }
}
