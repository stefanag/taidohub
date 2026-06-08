import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FLAGS,
  FEATURE_FLAG_CODES,
  FeatureFlagCodeSchema,
  FeatureFlagMapSchema,
  FeatureFlagSchema,
  UpdateFeatureFlagSchema,
} from '../feature-flags.js';

describe('FEATURE_FLAG_CODES', () => {
  it('exposes the three current codes', () => {
    expect(FEATURE_FLAG_CODES).toEqual([
      'grading-history',
      'grading-history-verification',
      'instructor-feedback',
    ]);
  });
});

describe('FeatureFlagCodeSchema', () => {
  it('accepts each known code', () => {
    for (const code of FEATURE_FLAG_CODES) {
      expect(FeatureFlagCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects unknown codes', () => {
    expect(FeatureFlagCodeSchema.safeParse('not-a-flag').success).toBe(false);
  });
});

describe('DEFAULT_FLAGS', () => {
  it('is an all-false map keyed by every known code', () => {
    expect(Object.keys(DEFAULT_FLAGS).sort()).toEqual([...FEATURE_FLAG_CODES].sort());
    for (const value of Object.values(DEFAULT_FLAGS)) {
      expect(value).toBe(false);
    }
  });
});

describe('FeatureFlagMapSchema', () => {
  it('accepts a fully-populated map', () => {
    const value = Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, true]));
    expect(FeatureFlagMapSchema.safeParse(value).success).toBe(true);
  });

  it('rejects when a known code is missing', () => {
    const value = Object.fromEntries(FEATURE_FLAG_CODES.slice(1).map((code) => [code, false]));
    expect(FeatureFlagMapSchema.safeParse(value).success).toBe(false);
  });

  it('rejects non-boolean values', () => {
    const value = Object.fromEntries(FEATURE_FLAG_CODES.map((code) => [code, 'on']));
    expect(FeatureFlagMapSchema.safeParse(value).success).toBe(false);
  });
});

describe('FeatureFlagSchema', () => {
  const BASE = {
    code: 'grading-history' as const,
    enabled: true,
    updatedAt: '2026-06-08T10:00:00.000Z',
    updatedById: 'u-1',
  };

  it('accepts a row with all fields populated', () => {
    expect(FeatureFlagSchema.safeParse(BASE).success).toBe(true);
  });

  it('accepts updatedById: null (post user delete)', () => {
    expect(FeatureFlagSchema.safeParse({ ...BASE, updatedById: null }).success).toBe(true);
  });

  it('rejects an unknown code', () => {
    expect(FeatureFlagSchema.safeParse({ ...BASE, code: 'nope' }).success).toBe(false);
  });
});

describe('UpdateFeatureFlagSchema', () => {
  it('accepts { enabled: true }', () => {
    expect(UpdateFeatureFlagSchema.safeParse({ enabled: true }).success).toBe(true);
  });

  it('accepts { enabled: false }', () => {
    expect(UpdateFeatureFlagSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(UpdateFeatureFlagSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-boolean enabled', () => {
    expect(UpdateFeatureFlagSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
  });
});
