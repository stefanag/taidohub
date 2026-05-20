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
  ListMembershipsResponse,
  OrganisationMembership,
} from '@repo/contracts/memberships';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';

import { CreateMembershipDto } from './dto/create-membership.dto.js';
import { ListMembershipsQueryDto } from './dto/list-memberships-query.dto.js';
import { ListMembershipsResponseDto } from './dto/list-memberships-response.dto.js';
import { OrganisationMembershipDto } from './dto/organisation-membership.dto.js';
import { UpdateMembershipDto } from './dto/update-membership.dto.js';
import { MembershipsService } from './memberships.service.js';

@ApiTags('memberships')
@ApiCookieAuth('session')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List memberships. Non-sysadmins may only filter by their own userId.',
    operationId: 'MembershipsController_list',
    ok: ListMembershipsResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403'],
  })
  list(
    @Query() query: ListMembershipsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ListMembershipsResponse> {
    return this.memberships.list(query, user);
  }

  @Post()
  @CheckAbility('create', 'OrganisationMembership')
  @ApiBody({ type: CreateMembershipDto })
  @ApiCreatedResponse({ type: OrganisationMembershipDto })
  @ApiEndpoint({
    summary: 'Create a membership (sysadmin only).',
    operationId: 'MembershipsController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '409'],
  })
  create(
    @Body() body: CreateMembershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganisationMembership> {
    return this.memberships.create(body, user);
  }

  @Patch(':id')
  @CheckAbility('update', 'OrganisationMembership')
  @ApiParam({ name: 'id', description: 'Membership UUID.' })
  @ApiBody({ type: UpdateMembershipDto })
  @ApiOkResponse({ type: OrganisationMembershipDto })
  @ApiEndpoint({
    summary: 'Change a membership’s role (sysadmin only).',
    operationId: 'MembershipsController_update',
    ok: OrganisationMembershipDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateMembershipDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganisationMembership> {
    return this.memberships.update(id, body, user);
  }

  @Delete(':id')
  @CheckAbility('delete', 'OrganisationMembership')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Membership UUID.' })
  @ApiNoContentResponse({ description: 'Membership deleted.' })
  @ApiEndpoint({
    summary: 'Delete a membership (sysadmin only).',
    operationId: 'MembershipsController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404'],
  })
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.memberships.delete(id, user);
  }
}
