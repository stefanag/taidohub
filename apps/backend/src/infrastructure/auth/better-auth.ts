import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { admin, jwt } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';

import { type Env } from '../../config/env.schema.js';
import { type DrizzleDb } from '../database/client.js';
import * as schema from '../database/schema/index.js';
import { type EmailService } from '../email/email.types.js';

import { canConnectMcpClient, mcpResource } from './mcp-access.js';
import { isSelfRegistered, isUnverifiedSelfRegistered } from './self-registration.js';

/**
 * OAuth endpoints where a user grants an AI client access. Only users allowed
 * by {@link canConnectMcpClient} may get past them.
 */
const MCP_GRANT_PATHS = new Set(['/oauth2/authorize', '/oauth2/consent']);

/**
 * Build the better-auth server instance for a given environment.
 *
 * The Drizzle client is injected from the outside (`DatabaseModule`'s
 * `DRIZZLE` provider) rather than constructed here. That keeps the
 * postgres-js connection pool single-source — every authenticated request
 * uses the same pool the rest of the app does, and we don't double up
 * against Supabase's session-mode pooler cap.
 *
 * Kept as a factory (rather than a top-level singleton) so the auth module
 * can wire it against the same `ConfigService`-validated env that the rest of
 * the app uses, and so test setups can rebuild it against a fresh database.
 */
export function buildBetterAuth(db: DrizzleDb, env: Env, emailService: EmailService) {
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
        // JWT plugin and OAuth provider (MCP) tables, see schema/oauth.ts.
        jwks: schema.jwks,
        oauthClient: schema.oauthClient,
        oauthResource: schema.oauthResource,
        oauthClientResource: schema.oauthClientResource,
        oauthRefreshToken: schema.oauthRefreshToken,
        oauthAccessToken: schema.oauthAccessToken,
        oauthConsent: schema.oauthConsent,
        oauthClientAssertion: schema.oauthClientAssertion,
      },
    }),
    // The JWT plugin's /token route would hand out session JWTs signed with
    // the same key as MCP access tokens; the MCP plugin docs require it off.
    // Sign-up goes through POST /api/registration instead, which checks age,
    // federation and the platform's terms before calling signUpEmail
    // server-side (disabledPaths only blocks HTTP, not auth.api calls).
    disabledPaths: ['/token', '/sign-up/email'],
    hooks: {
      // Only sysadmins and orgadmins may connect an AI client. Checked on the
      // grant endpoints so no authorization code is ever issued to anyone else.
      before: createAuthMiddleware(async (ctx) => {
        // A self-registered account signs in only after confirming its email.
        if (ctx.path === '/sign-in/email') {
          const email = (ctx.body as { email?: unknown } | undefined)?.email;
          if (typeof email === 'string' && (await isUnverifiedSelfRegistered(db, email))) {
            throw new APIError('FORBIDDEN', {
              code: 'EMAIL_NOT_VERIFIED',
              message: 'Confirm your email address first. We have sent you a link.',
            });
          }
          return;
        }
        if (!MCP_GRANT_PATHS.has(ctx.path)) return;
        const session = await getSessionFromCtx(ctx);
        if (!session) return; // not signed in yet: authorize redirects to the login page
        if (!(await canConnectMcpClient(db, session.user.id))) {
          throw new APIError('FORBIDDEN', {
            code: 'MCP_NOT_ALLOWED',
            message: 'Only sysadmins and organisation admins can connect an AI client.',
          });
        }
      }),
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      // Self-service reset only — admin-triggered resets bypass this callback
      // and go through UsersService.sendPasswordReset directly.
      sendResetPassword: async ({ user, url }): Promise<void> => {
        // better-auth checks `redirectTo` against trustedOrigins, but skips that
        // check whenever NODE_ENV=test. A link that sends the token to another
        // site would hand it to whoever requested the reset, so check here too.
        if (!isResetLinkForTrustedOrigin(url, trustedOrigins)) {
          console.warn('[auth] password reset refused: redirect is not a trusted origin');
          return;
        }
        await emailService.sendPasswordReset({
          to: user.email,
          locale: (user as { locale?: string }).locale ?? 'en',
          resetUrl: url,
        });
      },
    },
    emailVerification: {
      // Sent explicitly by RegistrationService and by better-auth's
      // send-verification-email route, never on sign-up.
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }): Promise<void> => {
        // Only self-registered accounts verify this way; invited users confirm
        // through their set-password link, after accepting the texts.
        if (!(await isSelfRegistered(db, user.id))) return;
        // Same trusted-origin guard as password resets: the link redirects
        // to its callbackURL, which must be one of our own origins.
        if (!isResetLinkForTrustedOrigin(url, trustedOrigins)) {
          console.warn('[auth] email verification refused: redirect is not a trusted origin');
          return;
        }
        await emailService.sendEmailVerification({
          to: user.email,
          locale: (user as { locale?: string }).locale ?? 'en',
          verifyUrl: url,
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
      //
      // Use `defaultCookieAttributes` rather than `cookies.sessionToken.
      // attributes`: the per-cookie lookup inside better-auth is keyed by the
      // snake_case cookie name (`session_token`), so the camelCase
      // `sessionToken` key silently never matches and the cookie falls back
      // to its hard-coded `sameSite: 'lax'` default. That breaks cross-origin
      // session login on Railway-style deploys (frontend on one *.up.railway.app
      // subdomain, backend on another). `defaultCookieAttributes` applies to
      // every cookie better-auth issues and isn't sensitive to that mismatch.
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: isProd ? 'none' : 'lax',
        secure: isProd,
      },
    },
    plugins: [
      admin({
        // Alias the existing access-control roles (`admin` → all admin
        // statements; `user` → none) under the names this app actually uses.
        // The role-permission system is not consumed by our code — CASL owns
        // ability checks. The admin plugin only requires entries here to
        // validate `adminRoles`.
        roles: { sysadmin: adminAc, user: userAc },
        adminRoles: ['sysadmin'],
        // 1-hour cap on each impersonation session.
        impersonationSessionDuration: 60 * 60,
      }),
      // Signs MCP access tokens. Not used for sessions: no JWT header is set.
      jwt({ disableSettingJwtHeader: true }),
      // OAuth 2.1 authorization server for MCP clients (Claude, ChatGPT, ...).
      // Endpoints live under /api/auth/oauth2/*; discovery documents are
      // served at /.well-known/oauth-* (mounted in main.ts).
      mcp({
        loginPage: `${env.WEB_APP_URL}/login`,
        consentPage: `${env.WEB_APP_URL}/oauth/consent`,
        resource: mcpResource(env),
      }),
      // Client ID Metadata Documents: MCP clients identify themselves by a URL
      // instead of registering. Dynamic client registration stays off.
      cimd({
        fetchClientMetadataResource,
        metadataProfile: 'mcp-2026-07-28',
      }),
    ],
  });
}

export type Auth = ReturnType<typeof buildBetterAuth>;

/** DI token for `Auth`. */
export const BETTER_AUTH = Symbol('BETTER_AUTH');

/**
 * True when the reset link's `callbackURL`, which receives the token, is a
 * relative path or lies on one of the trusted web origins.
 */
export function isResetLinkForTrustedOrigin(resetUrl: string, trustedOrigins: readonly string[]): boolean {
  let callback: string | null;
  try {
    callback = new URL(resetUrl).searchParams.get('callbackURL');
  } catch {
    return false;
  }
  if (!callback) return true;
  if (callback.startsWith('/') && !callback.startsWith('//') && !callback.startsWith('/\\')) return true;
  try {
    const origin = new URL(callback).origin;
    return trustedOrigins.some((trusted) => {
      try {
        return new URL(trusted).origin === origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
