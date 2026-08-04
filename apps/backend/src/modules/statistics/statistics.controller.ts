import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  StatsTrendQuerySchema,
  type OrganisationStats,
  type PlatformStats,
  type RebuildStatsResponse,
  type StatsTrendResponse,
  type UserStats,
} from '@repo/contracts/statistics';
import { ZodValidationPipe } from 'nestjs-zod';

import { CheckAbility } from '../../infrastructure/ability/check-ability.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { StatisticsService } from './statistics.service.js';

/**
 * Read endpoints — platform / organisation / user statistics + trends.
 *
 * Authorisation is a two-layer split, same pattern as every other
 * `@CheckAbility`-gated controller in this codebase: `@CheckAbility('read',
 * 'Statistics')` only checks that the caller's ability grants `read` on the
 * *subject class* `Statistics` (every authenticated user gets at least one
 * such rule — see `StatisticsAbilityRules`, which grants "read your own
 * user-scoped stats" unconditionally). The actual per-instance decision
 * (can THIS caller read org X's / user Y's stats?) happens inside
 * `StatisticsService`, which calls `AbilityFactory.createForUser` itself and
 * additionally walks the organisation ancestor tree — logic the CASL
 * decorator has no way to express. The controller must not re-implement any
 * of that; it only forwards the caller + params to the service.
 */
@ApiTags('statistics')
@ApiCookieAuth('session')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly service: StatisticsService) {}

  @Get('platform')
  @CheckAbility('read', 'Statistics')
  getPlatform(@CurrentUser() user: AuthenticatedUser): Promise<PlatformStats> {
    return this.service.getPlatformStats(user);
  }

  @Get('organisation/:id')
  @CheckAbility('read', 'Statistics')
  getOrganisation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganisationStats> {
    return this.service.getOrganisationStats(id, user);
  }

  @Get('organisation/:id/trends')
  @CheckAbility('read', 'Statistics')
  getOrganisationTrends(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(StatsTrendQuerySchema))
    query: { metric: string; dimensionKey: string; months: number },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StatsTrendResponse> {
    return this.service.getOrganisationTrends(id, query.metric, query.dimensionKey, query.months, user);
  }

  @Get('user/:id')
  @CheckAbility('read', 'Statistics')
  getUser(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserStats> {
    return this.service.getUserStats(id, user);
  }

  @Get('user/:id/trends')
  @CheckAbility('read', 'Statistics')
  getUserTrends(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(StatsTrendQuerySchema))
    query: { metric: string; dimensionKey: string; months: number },
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StatsTrendResponse> {
    return this.service.getUserTrends(id, query.metric, query.dimensionKey, query.months, user);
  }
}

/**
 * Admin endpoint — force a full `stat_current` rebuild from source tables.
 *
 * Split into its own controller (mirroring `FeatureFlagsAdminController` /
 * `FeatureFlagsPublicController`) rather than adding a `manage`-gated route
 * to `StatisticsController`, so the route table's authorisation boundary
 * (`admin/statistics/*` = sysadmin-only) is visible at the controller/path
 * level, not buried in a per-handler decorator among read routes.
 */
@ApiTags('statistics')
@ApiCookieAuth('session')
@Controller('admin/statistics')
export class StatisticsAdminController {
  constructor(private readonly service: StatisticsService) {}

  @Post('rebuild')
  @HttpCode(HttpStatus.OK)
  @CheckAbility('manage', 'Statistics')
  rebuild(@CurrentUser() user: AuthenticatedUser): Promise<RebuildStatsResponse> {
    return this.service.rebuild(user);
  }
}
