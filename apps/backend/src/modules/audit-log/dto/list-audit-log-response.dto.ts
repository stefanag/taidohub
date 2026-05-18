import { ListAuditLogResponseSchema } from '@repo/contracts/audit-log';
import { createZodDto } from 'nestjs-zod';
export class ListAuditLogResponseDto extends createZodDto(ListAuditLogResponseSchema) {}
