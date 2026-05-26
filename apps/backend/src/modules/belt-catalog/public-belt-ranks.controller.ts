import { Controller, Get, Param } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import type { PublicRankResponse } from '@repo/contracts/ranks';

import { ErrorEnvelopeDto } from '../../common/dto/error-envelope.dto.js';
import { ApiEndpoint } from '../../common/swagger/api-endpoint.decorator.js';
import { Public } from '../../infrastructure/auth/public.decorator.js';

import { BeltRanksService } from './belt-ranks.service.js';
import { PublicRankResponseDto } from './dto/public-rank-response.dto.js';

@ApiTags('public-ranks')
@Controller('public/ranks')
export class PublicBeltRanksController {
  constructor(private readonly ranks: BeltRanksService) {}

  @Get(':slug')
  @Public()
  @ApiParam({ name: 'slug', description: 'URL slug.' })
  @ApiEndpoint({
    summary: 'Public rank lookup by slug. Returns 404 when not publicly visible.',
    operationId: 'PublicBeltRanksController_findBySlug',
    ok: PublicRankResponseDto,
    errorType: ErrorEnvelopeDto,
    errors: ['404'],
  })
  findBySlug(@Param('slug') slug: string): Promise<PublicRankResponse> {
    return this.ranks.findPublicBySlug(slug);
  }
}
