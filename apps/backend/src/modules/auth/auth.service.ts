import { randomUUID } from 'node:crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { SetInitialPasswordInput } from '@repo/contracts/users';
import { and, eq } from 'drizzle-orm';

import { BETTER_AUTH, type Auth } from '../../infrastructure/auth/better-auth.js';
import { VerificationTokenService } from '../../infrastructure/auth/verification-token.service.js';
import { DRIZZLE, type DrizzleDb } from '../../infrastructure/database/client.js';
import { account, user } from '../../infrastructure/database/schema/index.js';

/** Token-identifier prefixes the set-password flow accepts. */
const TOKEN_PREFIXES = ['invite:', 'admin-reset:'] as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly tokens: VerificationTokenService,
    @Inject(BETTER_AUTH) private readonly auth: Auth,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  /**
   * Consume a one-time invite/reset token and set the user's password.
   * Hashes the password via better-auth's exposed helper, writes/updates the
   * `credential` account row, marks the email verified, then signs the user
   * in and returns the resulting `Headers` (set-cookie carried by the caller).
   */
  async setInitialPassword(input: SetInitialPasswordInput): Promise<Headers> {
    // NOTE: the token is consumed (deleted) here before any other work. If the
    // subsequent credential-write transaction fails, the token is already spent
    // and the user must be re-invited or issued a new reset link.
    const consumed = await this.tokens.consumeToken(input.token);
    if (!consumed) {
      throw new BadRequestException({
        error: { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired.' },
      });
    }

    const prefix = TOKEN_PREFIXES.find((p) => consumed.identifier.startsWith(p));
    if (!prefix) {
      throw new BadRequestException({
        error: { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired.' },
      });
    }
    const userId = consumed.identifier.slice(prefix.length);

    const userRows = await this.db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const target = userRows[0];
    if (!target) {
      throw new BadRequestException({
        error: { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired.' },
      });
    }

    if (target.deactivatedAt !== null) {
      throw new BadRequestException({
        error: { code: 'INVALID_TOKEN', message: 'This link is invalid or has expired.' },
      });
    }

    const ctx = await this.auth.$context;
    const hash = await ctx.password.hash(input.password);

    await this.db.transaction(async (tx) => {
      const existingAccounts = await tx
        .select()
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
        .limit(1);
      const now = new Date();
      if (existingAccounts[0]) {
        await tx
          .update(account)
          .set({ password: hash, updatedAt: now })
          .where(eq(account.id, existingAccounts[0].id));
      } else {
        await tx.insert(account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: hash,
          createdAt: now,
          updatedAt: now,
        });
      }
      await tx
        .update(user)
        .set({ emailVerified: true, updatedAt: now })
        .where(eq(user.id, userId));
    });

    const { headers } = await this.auth.api.signInEmail({
      returnHeaders: true,
      body: { email: target.email, password: input.password },
    });
    return headers;
  }
}
