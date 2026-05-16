import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import { toNodeHandler } from 'better-auth/node';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from '../../src/app.module.js';
import { type Env } from '../../src/config/env.schema.js';
import { BETTER_AUTH, type Auth } from '../../src/infrastructure/auth/better-auth.js';
import { setupSwagger } from '../../src/openapi/swagger.js';

/**
 * Boots a real Nest application against the AppModule with the same Express
 * middleware stack as `main.ts`. Tests then drive it via `supertest`.
 *
 * Returns a `close()` helper.
 */
export async function buildTestApp(): Promise<{
  app: NestExpressApplication;
  close: () => Promise<void>;
}> {
  Logger.overrideLogger(false);

  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
  });

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  const origins = webOrigin.split(',').map((s) => s.trim()).filter(Boolean);

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const auth = app.get<Auth>(BETTER_AUTH);
  // Use a prefix mount (not a glob) — Express 5 / path-to-regexp v8 rejects
  // the legacy `/api/auth/*` pattern. The bare prefix matches every nested
  // path identically and is what `main.ts` uses in production.
  app.use('/api/auth', toNodeHandler(auth));

  app.setGlobalPrefix('api');
  setupSwagger(app, config);

  await app.init();

  return {
    app,
    close: () => app.close(),
  };
}

/**
 * Returns `true` if the test environment has a database to talk to. E2E specs
 * call this from `describe.skipIf(!hasDatabase())(...)` so the suite stays
 * green on machines/CI runners without a Postgres available.
 */
export function hasDatabase(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
}
