import {
  UserProfileSchema,
  type UpdateUserProfileInput,
  type UserProfile,
} from '@repo/contracts/profile';
import { UsersRoutes } from '@repo/contracts/routes';

import { httpClient } from '@/shared/api';

/** Network surface for the UserProfile entity. */

export async function getMyProfile(): Promise<UserProfile> {
  const raw = await httpClient(UsersRoutes.meProfile);
  return UserProfileSchema.parse(raw);
}

export async function updateMyProfile(input: UpdateUserProfileInput): Promise<UserProfile> {
  const raw = await httpClient(UsersRoutes.meProfile, { method: 'PATCH', body: input });
  return UserProfileSchema.parse(raw);
}

export async function getUserProfile(id: string): Promise<UserProfile> {
  const raw = await httpClient(UsersRoutes.profileById(id));
  return UserProfileSchema.parse(raw);
}
