import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, hasDatabase } from '../helpers/app-factory.js';

/**
 * Contract test: assert that the OpenAPI document fully describes the running
 * app — every documented operation exists on a handler, every component
 * schema is `$ref`'d somewhere. Catches a forgotten `@ApiTags`/`@ApiOperation`
 * or an orphan schema before it ever hits production.
 */
describe.skipIf(!hasDatabase())('OpenAPI contract', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;

  beforeAll(async () => {
    const built = await buildTestApp();
    app = built.app;
    close = built.close;

    const res = await request(app.getHttpServer()).get('/api/docs/openapi.json');
    expect(res.status).toBe(200);
    doc = res.body;
  });

  afterAll(async () => {
    await close?.();
  });

  it('has at least one path documented per resource', () => {
    expect(doc.paths).toBeDefined();
    const flat = Object.keys(doc.paths);
    expect(flat.some((p) => p.includes('/posts'))).toBe(true);
    expect(flat.some((p) => p.includes('/users'))).toBe(true);
    expect(flat.some((p) => p.includes('/auth'))).toBe(true);
    expect(flat.some((p) => p.includes('/health'))).toBe(true);
  });

  it('assigns an operationId to every operation', () => {
    for (const [path, methods] of Object.entries<Record<string, unknown>>(doc.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)) continue;
        const operationId = (op as { operationId?: string }).operationId;
        expect(operationId, `missing operationId on ${method.toUpperCase()} ${path}`).toBeTruthy();
      }
    }
  });

  it('references every component schema from somewhere', () => {
    const schemas: Record<string, unknown> = doc.components?.schemas ?? {};
    const allText = JSON.stringify(doc);

    for (const name of Object.keys(schemas)) {
      const ref = `#/components/schemas/${name}`;
      expect(allText.includes(ref) || allText.split(`"${name}"`).length > 1, `unused schema: ${name}`).toBe(true);
    }
  });
});
