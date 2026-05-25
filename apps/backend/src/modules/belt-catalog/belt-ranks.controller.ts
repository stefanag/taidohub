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
import type { BeltRank } from '@repo/contracts/ranks';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { BeltRankDto } from './dto/belt-rank.dto.js';
import { CreateBeltRankDto } from './dto/create-belt-rank.dto.js';
import { UpdateBeltRankDto } from './dto/update-belt-rank.dto.js';
import { BeltRanksService } from './belt-ranks.service.js';

@ApiTags('belt-ranks')
@ApiCookieAuth('session')
@Controller('ranks')
export class BeltRanksController {
  constructor(private readonly ranks: BeltRanksService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List belt ranks.',
    operationId: 'BeltRanksController_list',
    errorType: ErrorEnvelopeDto,
    errors: ['401'],
  })
  list(): Promise<BeltRank[]> {
    return this.ranks.list();
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Rank UUID.' })
  @ApiEndpoint({
    summary: 'Get a single rank.',
    operationId: 'BeltRanksController_findOne',
    ok: BeltRankDto,
    errorType: ErrorEnvelopeDto,
    errors: ['401', '404'],
  })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<BeltRank> {
    return this.ranks.findById(id);
  }

  @Post()
  @CheckAbility('manage', 'BeltRank')
  @ApiBody({ type: CreateBeltRankDto })
  @ApiCreatedResponse({ type: BeltRankDto })
  @ApiEndpoint({
    summary: 'Create a rank (sysadmin only).',
    operationId: 'BeltRanksController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '409'],
  })
  create(
    @Body() body: CreateBeltRankDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BeltRank> {
    return this.ranks.create(body, user);
  }

  @Patch(':id')
  @CheckAbility('manage', 'BeltRank')
  @ApiParam({ name: 'id', description: 'Rank UUID.' })
  @ApiBody({ type: UpdateBeltRankDto })
  @ApiOkResponse({ type: BeltRankDto })
  @ApiEndpoint({
    summary: 'Update a rank (sysadmin only).',
    operationId: 'BeltRanksController_update',
    ok: BeltRankDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404', '409'],
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateBeltRankDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BeltRank> {
    return this.ranks.update(id, body, user);
  }

  @Delete(':id')
  @CheckAbility('manage', 'BeltRank')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', description: 'Rank UUID.' })
  @ApiNoContentResponse({ description: 'Rank deleted.' })
  @ApiEndpoint({
    summary: 'Delete a rank (sysadmin only).',
    operationId: 'BeltRanksController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.ranks.delete(id);
  }
}
