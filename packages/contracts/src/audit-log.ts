import { z } from './zod-openapi.js';

const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO_DATETIME_EXAMPLE = '2026-05-17T08:00:00.000Z';

export const AuditLogActionSchema = z
  .enum(['create', 'update', 'delete', 'move'])
  .meta({ id: 'AuditLogAction' });

export type AuditLogAction = z.infer<typeof AuditLogActionSchema>;

export const AuditLogEntrySchema = z
  .object({
    id: z.string().uuid(),
    entityType: z.string().min(1).describe('Lowercase singular noun, e.g. "organisation".'),
    entityId: z.string().min(1).describe('Caller-defined id of the audited row (uuid for orgs, text for users).'),
    action: AuditLogActionSchema,
    userId: z.string().nullable().describe('Null when the audited user has since been deleted.'),
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    createdAt: z.string().datetime(),
  })
  .meta({
    id: 'AuditLogEntry',
    example: {
      id: UUID_EXAMPLE,
      entityType: 'organisation',
      entityId: UUID_EXAMPLE,
      action: 'update',
      userId: 'u-admin',
      before: { name: 'Old' },
      after: { name: 'New' },
      createdAt: ISO_DATETIME_EXAMPLE,
    },
  });

export const ListAuditLogQuerySchema = z
  .object({
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    userId: z.string().optional(),
    action: AuditLogActionSchema.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(100).default(25),
  })
  .meta({ id: 'ListAuditLogQuery' });

export const ListAuditLogResponseSchema = z
  .object({
    data: AuditLogEntrySchema.array(),
    page: z.number().int().positive(),
    perPage: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  })
  .meta({ id: 'ListAuditLogResponse' });

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
export type ListAuditLogQuery = z.infer<typeof ListAuditLogQuerySchema>;
export type ListAuditLogResponse = z.infer<typeof ListAuditLogResponseSchema>;

export const AuditLogOpenApiRegistry = {
  AuditLogAction: AuditLogActionSchema,
  AuditLogEntry: AuditLogEntrySchema,
  ListAuditLogQuery: ListAuditLogQuerySchema,
  ListAuditLogResponse: ListAuditLogResponseSchema,
} as const;
