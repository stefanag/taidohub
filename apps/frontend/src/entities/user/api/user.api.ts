import { AccountRoutes, UsersRoutes } from '@repo/contracts/routes';
import {
  AddUserResponseSchema,
  ListUsersResponseSchema,
  UserSchema,
  type AddUserInput,
  type AddUserResponse,
  type InviteUserInput,
  type ListUsersQuery,
  type ListUsersResponse,
  type SetInitialPasswordInput,
  type UpdateUserInput,
  type User,
} from '@repo/contracts/users';

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

export async function inviteUser(input: InviteUserInput): Promise<User> {
  const raw = await httpClient(UsersRoutes.invite, { method: 'POST', body: input });
  return UserSchema.parse(raw);
}

export async function addUser(input: AddUserInput): Promise<AddUserResponse> {
  const raw = await httpClient(UsersRoutes.add, { method: 'POST', body: input });
  return AddUserResponseSchema.parse(raw);
}

export async function deactivateUser(id: string): Promise<User> {
  const raw = await httpClient(UsersRoutes.deactivate(id), { method: 'PATCH' });
  return UserSchema.parse(raw);
}

export async function reactivateUser(id: string): Promise<User> {
  const raw = await httpClient(UsersRoutes.reactivate(id), { method: 'PATCH' });
  return UserSchema.parse(raw);
}

export async function deleteUser(id: string): Promise<void> {
  await httpClient(UsersRoutes.byId(id), { method: 'DELETE' });
}

export async function sendPasswordReset(id: string): Promise<void> {
  await httpClient(UsersRoutes.sendPasswordReset(id), { method: 'POST' });
}

export async function setInitialPassword(input: SetInitialPasswordInput): Promise<void> {
  await httpClient(AccountRoutes.setPassword, { method: 'POST', body: input });
}
