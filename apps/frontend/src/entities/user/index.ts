export type {
  ListUsersQuery,
  ListUsersResponse,
  Role,
  UpdateUserInput,
  User,
} from '@repo/contracts/users';

export { listUsers, updateUser } from './api/user.api.js';

export {
  listUsersQueryOptions,
  useUpdateUser,
  userKeys,
  type UpdateUserVariables,
} from './model/user.queries.js';
