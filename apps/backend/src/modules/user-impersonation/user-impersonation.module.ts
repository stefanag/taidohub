import { Module } from '@nestjs/common';

import { UserImpersonationController } from './user-impersonation.controller.js';
import { UserImpersonationService } from './user-impersonation.service.js';

/**
 * `AuditLogModule` is `@Global` (see `audit-log.module.ts`) so it does not
 * need to be imported here for `AuditLogService` injection to resolve.
 * `InfraAuthModule` and `DatabaseModule` are also globally available via
 * `AppModule`, exposing `BETTER_AUTH` and `DRIZZLE` respectively.
 */
@Module({
  controllers: [UserImpersonationController],
  providers: [UserImpersonationService],
})
export class UserImpersonationModule {}
