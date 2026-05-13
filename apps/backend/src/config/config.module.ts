import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { EnvSchema } from './env.schema';

/**
 * Global config module. Loads `.env` from the monorepo root and `apps/backend`
 * (the former wins because it's listed first) and validates the resulting
 * environment against `EnvSchema`.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env', '.env'],
      validate: (env) => EnvSchema.parse(env),
    }),
  ],
  exports: [NestConfigModule],
})
export class AppConfigModule {}
