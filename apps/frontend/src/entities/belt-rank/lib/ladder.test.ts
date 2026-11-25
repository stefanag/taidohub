import { describe, expect, it } from 'vitest';

import { ranksForOrganisation } from './ladder.js';

import type { BeltRank } from '@repo/contracts/ranks';

const rank = (id: string, organisationId: string | null): BeltRank =>
  ({ id, organisationId }) as BeltRank;

const RANKS = [rank('g-1dan', null), rank('s-1dan', 'sweta'), rank('g-2dan', null)];

describe('ranksForOrganisation', () => {
  it("returns the organisation's own ladder", () => {
    expect(ranksForOrganisation(RANKS, 'sweta').map((r) => r.id)).toEqual(['s-1dan']);
  });

  it('falls back to the global ladder for an organisation without its own', () => {
    expect(ranksForOrganisation(RANKS, 'other').map((r) => r.id)).toEqual(['g-1dan', 'g-2dan']);
  });

  it('returns the global ladder for no organisation', () => {
    expect(ranksForOrganisation(RANKS, null).map((r) => r.id)).toEqual(['g-1dan', 'g-2dan']);
  });
});
