import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateMembershipInput,
  ListMembershipsQuery,
  UpdateMembershipInput,
} from '@repo/contracts/memberships';
import { and, count, eq, type SQL } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  organisationMembership,
  type DbOrganisationMembership,
} from '../../infrastructure/database/schema/index.js';

@Injectable()
export class MembershipsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<DbOrganisationMembership | null> {
    const rows = await this.db
      .select()
      .from(organisationMembership)
      .where(eq(organisationMembership.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findExact(
    userId: string,
    organisationId: string,
    role: 'orgadmin' | 'instructor',
  ): Promise<DbOrganisationMembership | null> {
    const rows = await this.db
      .select()
      .from(organisationMembership)
      .where(
        and(
          eq(organisationMembership.userId, userId),
          eq(organisationMembership.organisationId, organisationId),
          eq(organisationMembership.role, role),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async list(filter: ListMembershipsQuery): Promise<{ data: DbOrganisationMembership[]; total: number }> {
    const filters: SQL[] = [];
    if (filter.userId) filters.push(eq(organisationMembership.userId, filter.userId));
    if (filter.organisationId)
      filters.push(eq(organisationMembership.organisationId, filter.organisationId));
    const where = filters.length ? and(...filters) : undefined;

    const data = await this.db
      .select()
      .from(organisationMembership)
      .where(where)
      .orderBy(organisationMembership.createdAt);
    const totalRows = await this.db
      .select({ value: count() })
      .from(organisationMembership)
      .where(where);
    return { data, total: Number(totalRows[0]?.value ?? 0) };
  }

  async create(
    input: CreateMembershipInput,
    tx?: DrizzleExecutor,
  ): Promise<DbOrganisationMembership> {
    const conn = tx ?? this.db;
    const rows = await conn
      .insert(organisationMembership)
      .values({
        userId: input.userId,
        organisationId: input.organisationId,
        role: input.role,
      })
      .returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(
    id: string,
    input: UpdateMembershipInput,
    tx?: DrizzleExecutor,
  ): Promise<DbOrganisationMembership | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .update(organisationMembership)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(organisationMembership.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string, tx?: DrizzleExecutor): Promise<boolean> {
    const conn = tx ?? this.db;
    const rows = await conn
      .delete(organisationMembership)
      .where(eq(organisationMembership.id, id))
      .returning({ id: organisationMembership.id });
    return rows.length > 0;
  }

  async countOrgadminsForOrg(organisationId: string, tx?: DrizzleExecutor): Promise<number> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ value: count() })
      .from(organisationMembership)
      .where(
        and(
          eq(organisationMembership.organisationId, organisationId),
          eq(organisationMembership.role, 'orgadmin'),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }
}
