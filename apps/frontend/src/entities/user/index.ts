export type {
  AddUserInput,
  AddUserResponse,
  InviteUserInput,
  ListUsersQuery,
  ListUsersResponse,
  Role,
  SetInitialPasswordInput,
  UpdateUserInput,
  User,
} from '@repo/contracts/users';

export {
  addUser,
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
  useAddUser,
  useDeactivateUser,
  useDeleteUser,
  useInviteUser,
  useReactivateUser,
  useSendPasswordReset,
  useUpdateUser,
  userKeys,
  type UpdateUserVariables,
} from './lib/hooks.js';
