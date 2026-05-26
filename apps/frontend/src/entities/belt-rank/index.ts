export type {
  BeltRank,
  CreateBeltRankInput,
  UpdateBeltRankInput,
} from '@repo/contracts/ranks';

export {
  createBeltRank,
  deleteBeltRank,
  getBeltRank,
  getBeltRanks,
  updateBeltRank,
} from './api/belt-rank.api.js';

export {
  beltRankKeys,
  beltRankQueryOptions,
  listBeltRanksQueryOptions,
  useCreateBeltRank,
  useDeleteBeltRank,
  useUpdateBeltRank,
} from './model/belt-rank.queries.js';
