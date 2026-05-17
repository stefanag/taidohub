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
 * Required env vars (`WEB_ORIGIN`, `DATABASE_URL`, etc.) come from
 * `openapi-stub.env` passed by the `openapi:generate` npm script — see the
 * comment in that file for why an env file is needed instead of in-script
 * stubs. The real `.env` (when present) overrides the stubs.
 *
 * `reflect-metadata` MUST be imported before `@nestjs/core` so Nest's
 * `@Injectable()` / `@Inject()` decorators register their parameter metadata.
 * `main.ts` does this for the runtime app; this generator runs in its own
 * process and has to opt in independently.
 */
import 'reflect-metadata';

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
    // Keep error/warn on so a bootstrap failure surfaces in CI. The
    // script exits silently otherwise — Nest's ExceptionHandler swallows
    // the stack when `logger: false`.
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
