import { describe, expect, it } from 'vitest';
import {
  HokeiGroupInputSchema,
  SetGradingRequirementsSchema,
  CreateRequirementSetSchema,
  CloneRequirementSetSchema,
} from '../grading-requirements.js';

describe('HokeiGroupInputSchema', () => {
  it('defaults pickCount=1, groupOrder=0, isTested=false', () => {
    const parsed = HokeiGroupInputSchema.parse({
      patternIds: ['7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5'],
    });
    expect(parsed.pickCount).toBe(1);
    expect(parsed.groupOrder).toBe(0);
    expect(parsed.isTested).toBe(false);
  });

  it('rejects empty patternIds', () => {
    expect(() => HokeiGroupInputSchema.parse({ patternIds: [] })).toThrow();
  });
});

describe('SetGradingRequirementsSchema', () => {
  it('requires setId', () => {
    expect(() => SetGradingRequirementsSchema.parse({})).toThrow();
  });

  it('defaults every array to []', () => {
    const parsed = SetGradingRequirementsSchema.parse({ setId: 'set-1' });
    expect(parsed.kobo).toEqual([]);
    expect(parsed.kihon).toEqual([]);
    expect(parsed.otherPatterns).toEqual([]);
    expect(parsed.hokeiGroups).toEqual([]);
    expect(parsed.jissenTested).toBe(false);
    expect(parsed.requiresEssay).toBe(false);
  });

  it('accepts jissenMinutes null', () => {
    const parsed = SetGradingRequirementsSchema.parse({
      setId: 'set-1',
      jissenMinutes: null,
    });
    expect(parsed.jissenMinutes).toBeNull();
  });

  it('rejects negative jissenMinutes', () => {
    expect(() =>
      SetGradingRequirementsSchema.parse({ setId: 'set-1', jissenMinutes: -1 }),
    ).toThrow();
  });
});

describe('CreateRequirementSetSchema', () => {
  it('requires ISO date for effectiveDate', () => {
    expect(() =>
      CreateRequirementSetSchema.parse({ name: 'x', effectiveDate: '2026-13-99' }),
    ).toThrow();
    expect(() =>
      CreateRequirementSetSchema.parse({ name: 'x', effectiveDate: '2026-07-01' }),
    ).not.toThrow();
  });
});

describe('CloneRequirementSetSchema', () => {
  it('makes name optional', () => {
    expect(CloneRequirementSetSchema.parse({}).name).toBeUndefined();
    expect(CloneRequirementSetSchema.parse({ name: 'Copy' }).name).toBe('Copy');
  });
});
