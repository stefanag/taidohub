import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateOrganisationInput,
  ListOrganisationsQuery,
  UpdateOrganisationInput,
} from '@repo/contracts/organisations';
import { and, count, eq, ilike, isNull, or, type SQL } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb, type DrizzleExecutor } from '../../infrastructure/database/client.js';
import { organisations, type DbOrganisation } from '../../infrastructure/database/schema/index.js';

@Injectable()
export class OrganisationsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<DbOrganisation | null> {
    const rows = await this.db.select().from(organisations).where(eq(organisations.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async list(filter: ListOrganisationsQuery): Promise<{ data: DbOrganisation[]; total: number }> {
    const filters: SQL[] = [];
    if (filter.type) filters.push(eq(organisations.type, filter.type));
    if (filter.country) filters.push(eq(organisations.country, filter.country));
    if (filter.parentId === null) {
      filters.push(isNull(organisations.parentId));
    } else if (filter.parentId !== undefined) {
      filters.push(eq(organisations.parentId, filter.parentId));
    }
    if (filter.q) {
      const needle = `%${filter.q}%`;
      const search = or(
        ilike(organisations.nameEn, needle),
        ilike(organisations.nameSv, needle),
        ilike(organisations.nameFi, needle),
        ilike(organisations.shortCode, needle),
      );
      if (search) filters.push(search);
    }
    const where = filters.length ? and(...filters) : undefined;

    const data = await this.db.select().from(organisations).where(where).orderBy(organisations.nameEn);
    const totalRows = await this.db.select({ value: count() }).from(organisations).where(where);
    return { data, total: Number(totalRows[0]?.value ?? 0) };
  }

  async create(input: CreateOrganisationInput, tx?: DrizzleExecutor): Promise<DbOrganisation> {
    const conn = tx ?? this.db;
    const rows = await conn
      .insert(organisations)
      .values({
        parentId: input.parentId,
        type: input.type,
        shortCode: input.shortCode,
        slug: input.slug,
        country: input.country,
        nameEn: input.nameEn,
        nameSv: input.nameSv,
        nameFi: input.nameFi,
        nameJa: input.nameJa,
        logoUrl: input.logoUrl,
        address: input.address,
        contactEmail: input.contactEmail ?? null,
        headInstructorId: input.headInstructorId,
      })
      .returning();
    if (!rows[0]) throw new Error('Insert returned no rows.');
    return rows[0];
  }

  async update(id: string, input: UpdateOrganisationInput, tx?: DrizzleExecutor): Promise<DbOrganisation | null> {
    const conn = tx ?? this.db;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      'parentId','shortCode','slug','country','nameEn','nameSv','nameFi','nameJa',
      'logoUrl','address','contactEmail','headInstructorId',
    ] as const) {
      if (input[key] !== undefined) patch[key] = input[key];
    }
    const rows = await conn.update(organisations).set(patch).where(eq(organisations.id, id)).returning();
    return rows[0] ?? null;
  }

  async delete(id: string, tx?: DrizzleExecutor): Promise<boolean> {
    const conn = tx ?? this.db;
    const rows = await conn.delete(organisations).where(eq(organisations.id, id)).returning({ id: organisations.id });
    return rows.length > 0;
  }

  async countChildren(id: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(organisations)
      .where(eq(organisations.parentId, id));
    return Number(rows[0]?.value ?? 0);
  }

  /** Org ids where the given user is the head instructor. */
  async findHeadInstructorOrgIds(
    userId: string,
    tx?: DrizzleExecutor,
  ): Promise<string[]> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.headInstructorId, userId));
    return rows.map((r) => r.id);
  }
}
