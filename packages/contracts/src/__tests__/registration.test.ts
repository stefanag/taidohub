import { describe, expect, it } from 'vitest';

import { ageOn, RegisterInputSchema } from '../registration.js';

describe('registration contract', () => {
  it('counts whole years, turning a year older on the birthday', () => {
    expect(ageOn('2013-11-27', '2026-11-26')).toBe(12);
    expect(ageOn('2013-11-26', '2026-11-26')).toBe(13);
    expect(ageOn('2012-02-29', '2025-02-28')).toBe(12);
    expect(ageOn('2012-02-29', '2025-03-01')).toBe(13);
  });

  it('round-trips its example', () => {
    const example = RegisterInputSchema.meta()?.example;
    expect(RegisterInputSchema.parse(example)).toEqual(example);
  });
});
