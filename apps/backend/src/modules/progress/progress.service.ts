import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ContentType,
  Progress,
  UpsertInstructorProgressInput,
  UpsertProgressInput,
} from '@repo/contracts/progress';
import { eq } from 'drizzle-orm';

import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';
import {
  DRIZZLE,
  type DrizzleDb,
} from '../../infrastructure/database/client.js';
import { pattern } from '../../infrastructure/database/schema/pattern.js';
import { technique } from '../../infrastructure/database/schema/technique.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';

import {
  ProgressRepository,
  type NewProgressRow,
  type ProgressRow,
} from './progress.repository.js';

/**
 * Business logic for `user_content_progress`.
 *
 * Authorisation:
 *  - All endpoints are self-scoped: any authenticated user can `manage` rows
 *    whose `userId` matches their own. Sysadmin manages every row.
 *  - The `list` endpoint always filters by `actor.id` at the SQL level — the
 *    CASL conditional rule is belt-and-braces for instance-level checks.
 *  - `findOne` / `upsert` / `delete` also run the row through
 *    {@link AbilityFactory} so a non-sysadmin cannot poke at another user's
 *    row even if they somehow obtain the id.
 *
 * Mutations always run inside a Drizzle transaction so the data row and the
 * audit-log row commit (or roll back) together. The `upsert` flow validates
 * that the referenced technique / pattern exists BEFORE opening the tx so the
 * 404 short-circuits cleanly without a half-open transaction.
 */
@Injectable()
export class ProgressService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly repo: ProgressRepository,
    private readonly audit: AuditLogService,
    private readonly abilities: AbilityFactory,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────
  async list(
    actor: AuthenticatedUser,
    contentType?: ContentType,
  ): Promise<Progress[]> {
    // Self-scoped — Phase 3 spec explicitly forbids exposing `?userId=` here.
    const rows = await this.repo.listByUser(actor.id, contentType);
    return rows.map((r) => this.toApi(r));
  }

  async findOne(
    actor: AuthenticatedUser,
    contentType: ContentType,
    contentId: string,
  ): Promise<Progress> {
    const row = await this.repo.findByUserAndContent(
      actor.id,
      contentType,
      contentId,
    );
    if (!row) {
      throw new NotFoundException({
        error: {
          code: 'NOT_FOUND',
          message: `No progress recorded for ${contentType} ${contentId}.`,
        },
      });
    }
    this.assertCanManage(actor, row);
    return this.toApi(row);
  }

  // ── Mutations ────────────────────────────────────────────────────────
  async upsert(
    actor: AuthenticatedUser,
    contentType: ContentType,
    contentId: string,
    input: UpsertProgressInput,
  ): Promise<Progress> {
    await this.assertContentExists(contentType, contentId);

    return this.db.transaction(async (tx) => {
      const existing = await this.repo.findByUserAndContent(
        actor.id,
        contentType,
        contentId,
        tx,
      );
      const now = new Date();

      let row: ProgressRow;
      let action: 'create' | 'update';
      let before: ProgressRow | null;

      if (existing) {
        before = existing;
        action = 'update';
        row = await this.repo.update(
          existing.id,
          {
            status: input.status,
            studentNotes: input.studentNotes ?? '',
            lastPracticedAt: input.lastPracticedAt ?? null,
            updatedAt: now,
          },
          tx,
        );
      } else {
        before = null;
        action = 'create';
        const insertInput: NewProgressRow = {
          userId: actor.id,
          contentType,
          techniqueId: contentType === 'technique' ? contentId : null,
          patternId: contentType === 'pattern' ? contentId : null,
          status: input.status,
          studentNotes: input.studentNotes ?? '',
          instructorNotes: '',
          lastPracticedAt: input.lastPracticedAt ?? null,
        };
        row = await this.repo.insert(insertInput, tx);
      }

      this.assertCanManage(actor, row);

      await this.audit.record({
        tx,
        entityType: 'progress',
        entityId: row.id,
        action,
        userId: actor.id,
        impersonatedById: actor.impersonatedBy ?? null,
        actingUserId: null,
        before: before ? this.snapshot(before) : null,
        after: this.snapshot(row),
      });

      return this.toApi(row);
    });
  }

  async delete(
    actor: AuthenticatedUser,
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    const row = await this.repo.findByUserAndContent(
      actor.id,
      contentType,
      contentId,
    );
    if (!row) {
      throw new NotFoundException({
        error: {
          code: 'NOT_FOUND',
          message: `No progress recorded for ${contentType} ${contentId}.`,
        },
      });
    }
    this.assertCanManage(actor, row);

    await this.db.transaction(async (tx) => {
      await this.repo.delete(row.id, tx);
      await this.audit.record({
        tx,
        entityType: 'progress',
        entityId: row.id,
        action: 'delete',
        userId: actor.id,
        impersonatedById: actor.impersonatedBy ?? null,
        actingUserId: null,
        before: this.snapshot(row),
        after: null,
      });
    });
  }

  // ── On-behalf-of mutations ───────────────────────────────────────────
  /**
   * Upsert a progress row on behalf of a student. Used by the instructor
   * view (Phase 3.5) — touches `instructor_notes` only and never
   * `student_notes`. CASL row-level checks are NOT applied here: the caller
   * (StudentsService) owns row-level authorisation via the `Student` subject
   * before delegating to this method.
   */
  async upsertOnBehalfOf(
    actor: AuthenticatedUser,
    subjectUserId: string,
    contentType: ContentType,
    contentId: string,
    input: UpsertInstructorProgressInput,
  ): Promise<Progress> {
    await this.assertContentExists(contentType, contentId);

    return this.db.transaction(async (tx) => {
      const existing = await this.repo.findByUserAndContent(
        subjectUserId,
        contentType,
        contentId,
        tx,
      );
      const now = new Date();

      let row: ProgressRow;
      let action: 'create' | 'update';
      let before: ProgressRow | null;

      if (existing) {
        before = existing;
        action = 'update';
        row = await this.repo.update(
          existing.id,
          {
            status: input.status,
            instructorNotes: input.instructorNotes ?? '',
            lastPracticedAt: input.lastPracticedAt ?? null,
            updatedAt: now,
          },
          tx,
        );
      } else {
        before = null;
        action = 'create';
        const insertInput: NewProgressRow = {
          userId: subjectUserId,
          contentType,
          techniqueId: contentType === 'technique' ? contentId : null,
          patternId: contentType === 'pattern' ? contentId : null,
          status: input.status,
          studentNotes: '',
          instructorNotes: input.instructorNotes ?? '',
          lastPracticedAt: input.lastPracticedAt ?? null,
        };
        row = await this.repo.insert(insertInput, tx);
      }

      await this.audit.record({
        tx,
        entityType: 'progress',
        entityId: row.id,
        action,
        userId: subjectUserId,
        impersonatedById: actor.impersonatedBy ?? null,
        actingUserId: actor.id,
        before: before ? this.snapshot(before) : null,
        after: this.snapshot(row),
      });

      return this.toApi(row);
    });
  }

  /**
   * Delete a student's progress row on behalf of them. Mirrors
   * {@link upsertOnBehalfOf} — CASL row-level checks are NOT applied here,
   * because the caller (StudentsService) owns row-level authorisation.
   */
  async deleteOnBehalfOf(
    actor: AuthenticatedUser,
    subjectUserId: string,
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    const row = await this.repo.findByUserAndContent(
      subjectUserId,
      contentType,
      contentId,
    );
    if (!row) {
      throw new NotFoundException({
        error: {
          code: 'NOT_FOUND',
          message: `No progress recorded for ${contentType} ${contentId}.`,
        },
      });
    }

    await this.db.transaction(async (tx) => {
      await this.repo.delete(row.id, tx);
      await this.audit.record({
        tx,
        entityType: 'progress',
        entityId: row.id,
        action: 'delete',
        userId: subjectUserId,
        impersonatedById: actor.impersonatedBy ?? null,
        actingUserId: actor.id,
        before: this.snapshot(row),
        after: null,
      });
    });
  }

  // ── Internals ────────────────────────────────────────────────────────
  /**
   * Row-level write check. The conditional `manage Progress where userId =
   * caller.id` rule scopes regular users to their own rows; sysadmin sees
   * an unconditional `manage` and always passes.
   */
  private assertCanManage(actor: AuthenticatedUser, row: ProgressRow): void {
    const ability = this.abilities.createForUser(actor);
    const subj = {
      __caslSubjectType__: 'Progress' as const,
      userId: row.userId,
    };
    if (ability.cannot('manage', subj)) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot manage this progress row.',
        },
      });
    }
  }

  /**
   * Surface a 404 with the `INVALID_CONTENT` code when the caller references
   * an unknown technique / pattern. We check existence with a single-column
   * `SELECT id … LIMIT 1` — no row hydration required.
   */
  private async assertContentExists(
    contentType: ContentType,
    contentId: string,
  ): Promise<void> {
    if (contentType === 'technique') {
      const rows = await this.db
        .select({ id: technique.id })
        .from(technique)
        .where(eq(technique.id, contentId))
        .limit(1);
      if (rows.length === 0) {
        throw new NotFoundException({
          error: {
            code: 'INVALID_CONTENT',
            message: `Unknown technique ${contentId}.`,
            details: { offendingId: contentId, contentType },
          },
        });
      }
    } else {
      const rows = await this.db
        .select({ id: pattern.id })
        .from(pattern)
        .where(eq(pattern.id, contentId))
        .limit(1);
      if (rows.length === 0) {
        throw new NotFoundException({
          error: {
            code: 'INVALID_CONTENT',
            message: `Unknown pattern ${contentId}.`,
            details: { offendingId: contentId, contentType },
          },
        });
      }
    }
  }

  /**
   * Drizzle returns `lastPracticedAt` as a `YYYY-MM-DD` string (the schema
   * declares the column with `mode: 'string'`), so the API mapping is a
   * pass-through. Timestamps are `Date` objects (`mode: 'date'`).
   *
   * Public so {@link ../students/students.service.ts StudentsService} can map
   * `ProgressRow` → `Progress` without re-implementing the field shape.
   */
  public toApi(row: ProgressRow): Progress {
    return {
      id: row.id,
      userId: row.userId,
      contentType: row.contentType as ContentType,
      techniqueId: row.techniqueId,
      patternId: row.patternId,
      status: row.status as Progress['status'],
      studentNotes: row.studentNotes,
      instructorNotes: row.instructorNotes,
      lastPracticedAt: row.lastPracticedAt,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private snapshot(row: ProgressRow): Record<string, unknown> {
    return {
      status: row.status,
      studentNotes: row.studentNotes,
      instructorNotes: row.instructorNotes,
      lastPracticedAt: row.lastPracticedAt,
    };
  }
}
