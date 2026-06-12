import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  type Progress,
  UpsertInstructorProgressSchema,
  type UpsertInstructorProgressInput,
} from '@repo/contracts/progress';
import type { StudentRosterRow } from '@repo/contracts/students';
import { ZodValidationPipe } from 'nestjs-zod';

import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';

import { StudentsService } from './students.service.js';

/**
 * Instructor view of students.
 *
 *  - `GET /api/me/memberships` is colocated here so it sits alongside the
 *    students routes (no extra controller). The route path is intentionally
 *    bare — the global `/api` prefix is set in `main.ts`.
 *  - All write endpoints touch `instructor_notes` only; `student_notes` is
 *    untouched (enforced inside `ProgressService.upsertOnBehalfOf`).
 *  - Row-level authorisation runs in `StudentsService.assertCanManageStudent`
 *    using the `Student` CASL subject.
 */
@ApiTags('students')
@ApiCookieAuth('session')
@Controller()
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get('me/memberships')
  myMemberships(
    @CurrentUser() user: AuthenticatedUser,
  ): { organisationId: string; role: string }[] {
    return user.memberships.map((m) => ({
      organisationId: m.organisationId,
      role: m.role,
    }));
  }

  @Get('students')
  list(@CurrentUser() user: AuthenticatedUser): Promise<StudentRosterRow[]> {
    return this.service.listRoster(user);
  }

  @Get('students/:userId/progress')
  getStudentProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<Progress[]> {
    return this.service.getStudentProgress(user, userId);
  }

  @Put('students/:userId/progress/techniques/:contentId')
  upsertTechnique(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body(new ZodValidationPipe(UpsertInstructorProgressSchema))
    body: UpsertInstructorProgressInput,
  ): Promise<Progress> {
    return this.service.upsertStudentProgress(
      user,
      userId,
      'technique',
      contentId,
      body,
    );
  }

  @Put('students/:userId/progress/patterns/:contentId')
  upsertPattern(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body(new ZodValidationPipe(UpsertInstructorProgressSchema))
    body: UpsertInstructorProgressInput,
  ): Promise<Progress> {
    return this.service.upsertStudentProgress(
      user,
      userId,
      'pattern',
      contentId,
      body,
    );
  }

  @Delete('students/:userId/progress/techniques/:contentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTechnique(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<void> {
    return this.service.deleteStudentProgress(
      user,
      userId,
      'technique',
      contentId,
    );
  }

  @Delete('students/:userId/progress/patterns/:contentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePattern(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<void> {
    return this.service.deleteStudentProgress(
      user,
      userId,
      'pattern',
      contentId,
    );
  }
}
