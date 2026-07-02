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
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  CloneRequirementSetSchema,
  type CloneRequirementSetInput,
  CreateRequirementSetSchema,
  type CreateRequirementSetInput,
  type RequirementSet,
  UpdateRequirementSetSchema,
  type UpdateRequirementSetInput,
} from '@repo/contracts/grading-requirements';
import { ZodValidationPipe } from 'nestjs-zod';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { RequirementSetsService } from './requirement-sets.service.js';

/**
 * REST surface for requirement sets.
 *
 * Authorisation:
 *  - `GET` endpoints rely on the universal `read` CASL rule — any authenticated
 *    user can list and fetch.
 *  - Write endpoints (`POST`, `PATCH`, `DELETE`, and activation) are NOT decorated —
 *    the row-level check (org membership) is performed inside the service so it can
 *    see the actual row and enforce org-level access control.
 *
 * The controller path is bare — the global `api/` prefix is set in `main.ts`.
 */
@ApiTags('requirement-sets')
@ApiCookieAuth('session')
@Controller('requirement-sets')
export class RequirementSetsController {
  constructor(private readonly service: RequirementSetsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<RequirementSet[]> {
    return this.service.list(user);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RequirementSet> {
    return this.service.get(id, user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateRequirementSetSchema)) body: CreateRequirementSetInput,
  ): Promise<RequirementSet> {
    return this.service.create(body, user);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(UpdateRequirementSetSchema)) body: UpdateRequirementSetInput,
  ): Promise<RequirementSet> {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.service.delete(id, user);
  }

  @Post(':id/activate')
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RequirementSet> {
    return this.service.activate(id, user);
  }

  @Post(':id/deactivate')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<RequirementSet> {
    return this.service.deactivate(id, user);
  }

  @Post(':id/clone')
  clone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(CloneRequirementSetSchema)) body: CloneRequirementSetInput,
  ): Promise<RequirementSet> {
    return this.service.clone(id, body, user);
  }
}
