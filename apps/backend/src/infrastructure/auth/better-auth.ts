import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';

import { type Env } from '../../config/env.schema.js';
import { createDrizzleClient } from '../database/client.js';
import * as schema from '../database/schema/index.js';
import { type EmailService } from '../email/email.types.js';

/**
 * Build the better-auth server instance for a given environment.
 *
 * Kept as a factory (rather than a top-level singleton) so the auth module
 * can wire it against the same `ConfigService`-validated env that the rest of
 * the app uses, and so test setups can rebuild it against a fresh database.
 */
export function buildBetterAuth(env: Env, emailService: EmailService) {
  const db = createDrizzleClient(env.DATABASE_URL);

  const isProd = env.NODE_ENV === 'production';
  const trustedOrigins = env.WEB_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      // Self-service reset only — admin-triggered resets bypass this callback
      // and go through UsersService.sendPasswordReset directly.
      sendResetPassword: async ({ user, url }): Promise<void> => {
        await emailService.sendPasswordReset({
          to: user.email,
          locale: (user as { locale?: string }).locale ?? 'en',
          resetUrl: url,
        });
      },
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: 'user',
          required: false,
          input: false,
        },
        locale: {
          type: 'string',
          defaultValue: 'en',
          required: false,
          input: true,
        },
      },
    },
    advanced: {
      // Default cookie name is `better-auth.session_token`; do not change it
      // unless `swagger.ts`'s `addCookieAuth(...)` name is updated to match.
      cookies: {
        sessionToken: {
          attributes: {
            httpOnly: true,
            sameSite: isProd ? 'none' : 'lax',
            secure: isProd,
          },
        },
      },
    },
    plugins: [
      admin({
        adminRoles: ['sysadmin'],
        // 1-hour cap on each impersonation session.
        impersonationSessionDuration: 60 * 60,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof buildBetterAuth>;

/** DI token for `Auth`. */
export const BETTER_AUTH = Symbol('BETTER_AUTH');
