import { describe, expect, it } from 'vitest';

import { ClubJoinRequestSchema, CreateClubJoinRequestSchema } from '../club-join-requests.js';

describe('club join request contract', () => {
  it('round-trips its example', () => {
    const example = ClubJoinRequestSchema.meta()?.example;
    expect(ClubJoinRequestSchema.parse(example)).toEqual(example);
  });

  it('caps the message', () => {
    const organisationId = 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e';
    expect(CreateClubJoinRequestSchema.safeParse({ organisationId, message: 'x'.repeat(1001) }).success).toBe(false);
    expect(CreateClubJoinRequestSchema.parse({ organisationId }).message).toBeUndefined();
  });
});
