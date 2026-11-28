import { type JudgedAgainst } from '@repo/contracts/rank-history';

import { type DbRankHistory } from '../../infrastructure/database/schema/rank-history.js';

/**
 * The requirement snapshot of a grading for the API: null until the row is
 * verified (or when the snapshot found no requirement set).
 */
export function toJudgedAgainst(row: DbRankHistory): JudgedAgainst | null {
  if (!row.verified || (row.judgedSetName === null && row.judgedSetId === null)) return null;
  return {
    requirementSetId: row.judgedSetId,
    requirementSetName: row.judgedSetName,
    ageGroupId: row.judgedAgeGroupId,
    ageFrom: row.judgedAgeFrom,
    ageTo: row.judgedAgeTo,
    ageBasis: row.judgedAgeBasis,
  };
}
