import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  DRIZZLE,
  type DrizzleDb,
  type DrizzleExecutor,
} from '../../infrastructure/database/client.js';
import {
  user,
  userProfile,
  type DbUserProfile,
} from '../../infrastructure/database/schema/index.js';

/**
 * The set of `user_profile` columns the service may write. `userId` is fixed
 * by the caller and `created_at` / `updated_at` are managed here, so they are
 * deliberately excluded.
 */
export type ProfilePatch = Partial<
  Pick<
    DbUserProfile,
    | 'firstName'
    | 'lastName'
    | 'dateOfBirth'
    | 'taidoStartDate'
    | 'addressStreet'
    | 'addressPostalCode'
    | 'addressCity'
    | 'addressCountry'
    | 'citizenships'
    | 'aboutMe'
  >
>;

/**
 * Repository — the only file in the profile module allowed to touch Drizzle.
 */
@Injectable()
export class ProfileRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByUserId(userId: string, tx?: DrizzleExecutor): Promise<DbUserProfile | null> {
    const conn = tx ?? this.db;
    const rows = await conn
      .select()
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Insert the `user_profile` row or update the columns named in `patch`.
   * `userId` is the conflict target (it is the primary key).
   */
  async upsert(
    userId: string,
    patch: ProfilePatch,
    tx?: DrizzleExecutor,
  ): Promise<DbUserProfile> {
    const conn = tx ?? this.db;
    const rows = await conn
      .insert(userProfile)
      .values({ userId, ...patch })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: { ...patch, updatedAt: new Date() },
      })
      .returning();
    if (!rows[0]) throw new Error('Upsert returned no rows.');
    return rows[0];
  }

  /** Sync the denormalized `user.name` display field. */
  async syncUserName(userId: string, name: string, tx?: DrizzleExecutor): Promise<void> {
    const conn = tx ?? this.db;
    await conn
      .update(user)
      .set({ name, updatedAt: new Date() })
      .where(eq(user.id, userId));
  }
}
