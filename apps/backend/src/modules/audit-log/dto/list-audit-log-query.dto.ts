import { ListAuditLogQuerySchema } from '@repo/contracts/audit-log';
import { createZodDto } from 'nestjs-zod';
export class ListAuditLogQueryDto extends createZodDto(ListAuditLogQuerySchema) {}
