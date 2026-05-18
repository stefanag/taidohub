import { AuditLogEntrySchema } from '@repo/contracts/audit-log';
import { createZodDto } from 'nestjs-zod';
export class AuditLogEntryDto extends createZodDto(AuditLogEntrySchema) {}
