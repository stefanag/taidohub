import { describe, expect, it } from 'vitest';

import { Subjects, SubjectSchema } from '../casl.js';

describe('SubjectSchema', () => {
  it('accepts OrganisationMembership', () => {
    expect(SubjectSchema.safeParse('OrganisationMembership').success).toBe(true);
  });

  it('Subjects export includes OrganisationMembership', () => {
    expect(Subjects).toContain('OrganisationMembership');
  });
});
