import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, hasDatabase } from '../helpers/app-factory';

describe.skipIf(!hasDatabase())('GET /api/health', () => {
  let app: NestExpressApplication;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const built = await buildTestApp();
    app = built.app;
    close = built.close;
  });

  afterAll(async () => {
    await close?.();
  });

  it('responds 200 with { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });
});
