import { z } from 'zod';

/**
 * Docker Compose passes `${VAR:-}` as an empty string when the variable is not
 * set in .env; treat that the same as unset.
 */
const unsetIfEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);

/**
 * Backend environment schema.
 *
 * Parsed once at boot by `ConfigModule` (see `./config.module.ts`). A failure
 * here crashes the app early with a readable error instead of letting Nest boot
 * with half-configured modules.
 */
export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  /** Port the HTTP server binds to. Defaults to 3001. */
  PORT: z.coerce.number().int().positive().default(3001),

  /**
   * Comma-separated list of origins the frontend may serve from. Used both for
   * CORS (`app.enableCors`) and better-auth's `trustedOrigins`.
   */
  WEB_ORIGIN: z.string().min(1),

  /**
   * Absolute base URL of the public web app. Used to build user-facing links
   * (e.g. the set-password link in invite emails). Distinct from `WEB_ORIGIN`,
   * which is a CORS allow-list and may contain several origins in no
   * particular order.
   */
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),

  /** Pooled Supabase connection string used at runtime (postgres-js). */
  DATABASE_URL: z.string().min(1),

  /** Direct Supabase connection string used for migrations. */
  DIRECT_URL: z.string().min(1),

  /** Hex/base64 secret consumed by better-auth for signing cookies/tokens. */
  BETTER_AUTH_SECRET: z.string().min(16),

  /** Absolute URL the backend is reachable at (e.g. http://localhost:3001). */
  BETTER_AUTH_URL: z.string().url(),

  /** Optional override for the OpenAPI `servers[0].url`. */
  BACKEND_URL: z.string().url().optional(),

  /**
   * Set to `'true'` to mount Swagger UI even in production. Defaults to
   * mounting whenever NODE_ENV !== 'production'.
   */
  ENABLE_SWAGGER: z
    .union([z.literal('true'), z.literal('false')])
    .optional(),

  /**
   * Outgoing email over SMTP (e.g. Brevo: smtp-relay.brevo.com:587). When
   * SMTP_HOST is unset, emails are written to stdout instead (local
   * development and tests). Port 465 uses implicit TLS; other ports
   * upgrade with STARTTLS, which is required.
   */
  SMTP_HOST: unsetIfEmpty(z.string().min(1).optional()),
  SMTP_PORT: unsetIfEmpty(z.coerce.number().int().positive().default(587)),
  SMTP_USER: unsetIfEmpty(z.string().min(1).optional()),
  SMTP_PASSWORD: unsetIfEmpty(z.string().min(1).optional()),
  /** Sender of every email, as `Name <address>`. */
  /**
   * Google sign-in. Both set → "Sign in with Google" is available; either
   * missing → it is not. One OAuth client per environment (see the deploy README).
   */
  GOOGLE_CLIENT_ID: unsetIfEmpty(z.string().min(1).optional()),
  GOOGLE_CLIENT_SECRET: unsetIfEmpty(z.string().min(1).optional()),
  EMAIL_FROM: unsetIfEmpty(z.string().min(3).default('TaidoHub <noreply@emails.taidohub.se>')),

  /**
   * Seed-only: identity for the sysadmin user created by
   * `pnpm --filter backend run db:seed`. Defaults are dev-friendly;
   * override in `.env` for staging/prod.
   */
  SYSADMIN_EMAIL: z.string().email().default('sysadmin@example.com'),
  SYSADMIN_PASSWORD: z.string().min(8).default('sysadmin'),

  /**
   * Seed-only: whether to seed the STAF club-member roster (real names,
   * shared dev password). Unset means 'true' outside production and
   * 'false' in production.
   */
  SEED_CLUB_MEMBERS: z.enum(['true', 'false']).optional(),

  /**
   * Seed-only: whether to seed fictional demo data (a demo club, demo
   * orgadmin/instructor accounts and students). Off unless 'true'; refused
   * against production. `DEMO_PASSWORD` is the shared password for every
   * demo account and is required when this is on.
   */
  SEED_DEMO_DATA: z.enum(['true', 'false']).optional(),
  DEMO_PASSWORD: z.string().min(12).optional(),

  /**
   * One-time invite-token lifetime in hours. The set-password link in an
   * invite email stays valid this long. Default 48h.
   */
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).default(48),

  /**
   * One-time admin-triggered password-reset token lifetime in hours.
   * Shorter than the invite TTL: a reset link grants immediate access to an
   * existing active account, so a stolen link must expire quickly. Default 1h.
   */
  RESET_TOKEN_TTL_HOURS: z.coerce.number().int().min(1).default(1),
});

export type Env = z.infer<typeof EnvSchema>;
