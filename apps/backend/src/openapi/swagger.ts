import { type INestApplication } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { registerContractSchemas } from '@repo/contracts/openapi';

import { type Env } from '../config/env.schema.js';

/**
 * Build the OpenAPI document for the running Nest app, register the shared
 * contract schemas under `components.schemas`, and (optionally) mount the
 * Swagger UI on `/api/docs`.
 *
 * Returns the document so the caller (or `openapi/generate.ts`) can write it
 * to disk.
 */
export function buildOpenApiDocument(
  app: INestApplication,
  env: Env,
): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('taidohub API')
    .setDescription(
      'HTTP boundary for taidohub — schemas derived from `@repo/contracts`, ' +
        'enforced at runtime by `ZodValidationPipe` and documented here.',
    )
    .setVersion(process.env.npm_package_version ?? '0.0.0')
    .addServer(env.BACKEND_URL ?? 'http://localhost:3001', 'Local')
    .addCookieAuth(
      'better-auth.session_token',
      { type: 'apiKey', in: 'cookie', name: 'better-auth.session_token' },
      'session',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'session-token' },
      'bearer',
    )
    .addTag('auth')
    .addTag('users')
    .addTag('organisations')
    .addTag('audit-log')
    .addTag('health')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
    deepScanRoutes: true,
  });

  // @nestjs/swagger ships its own `OpenAPIObject` type that drifts from
  // openapi3-ts's stricter 3.1 shape under exactOptionalPropertyTypes. The
  // runtime payloads are interchangeable — bridge the types here.
  registerContractSchemas(document as unknown as Parameters<typeof registerContractSchemas>[0]);

  return document;
}

/**
 * Builds the document and mounts Swagger UI when:
 *   - `NODE_ENV !== 'production'`, **or**
 *   - `ENABLE_SWAGGER === 'true'`.
 *
 * In production with Swagger disabled this is a no-op.
 */
export function setupSwagger(
  app: INestApplication,
  config: ConfigService<Env, true>,
): OpenAPIObject | null {
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const enableSwaggerFlag = config.get('ENABLE_SWAGGER', { infer: true });
  const shouldMount = nodeEnv !== 'production' || enableSwaggerFlag === 'true';
  if (!shouldMount) return null;

  const backendUrl = config.get('BACKEND_URL', { infer: true });
  const env: Env = {
    NODE_ENV: nodeEnv,
    PORT: config.get('PORT', { infer: true }),
    WEB_ORIGIN: config.get('WEB_ORIGIN', { infer: true }),
    DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
    DIRECT_URL: config.get('DIRECT_URL', { infer: true }),
    BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
    BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
    SYSADMIN_EMAIL: config.get('SYSADMIN_EMAIL', { infer: true }),
    SYSADMIN_PASSWORD: config.get('SYSADMIN_PASSWORD', { infer: true }),
    INVITE_TOKEN_TTL_HOURS: config.get('INVITE_TOKEN_TTL_HOURS', { infer: true }),
    RESET_TOKEN_TTL_HOURS: config.get('RESET_TOKEN_TTL_HOURS', { infer: true }),
    ...(backendUrl !== undefined ? { BACKEND_URL: backendUrl } : {}),
    ...(enableSwaggerFlag !== undefined ? { ENABLE_SWAGGER: enableSwaggerFlag } : {}),
  };

  const document = buildOpenApiDocument(app, env);

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/openapi.json',
    yamlDocumentUrl: 'api/docs/openapi.yaml',
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  return document;
}
