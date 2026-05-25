import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import type { ShogoTitle } from '@repo/contracts/shogo-titles';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { CreateShogoTitleDto } from './dto/create-shogo-title.dto.js';
import { ShogoTitleDto } from './dto/shogo-title.dto.js';
import { UpdateShogoTitleDto } from './dto/update-shogo-title.dto.js';
import { ShogoTitlesService } from './shogo-titles.service.js';

@ApiTags('shogo-titles')
@ApiCookieAuth('session')
@Controller('shogo-titles')
export class ShogoTitlesController {
  constructor(private readonly shogos: ShogoTitlesService) {}

  @Get()
  @ApiEndpoint({
    summary: 'List shogo titles.',
    operationId: 'ShogoTitlesController_list',
    errorType: ErrorEnvelopeDto,
    errors: ['401'],
  })
  list(): Promise<ShogoTitle[]> {
    return this.shogos.list();
  }

  @Post()
  @CheckAbility('manage', 'ShogoTitle')
  @ApiBody({ type: CreateShogoTitleDto })
  @ApiCreatedResponse({ type: ShogoTitleDto })
  @ApiEndpoint({
    summary: 'Create a shogo title (sysadmin only).',
    operationId: 'ShogoTitlesController_create',
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403'],
  })
  create(
    @Body() body: CreateShogoTitleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShogoTitle> {
    return this.shogos.create(body, user);
  }

  @Patch(':code')
  @CheckAbility('manage', 'ShogoTitle')
  @ApiParam({ name: 'code', description: 'Shogo code.' })
  @ApiBody({ type: UpdateShogoTitleDto })
  @ApiOkResponse({ type: ShogoTitleDto })
  @ApiEndpoint({
    summary: 'Update a shogo title (sysadmin only).',
    operationId: 'ShogoTitlesController_update',
    ok: ShogoTitleDto,
    errorType: ErrorEnvelopeDto,
    errors: ['400', '401', '403', '404'],
  })
  update(
    @Param('code') code: string,
    @Body() body: UpdateShogoTitleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ShogoTitle> {
    return this.shogos.update(code, body, user);
  }

  @Delete(':code')
  @CheckAbility('manage', 'ShogoTitle')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'code', description: 'Shogo code.' })
  @ApiNoContentResponse({ description: 'Shogo title deleted.' })
  @ApiEndpoint({
    summary: 'Delete a shogo title (sysadmin only).',
    operationId: 'ShogoTitlesController_delete',
    errorType: ErrorEnvelopeDto,
    errors: ['401', '403', '404', '409'],
  })
  async remove(@Param('code') code: string): Promise<void> {
    await this.shogos.delete(code);
  }
}
