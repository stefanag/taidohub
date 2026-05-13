import { z } from 'zod';

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
});

export type Env = z.infer<typeof EnvSchema>;
