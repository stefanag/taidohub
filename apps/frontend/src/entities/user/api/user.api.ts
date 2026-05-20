import {
  ListUsersResponseSchema,
  UserSchema,
  type ListUsersQuery,
  type ListUsersResponse,
  type UpdateUserInput,
  type User,
} from '@repo/contracts/users';
import { UsersRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the admin-facing User operations. */

export async function listUsers(query: ListUsersQuery): Promise<ListUsersResponse> {
  const raw = await httpClient(UsersRoutes.base, {
    query: {
      q: query.q,
      role: query.role,
      deactivated: query.deactivated,
      page: query.page,
      perPage: query.perPage,
    },
  });
  return ListUsersResponseSchema.parse(raw);
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const raw = await httpClient(UsersRoutes.byId(id), { method: 'PATCH', body: input });
  return UserSchema.parse(raw);
}
