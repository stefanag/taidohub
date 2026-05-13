import { Global, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../../config/env.schema.js';

import { createDrizzleClient, DRIZZLE } from './client.js';

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
 */
@Global()
@Module({
  providers: [drizzleProvider],
  exports: [drizzleProvider],
})
export class DatabaseModule {}
