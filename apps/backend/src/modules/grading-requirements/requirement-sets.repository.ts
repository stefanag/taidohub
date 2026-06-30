import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { requirementSet } from '../../infrastructure/database/schema/grading-requirements.js';

export type RequirementSetRow = typeof requirementSet.$inferSelect;

@Injectable()
export class RequirementSetsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async list(orgIds: string[] | 'all'): Promise<RequirementSetRow[]> {
    if (orgIds === 'all') {
      return this.db.select().from(requirementSet);
    }
    if (orgIds.length === 0) return [];
    return this.db
      .select()
      .from(requirementSet)
      .where(inArray(requirementSet.organisationId, orgIds));
  }

  async findById(id: string): Promise<RequirementSetRow | null> {
    const [row] = await this.db
      .select()
      .from(requirementSet)
      .where(eq(requirementSet.id, id))
      .limit(1);
    return row ?? null;
  }

  async insert(input: {
    name: string;
    organisationId: string | null;
    effectiveDate: string;
    clonedFromId?: string | null;
  }): Promise<RequirementSetRow> {
    const [row] = await this.db
      .insert(requirementSet)
      .values({
        name: input.name,
        organisationId: input.organisationId,
        effectiveDate: input.effectiveDate,
        clonedFromId: input.clonedFromId ?? null,
        isActive: false,
      })
      .returning();
    if (!row) throw new Error('Insert returned no rows.');
    return row;
  }

  async update(
    id: string,
    patch: Partial<{ name: string; effectiveDate: string }>,
  ): Promise<RequirementSetRow | null> {
    const [row] = await this.db
      .update(requirementSet)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(requirementSet.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db
      .delete(requirementSet)
      .where(eq(requirementSet.id, id))
      .returning({ id: requirementSet.id });
    return res.length > 0;
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db
      .update(requirementSet)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(requirementSet.id, id));
  }

  async deactivateActiveForOrg(organisationId: string | null): Promise<void> {
    const where =
      organisationId === null
        ? and(eq(requirementSet.isActive, true), isNull(requirementSet.organisationId))
        : and(
            eq(requirementSet.isActive, true),
            eq(requirementSet.organisationId, organisationId),
          );
    await this.db
      .update(requirementSet)
      .set({ isActive: false, updatedAt: new Date() })
      .where(where);
  }

  async findActiveByOrg(organisationId: string | null): Promise<RequirementSetRow | null> {
    const where =
      organisationId === null
        ? and(eq(requirementSet.isActive, true), isNull(requirementSet.organisationId))
        : and(
            eq(requirementSet.isActive, true),
            eq(requirementSet.organisationId, organisationId),
          );
    const [row] = await this.db.select().from(requirementSet).where(where).limit(1);
    return row ?? null;
  }
}
