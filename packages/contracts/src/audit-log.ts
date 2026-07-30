import { z } from './zod-openapi.js';

const UUID_EXAMPLE = '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5';
const ISO_DATETIME_EXAMPLE = '2026-05-17T08:00:00.000Z';

export const AuditLogActionSchema = z
  .enum([
    'create',
    'update',
    'delete',
    'move',
    'deactivate',
    'reactivate',
    'password_reset_triggered',
  ])
  .meta({ id: 'AuditLogAction' });

export type AuditLogAction = z.infer<typeof AuditLogActionSchema>;

/**
 * The actor who performed the audited action. `name` is nullable (users
 * can sign up without one); the UI falls back to `email` in that case.
 * The whole object is nullable — the row's user_id FK is `ON DELETE SET
 * NULL`, so the audit trail survives the user being deleted.
 */
export const AuditLogUserSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string(),
  })
  .meta({ id: 'AuditLogUser' });

export const AuditLogEntrySchema = z
  .object({
    id: z.string().uuid(),
    entityType: z.string().min(1).describe('Lowercase singular noun, e.g. "organisation".'),
    entityId: z.string().min(1).describe('Caller-defined id of the audited row (uuid for orgs, text for users).'),
    action: AuditLogActionSchema,
    user: AuditLogUserSchema.nullable().describe('Null when the acting user has since been deleted.'),
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
      user: { id: 'u-admin', name: 'Ada Lovelace', email: 'ada@example.com' },
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
  AuditLogUser: AuditLogUserSchema,
  AuditLogEntry: AuditLogEntrySchema,
  ListAuditLogQuery: ListAuditLogQuerySchema,
  ListAuditLogResponse: ListAuditLogResponseSchema,
} as const;
