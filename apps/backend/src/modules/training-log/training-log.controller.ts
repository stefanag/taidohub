import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  ListTrainingSessionsQuerySchema,
  type ListTrainingSessionsQuery,
  SaveTrainingSessionSchema,
  type SaveTrainingSessionInput,
  TrainingGoalSchema,
  type TrainingGoal,
  type TrainingSession,
} from '@repo/contracts/training-log';
import { ZodValidationPipe } from 'nestjs-zod';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { RequireFeatureFlag } from '../feature-flags/require-feature-flag.decorator.js';

import { TrainingLogService } from './training-log.service.js';

/**
 * The caller's own training log and goals. Every endpoint is self-scoped:
 * there is no user id in any path. Each endpoint sits behind the
 * `training-log` flag (404 when off; the guard reads method metadata only). Row-level checks for update/delete live in the service.
 */
@ApiTags('training-log')
@ApiCookieAuth('session')
@Controller()
export class TrainingLogController {
  constructor(private readonly service: TrainingLogService) {}

  @Get('training-sessions')
  @RequireFeatureFlag('training-log')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListTrainingSessionsQuerySchema)) query: ListTrainingSessionsQuery,
  ): Promise<TrainingSession[]> {
    return this.service.list(user, query);
  }

  @Post('training-sessions')
  @RequireFeatureFlag('training-log')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SaveTrainingSessionSchema)) input: SaveTrainingSessionInput,
  ): Promise<TrainingSession> {
    return this.service.create(user, input);
  }

  @Put('training-sessions/:id')
  @RequireFeatureFlag('training-log')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SaveTrainingSessionSchema)) input: SaveTrainingSessionInput,
  ): Promise<TrainingSession> {
    return this.service.update(user, id, input);
  }

  @Delete('training-sessions/:id')
  @RequireFeatureFlag('training-log')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.delete(user, id);
  }

  @Get('training-goals/me')
  @RequireFeatureFlag('training-log')
  getGoal(@CurrentUser() user: AuthenticatedUser): Promise<TrainingGoal> {
    return this.service.getGoal(user);
  }

  @Put('training-goals/me')
  @RequireFeatureFlag('training-log')
  setGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(TrainingGoalSchema)) input: TrainingGoal,
  ): Promise<TrainingGoal> {
    return this.service.setGoal(user, input);
  }
}
