export type {
  BeltRank,
  CreateBeltRankInput,
  PublicRankResponse,
  UpdateBeltRankInput,
} from '@repo/contracts/ranks';

export {
  createBeltRank,
  deleteBeltRank,
  getBeltRank,
  getBeltRanks,
  getPublicRank,
  updateBeltRank,
} from './api/belt-rank.api.js';

export {
  beltRankKeys,
  beltRankQueryOptions,
  listBeltRanksQueryOptions,
  publicRankQueryOptions,
  useCreateBeltRank,
  useDeleteBeltRank,
  useUpdateBeltRank,
} from './model/belt-rank.queries.js';
