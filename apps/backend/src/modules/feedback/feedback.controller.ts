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
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CreateFeedbackCommentSchema,
  CreateFeedbackThreadSchema,
  GetFeedbackThreadQuerySchema,
  SetFeedbackReactionSchema,
  UpdateFeedbackCommentSchema,
  type CreateFeedbackCommentInput,
  type CreateFeedbackThreadInput,
  type FeedbackComment,
  type FeedbackInboxItem,
  type FeedbackReactionRecord,
  type FeedbackThread,
  type FeedbackUnreadCount,
  type GetFeedbackThreadQuery,
  type SetFeedbackReactionInput,
  type UpdateFeedbackCommentInput,
} from '@repo/contracts/feedback';
import { ZodValidationPipe } from 'nestjs-zod';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { RequireFeatureFlag } from '../feature-flags/require-feature-flag.decorator.js';

import { FeedbackService } from './feedback.service.js';

/**
 * REST surface for the instructor-feedback feature.
 *
 *   - The whole controller is gated by `@RequireFeatureFlag('instructor-
 *     feedback')` — when the flag is off, every route 404s.
 *   - Per-thread access control lives in the service (`canAccessThread`),
 *     not as a CASL decorator, because the rules cross several tables.
 *   - The thread-upsert returns 200 + existing row on a duplicate triple,
 *     201 + new row otherwise. Express's `Response.status()` is used
 *     directly so a single handler can choose between the two; the
 *     return value is `void` because we've already written the body.
 */
@ApiTags('feedback')
@ApiCookieAuth('session')
@RequireFeatureFlag('instructor-feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  // ── Threads ─────────────────────────────────────────────────────────

  @Get('threads')
  async getThread(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(GetFeedbackThreadQuerySchema))
    query: GetFeedbackThreadQuery,
  ): Promise<{ thread: FeedbackThread | null }> {
    const thread = await this.service.getThread(user, query);
    return { thread };
  }

  @Get('threads/student/:studentId')
  async listByStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ): Promise<{ data: FeedbackThread[] }> {
    const data = await this.service.listThreadsByStudent(user, studentId);
    return { data };
  }

  @Post('threads')
  async createThread(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateFeedbackThreadSchema))
    body: CreateFeedbackThreadInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FeedbackThread> {
    const { thread, created } = await this.service.upsertThread(user, body);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return thread;
  }

  // ── Comments ────────────────────────────────────────────────────────

  @Get('threads/:threadId/comments')
  async listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('threadId', new ParseUUIDPipe()) threadId: string,
  ): Promise<{ data: FeedbackComment[] }> {
    const data = await this.service.listComments(user, threadId);
    return { data };
  }

  @Post('threads/:threadId/comments')
  @HttpCode(HttpStatus.CREATED)
  createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('threadId', new ParseUUIDPipe()) threadId: string,
    @Body(new ZodValidationPipe(CreateFeedbackCommentSchema))
    body: CreateFeedbackCommentInput,
  ): Promise<FeedbackComment> {
    return this.service.createComment(user, threadId, body);
  }

  @Patch('comments/:commentId')
  updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Body(new ZodValidationPipe(UpdateFeedbackCommentSchema))
    body: UpdateFeedbackCommentInput,
  ): Promise<FeedbackComment> {
    return this.service.updateComment(user, commentId, body);
  }

  @Delete('comments/:commentId')
  async deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
  ): Promise<{ ok: true }> {
    await this.service.deleteComment(user, commentId);
    return { ok: true };
  }

  // ── Reactions ───────────────────────────────────────────────────────

  @Put('comments/:commentId/reactions')
  setReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Body(new ZodValidationPipe(SetFeedbackReactionSchema))
    body: SetFeedbackReactionInput,
  ): Promise<FeedbackReactionRecord> {
    return this.service.setReaction(user, commentId, body);
  }

  @Delete('comments/:commentId/reactions')
  async removeReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
  ): Promise<{ ok: true }> {
    await this.service.removeReaction(user, commentId);
    return { ok: true };
  }

  // ── Read status + unread count ──────────────────────────────────────

  @Post('threads/:threadId/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('threadId', new ParseUUIDPipe()) threadId: string,
  ): Promise<{ ok: true }> {
    await this.service.markRead(user, threadId);
    return { ok: true };
  }

  @Get('unread-count')
  async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FeedbackUnreadCount> {
    const count = await this.service.unreadCount(user);
    return { count };
  }

  @Get('inbox')
  async inbox(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: FeedbackInboxItem[] }> {
    const data = await this.service.getInbox(user);
    return { data };
  }
}
