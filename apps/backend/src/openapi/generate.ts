/**
 * Standalone OpenAPI doc generator.
 *
 * Invoked via `pnpm --filter backend openapi:generate`. Boots a minimal Nest
 * context (no HTTP listener), builds the same document as the runtime
 * Swagger setup, and writes:
 *
 *   - `packages/contracts/openapi/openapi.json`
 *   - `packages/contracts/openapi/openapi.yaml`
 *
 * CI compares the committed files against fresh output to catch drift.
 *
 * `reflect-metadata` MUST be imported before `@nestjs/core` so Nest's
 * `@Injectable()` / `@Inject()` decorators register their parameter metadata.
 * `main.ts` does this for the runtime app; this generator runs in its own
 * process and has to opt in independently.
 */
import 'reflect-metadata';

// Env stubs MUST run before any `@/` import that pulls in `AppModule`.
// `AppConfigModule` calls `NestConfigModule.forRoot({...})` at decorator
// time, which captures `process.env` and the validate lambda immediately.
// Setting these later (e.g. inside main()) would happen after the snapshot
// and Zod would reject the missing keys at Nest bootstrap.
process.env.NODE_ENV ??= 'development';
process.env.WEB_ORIGIN ??= 'http://localhost:8080';
process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@localhost:5432/placeholder';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.BETTER_AUTH_SECRET ??= 'placeholder-placeholder-placeholder-placeholder';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3001';

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import yaml from 'yaml';

import { AppModule } from '../app.module.js';
import { type Env, EnvSchema } from '../config/env.schema.js';

import { buildOpenApiDocument } from './swagger.js';

async function main(): Promise<void> {
  // `cwd` is `apps/backend` whether this runs via `pnpm --filter backend
  // openapi:generate` or via `node` directly. Using `import.meta.url` here
  // would break after compile (dist/ adds an extra path segment).
  const outDir = resolve(process.cwd(), '../../packages/contracts/openapi');
  mkdirSync(outDir, { recursive: true });

  const env: Env = EnvSchema.parse(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Keep error/warn on so a bootstrap failure surfaces. The script
    // exits silently otherwise — Nest's ExceptionHandler swallows the
    // stack when `logger: false`.
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api');
  await app.init();

  const document = buildOpenApiDocument(app, env);

  writeFileSync(resolve(outDir, 'openapi.json'), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  writeFileSync(resolve(outDir, 'openapi.yaml'), yaml.stringify(document), 'utf8');

  // eslint-disable-next-line no-console
  console.info(`[openapi] wrote ${outDir}/openapi.{json,yaml}`);

  await app.close();
  process.exit(0);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[openapi] failed:', err);
  process.exit(1);
});
