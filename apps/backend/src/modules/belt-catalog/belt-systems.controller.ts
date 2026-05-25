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
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { BeltSystem } from '@repo/contracts/belt-systems';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { BeltSystemDto } from './dto/belt-system.dto.js';
import { CreateBeltSystemDto } from './dto/create-belt-system.dto.js';
import { UpdateBeltSystemDto } from './dto/update-belt-system.dto.js';
import { BeltSystemsService } from './belt-systems.service.js';

@ApiTags('belt-systems')
@ApiCookieAuth('session')
@Controller('belt-systems')
export class BeltSystemsController {
  constructor(private readonly systems: BeltSystemsService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List belt systems.',
    operationId: 'BeltSystemsController_list',
    errorType: ErrorEnvelopeDto,
    errors: ['401'],
  })
  list(): Promise<BeltSystem[]> {
    return this.systems.list();
  }

  @Post()
  @CheckAbility('manage', 'BeltSystem')
  @ApiBody({ type: CreateBeltSystemDto })
  @ApiCreatedResponse({ type: BeltSystemDto })
  @ApiEndpoint({
    summary: 'Create a belt system (sysadmin only).',
    operationId: 'BeltSystemsController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403'],
  })
  create(
    @Body() body: CreateBeltSystemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BeltSystem> {
    return this.systems.create(body, user);
  }

  @Patch(':id')
  @CheckAbility('manage', 'BeltSystem')
  @ApiParam({ name: 'id', description: 'Belt system UUID.' })
  @ApiBody({ type: UpdateBeltSystemDto })
  @ApiOkResponse({ type: BeltSystemDto })
  @ApiEndpoint({
    summary: 'Update a belt system (sysadmin only).',
    operationId: 'BeltSystemsController_update',
    ok: BeltSystemDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateBeltSystemDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BeltSystem> {
    return this.systems.update(id, body, user);
  }

  @Delete(':id')
  @CheckAbility('manage', 'BeltSystem')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Belt system UUID.' })
  @ApiNoContentResponse({ description: 'Belt system deleted.' })
  @ApiEndpoint({
    summary: 'Delete a belt system (sysadmin only).',
    operationId: 'BeltSystemsController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.systems.delete(id);
  }
}
