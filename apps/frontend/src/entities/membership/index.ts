export type {
  CreateMembershipInput,
  ListMembershipsQuery,
  ListMembershipsResponse,
  MembershipRole,
  OrganisationMembership,
  UpdateMembershipInput,
} from '@repo/contracts/memberships';

export {
  createMembership,
  deleteMembership,
  listMemberships,
  updateMembership,
} from './api/membership.api.js';

export {
  listMembershipsQueryOptions,
  membershipKeys,
  useCreateMembership,
  useDeleteMembership,
  useUpdateMembership,
  type DeleteMembershipVariables,
  type UpdateMembershipVariables,
} from './model/membership.queries.js';
