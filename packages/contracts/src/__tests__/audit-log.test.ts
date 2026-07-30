import { describe, expect, it } from 'vitest';

import {
  AuditLogActionSchema,
  AuditLogEntrySchema,
  ListAuditLogQuerySchema,
} from '../audit-log.js';

describe('AuditLogActionSchema', () => {
  it('accepts the seven allowed actions', () => {
    for (const action of [
      'create',
      'update',
      'delete',
      'move',
      'deactivate',
      'reactivate',
      'password_reset_triggered',
    ]) {
      expect(AuditLogActionSchema.safeParse(action).success).toBe(true);
    }
  });

  it('rejects an unknown action', () => {
    expect(AuditLogActionSchema.safeParse('archive').success).toBe(false);
  });
});

describe('AuditLogEntrySchema', () => {
  const valid = {
    id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
    entityType: 'organisation',
    entityId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
    action: 'update' as const,
    user: { id: 'u-admin', name: 'Ada Lovelace', email: 'ada@example.com' },
    before: { name: 'Old' },
    after: { name: 'New' },
    createdAt: '2026-05-17T08:00:00.000Z',
  };

  it('accepts a fully populated row', () => {
    expect(AuditLogEntrySchema.safeParse(valid).success).toBe(true);
  });

  it('accepts null before (create case)', () => {
    expect(AuditLogEntrySchema.safeParse({ ...valid, action: 'create', before: null }).success).toBe(true);
  });

  it('accepts null after (delete case)', () => {
    expect(AuditLogEntrySchema.safeParse({ ...valid, action: 'delete', after: null }).success).toBe(true);
  });

  it('accepts user: null (deleted account — FK is ON DELETE SET NULL)', () => {
    expect(AuditLogEntrySchema.safeParse({ ...valid, user: null }).success).toBe(true);
  });

  it('accepts user.name: null (users can sign up without a name)', () => {
    expect(
      AuditLogEntrySchema.safeParse({
        ...valid,
        user: { id: 'u-admin', name: null, email: 'ada@example.com' },
      }).success,
    ).toBe(true);
  });

  it('rejects empty entityType', () => {
    expect(AuditLogEntrySchema.safeParse({ ...valid, entityType: '' }).success).toBe(false);
  });
});

describe('ListAuditLogQuerySchema', () => {
  it('defaults page=1 perPage=25', () => {
    const parsed = ListAuditLogQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(25);
  });

  it('coerces query-string numbers', () => {
    const parsed = ListAuditLogQuerySchema.parse({ page: '3', perPage: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.perPage).toBe(50);
  });

  it('rejects perPage > 100', () => {
    expect(ListAuditLogQuerySchema.safeParse({ perPage: 200 }).success).toBe(false);
  });

  it('accepts an ISO `from` / `to`', () => {
    expect(
      ListAuditLogQuerySchema.safeParse({ from: '2026-01-01T00:00:00.000Z', to: '2026-12-31T23:59:59.000Z' }).success,
    ).toBe(true);
  });
});
