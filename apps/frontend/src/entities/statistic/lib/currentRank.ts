import type { UserStatsRankCoverage } from '@repo/contracts/statistics';

/**
 * Pick the "current" rank from a user's coverage rows — the row with the
 * highest `rank.sortOrder`. Returns undefined for empty input.
 *
 * Extracted from ProfilePage / StudentsPage which both used the same
 * `reduce` inline. Same tie-break behaviour as the original (first match
 * on equal sortOrder).
 */
export function currentRank(
  coverage: readonly UserStatsRankCoverage[],
): UserStatsRankCoverage | undefined {
  return coverage.reduce<UserStatsRankCoverage | undefined>(
    (acc, row) => (acc === undefined || row.rank.sortOrder > acc.rank.sortOrder ? row : acc),
    undefined,
  );
}
