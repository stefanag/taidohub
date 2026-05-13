import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { type Env } from './config/env.schema';
import { BETTER_AUTH, type Auth } from './infrastructure/auth/better-auth';
import { setupSwagger } from './openapi/swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = new Logger('Bootstrap');

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });
  const webOrigin = config.get('WEB_ORIGIN', { infer: true });
  const origins = webOrigin.split(',').map((s) => s.trim()).filter(Boolean);

  // --- Express-level middleware ------------------------------------------
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // --- better-auth handler ------------------------------------------------
  // MUST be installed via `app.use` (Express layer) BEFORE we set Nest's
  // global prefix wires up the controller router, so that better-auth wins
  // routing for /api/auth/* and the documentation-only `AuthController`
  // never actually executes.
  const auth = app.get<Auth>(BETTER_AUTH);
  // Express 4 wildcard syntax; pinned via @nestjs/platform-express@^10 which
  // ships Express 4 transitively.
  app.use('/api/auth/*', toNodeHandler(auth));

  // --- Nest pipeline ------------------------------------------------------
  app.setGlobalPrefix('api');
  // NOTE: the `AuthController` declares routes under `/api/auth/*` so they
  // appear in Swagger, but at runtime the `app.use('/api/auth/*', …)` above
  // intercepts those requests via the Express middleware chain *before* Nest's
  // router runs — meaning the controller methods are never invoked.

  // ZodValidationPipe / AllExceptionsFilter / LoggingInterceptor are wired
  // as APP_PIPE / APP_FILTER / APP_INTERCEPTOR providers in `AppModule`.

  // --- Swagger ------------------------------------------------------------
  setupSwagger(app, config);

  await app.listen(port);
  logger.log(`Backend listening on http://localhost:${port}/api`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[bootstrap] fatal error:', err);
  process.exit(1);
});
