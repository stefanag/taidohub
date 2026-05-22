import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DRIZZLE, type DrizzleDb } from '../database/client.js';
import { verification } from '../database/schema/index.js';

/**
 * Issues and consumes one-time tokens, stored in better-auth's `verification`
 * table. Used by the invitation and admin-password-reset flows — each token's
 * `identifier` carries a prefix (`invite:<userId>` / `admin-reset:<userId>`)
 * so the consuming endpoint can route on it.
 */
@Injectable()
export class VerificationTokenService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /**
   * Issue a fresh token for `identifier`, replacing any existing tokens for
   * the same identifier (so an invitee always has exactly one live link).
   * Returns the opaque token value to embed in the email URL.
   */
  async issueToken(identifier: string, ttlHours: number): Promise<string> {
    const value = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
    await this.db.transaction(async (tx) => {
      await tx.delete(verification).where(eq(verification.identifier, identifier));
      await tx.insert(verification).values({
        id: randomUUID(),
        identifier,
        value,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    });
    return value;
  }

  /**
   * Consume a token by value: returns its `identifier` and deletes the row on
   * success. Returns null when the value is unknown or already expired (an
   * expired row is also deleted as a side-effect of consumption).
   */
  async consumeToken(value: string): Promise<{ identifier: string } | null> {
    const rows = await this.db
      .select()
      .from(verification)
      .where(eq(verification.value, value))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    if (row.expiresAt.getTime() < Date.now()) {
      await this.db.delete(verification).where(eq(verification.id, row.id));
      return null;
    }

    await this.db.delete(verification).where(eq(verification.id, row.id));
    return { identifier: row.identifier };
  }

  /** True iff `identifier` currently has a token that has not yet expired. */
  async hasUnexpiredToken(identifier: string): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(verification)
      .where(eq(verification.identifier, identifier));
    const now = Date.now();
    return rows.some((r) => r.expiresAt.getTime() > now);
  }
}
