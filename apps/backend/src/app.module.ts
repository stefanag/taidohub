import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { AppConfigModule } from './config/config.module.js';
import { AbilityModule } from './infrastructure/ability/ability.module.js';
import { InfraAuthModule } from './infrastructure/auth/auth.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { AuthDocsModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrganisationsModule } from './modules/organisations/organisations.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    InfraAuthModule,
    AbilityModule,
    AuthDocsModule,
    HealthModule,
    UsersModule,
    OrganisationsModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
