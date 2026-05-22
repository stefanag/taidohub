export type {
  InviteUserInput,
  ListUsersQuery,
  ListUsersResponse,
  Role,
  SetInitialPasswordInput,
  UpdateUserInput,
  User,
} from '@repo/contracts/users';

export {
  deactivateUser,
  deleteUser,
  inviteUser,
  listUsers,
  reactivateUser,
  sendPasswordReset,
  setInitialPassword,
  updateUser,
} from './api/user.api.js';

export {
  listUsersQueryOptions,
  useDeactivateUser,
  useDeleteUser,
  useInviteUser,
  useReactivateUser,
  useSendPasswordReset,
  useUpdateUser,
  userKeys,
  type UpdateUserVariables,
} from './model/user.queries.js';
