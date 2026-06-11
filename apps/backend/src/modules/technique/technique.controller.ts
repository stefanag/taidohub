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
  CreateTechniqueSchema,
  type CreateTechniqueInput,
  type Technique,
  UpdateTechniqueSchema,
  type UpdateTechniqueInput,
} from '@repo/contracts/techniques';
import { ZodValidationPipe } from 'nestjs-zod';

import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { TechniqueService } from './technique.service.js';

/**
 * REST surface for techniques.
 *
 * Authorisation:
 *  - `GET` endpoints rely on the universal `read` CASL rule — any authenticated
 *    user can list and fetch.
 *  - `POST` is gated by `@CheckAbility('create', 'Technique')` (sysadmin or
 *    orgadmin).
 *  - `PATCH` / `DELETE` are NOT decorated — the row-level check
 *    (`createdByOrganisationId ∈ user's admin-orgs`) is performed inside the
 *    service so it can see the actual row.
 *
 * The controller path is bare — the global `api/` prefix is set in `main.ts`.
 */
@ApiTags('techniques')
@ApiCookieAuth('session')
@Controller('techniques')
export class TechniqueController {
  constructor(private readonly service: TechniqueService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('classificationIds') classificationIds?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('organisationId') organisationId?: string,
    @Query('strictClassificationIds') strict?: string,
  ): Promise<Technique[]> {
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
  ): Promise<Technique> {
    return this.service.findOne(user, id);
  }

  @Post()
  @CheckAbility('create', 'Technique')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateTechniqueSchema)) body: CreateTechniqueInput,
  ): Promise<Technique> {
    return this.service.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateTechniqueSchema)) body: UpdateTechniqueInput,
  ): Promise<Technique> {
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
