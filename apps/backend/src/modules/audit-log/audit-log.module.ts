import { Global, Module } from '@nestjs/common';

import { AuditLogController } from './audit-log.controller.js';
import { AuditLogRepository } from './audit-log.repository.js';
import { AuditLogService } from './audit-log.service.js';

/**
 * @Global so any feature module (organisations today, users tomorrow)
 * can inject `AuditLogService` without explicitly importing this module.
 */
@Global()
@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogRepository],
  exports: [AuditLogService],
})
export class AuditLogModule {}
