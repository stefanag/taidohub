import { Global, Inject, Module, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../../config/env.schema.js';

import {
  createDrizzleClient,
  disposeDrizzleClient,
  DRIZZLE,
  type DrizzleDb,
} from './client.js';

const drizzleProvider: Provider = {
  provide: DRIZZLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const databaseUrl = config.get('DATABASE_URL', { infer: true });
    return createDrizzleClient(databaseUrl);
  },
};

/**
 * Global Drizzle module. Repositories inject the client via
 * `@Inject(DRIZZLE) private readonly db: DrizzleDb`.
 *
 * Implements `OnModuleDestroy` so that closing the app (e.g. test
 * harness `app.close()` between specs) flushes the postgres-js
 * connection AND frees the per-URL singleton slot enforced by
 * `createDrizzleClient`. Without this, a sequence of test apps
 * pointing at the same DATABASE_URL would trip the singleton check
 * on the second `buildTestApp()` call.
 */
@Global()
@Module({
  providers: [drizzleProvider],
  exports: [drizzleProvider],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async onModuleDestroy(): Promise<void> {
    await disposeDrizzleClient(this.db);
  }
}
