import { describe, expect, it } from 'vitest';

import { Actions, Subjects } from '../casl.js';
import {
  McpListStudentsInputSchema,
  McpNextRankRequirementsInputSchema,
  McpProposeRankEntryInputSchema,
} from '../mcp.js';
import { PendingOperationSchema } from '../pending-operations.js';

describe('PendingOperationSchema', () => {
  it('round-trips its example', () => {
    const example = PendingOperationSchema.meta()?.example;
    expect(PendingOperationSchema.parse(example)).toEqual(example);
  });
});

describe('MCP tool inputs', () => {
  it('reject unknown properties', () => {
    expect(McpListStudentsInputSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(
      McpProposeRankEntryInputSchema.safeParse({
        studentUserId: 'u1',
        rankId: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
        date: '2026-11-20',
        verified: true,
      }).success,
    ).toBe(false);
  });

  it('publish additionalProperties: false at the top of their JSON Schema', () => {
    for (const input of [McpNextRankRequirementsInputSchema, McpProposeRankEntryInputSchema]) {
      const schema = input.toJSONSchema() as { additionalProperties?: unknown };
      expect(schema.additionalProperties).toBe(false);
    }
  });
});

describe('CASL vocabulary', () => {
  it('includes the MCP action and subjects', () => {
    expect(Actions).toContain('use');
    expect(Subjects).toEqual(expect.arrayContaining(['Mcp', 'PendingOperation']));
  });
});
