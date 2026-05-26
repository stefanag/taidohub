export type {
  BeltSystem,
  CreateBeltSystemInput,
  UpdateBeltSystemInput,
} from '@repo/contracts/belt-systems';

export {
  createBeltSystem,
  deleteBeltSystem,
  getBeltSystems,
  updateBeltSystem,
} from './api/belt-system.api.js';

export {
  beltSystemKeys,
  listBeltSystemsQueryOptions,
  useCreateBeltSystem,
  useDeleteBeltSystem,
  useUpdateBeltSystem,
} from './model/belt-system.queries.js';
