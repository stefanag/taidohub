import type { BeltRank } from '@repo/contracts/ranks';

/**
 * The ranks of one organisation's ladder: its own ranks if it has any,
 * otherwise the global ranks (`organisationId = null`). This is the same
 * rule the backend uses to resolve a rank for a requirement set.
 *
 * The catalogue holds several ladders side by side (the global one and,
 * for example, the Swedish federation's), with ranks of the same name in
 * each, so a list of every rank shows "1 Dan" twice.
 */
export function ranksForOrganisation(
  ranks: readonly BeltRank[],
  organisationId: string | null,
): BeltRank[] {
  if (organisationId !== null) {
    const own = ranks.filter((r) => r.organisationId === organisationId);
    if (own.length > 0) return own;
  }
  return ranks.filter((r) => r.organisationId === null);
}
