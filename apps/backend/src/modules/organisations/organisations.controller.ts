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
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type {
  ListOrganisationsResponse,
  Organisation,
} from '@repo/contracts/organisations';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { CreateOrganisationDto } from './dto/create-organisation.dto.js';
import { ListOrganisationsQueryDto } from './dto/list-organisations-query.dto.js';
import { ListOrganisationsResponseDto } from './dto/list-organisations-response.dto.js';
import { OrganisationDto } from './dto/organisation.dto.js';
import { UpdateOrganisationDto } from './dto/update-organisation.dto.js';
import { OrganisationsService } from './organisations.service.js';

@ApiTags('organisations')
@ApiCookieAuth('session')
@Controller('admin/organisations')
export class OrganisationsController {
  constructor(private readonly orgs: OrganisationsService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List organisations (flat).',
    operationId: 'OrganisationsController_list',
    ok: ListOrganisationsResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  list(
    @Query() query: ListOrganisationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListOrganisationsResponse> {
    return this.orgs.list(query, user);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Organisation UUID.' })
  @ApiEndpoint({
    summary: 'Get an organisation by id.',
    operationId: 'OrganisationsController_findOne',
    ok: OrganisationDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Organisation> {
    return this.orgs.findOne(id, user);
  }

  @Post()
  @ApiBody({ type: CreateOrganisationDto })
  @ApiCreatedResponse({ type: OrganisationDto })
  @ApiEndpoint({
    summary: 'Create an organisation.',
    operationId: 'OrganisationsController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403'],
  })
  create(
    @Body() body: CreateOrganisationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Organisation> {
    return this.orgs.create(body, user);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'Organisation UUID.' })
  @ApiBody({ type: UpdateOrganisationDto })
  @ApiOkResponse({ type: OrganisationDto })
  @ApiEndpoint({
    summary: 'Update or move an organisation.',
    operationId: 'OrganisationsController_update',
    ok: OrganisationDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateOrganisationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Organisation> {
    return this.orgs.update(id, body, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Organisation UUID.' })
  @ApiNoContentResponse({ description: 'Organisation deleted.' })
  @ApiEndpoint({
    summary: 'Delete an organisation (must be childless).',
    operationId: 'OrganisationsController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.orgs.delete(id, user);
  }
}
