import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  clubJoinRequests,
  type DbClubJoinRequest,
  organisations,
  user,
} from '../../infrastructure/database/schema/index.js';

export interface ClubJoinRequestRow extends DbClubJoinRequest {
  applicantName: string | null;
  applicantEmail: string;
  club: {
    id: string;
    shortCode: string;
    nameEn: string;
    nameSv: string;
    nameFi: string;
    country: string | null;
  };
}

/** The only file in the club-join-requests module that touches Drizzle. */
@Injectable()
export class ClubJoinRequestsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  transaction<T>(fn: (tx: DrizzleExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  async findById(id: string): Promise<ClubJoinRequestRow | null> {
    const [row] = await this.select(eq(clubJoinRequests.id, id));
    return row ?? null;
  }

  async listByUser(userId: string): Promise<ClubJoinRequestRow[]> {
    return this.select(eq(clubJoinRequests.userId, userId));
  }

  /** Pending requests, all of them (`organisationIds` undefined) or for these clubs. */
  async listPending(organisationIds?: string[]): Promise<ClubJoinRequestRow[]> {
    if (organisationIds && organisationIds.length === 0) return [];
    const conditions: SQL[] = [eq(clubJoinRequests.status, 'pending')];
    if (organisationIds) conditions.push(inArray(clubJoinRequests.organisationId, organisationIds));
    return this.select(and(...conditions)!);
  }

  async hasPending(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: clubJoinRequests.id })
      .from(clubJoinRequests)
      .where(and(eq(clubJoinRequests.userId, userId), eq(clubJoinRequests.status, 'pending')))
      .limit(1);
    return rows.length > 0;
  }

  async insert(input: {
    userId: string;
    organisationId: string;
    message: string | null;
  }): Promise<string> {
    const [row] = await this.db
      .insert(clubJoinRequests)
      .values(input)
      .returning({ id: clubJoinRequests.id });
    return row!.id;
  }

  /**
   * Moves a pending request to `status`. Returns false when it was no longer
   * pending (decided or cancelled concurrently), so a request is decided once.
   */
  async decide(
    id: string,
    status: 'approved' | 'declined' | 'cancelled',
    decidedById: string,
    tx: DrizzleExecutor = this.db,
  ): Promise<boolean> {
    const rows = await tx
      .update(clubJoinRequests)
      .set({ status, decidedById, decidedAt: new Date() })
      .where(and(eq(clubJoinRequests.id, id), eq(clubJoinRequests.status, 'pending')))
      .returning({ id: clubJoinRequests.id });
    return rows.length > 0;
  }

  private async select(where: SQL): Promise<ClubJoinRequestRow[]> {
    const rows = await this.db
      .select({
        request: clubJoinRequests,
        applicantName: user.name,
        applicantEmail: user.email,
        club: {
          id: organisations.id,
          shortCode: organisations.shortCode,
          nameEn: organisations.nameEn,
          nameSv: organisations.nameSv,
          nameFi: organisations.nameFi,
          country: organisations.country,
        },
      })
      .from(clubJoinRequests)
      .innerJoin(user, eq(user.id, clubJoinRequests.userId))
      .innerJoin(organisations, eq(organisations.id, clubJoinRequests.organisationId))
      .where(where)
      .orderBy(desc(clubJoinRequests.createdAt));
    return rows.map((r) => ({
      ...r.request,
      applicantName: r.applicantName,
      applicantEmail: r.applicantEmail,
      club: r.club,
    }));
  }
}
