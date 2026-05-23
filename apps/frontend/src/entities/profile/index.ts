export type { UpdateUserProfileInput, UserProfile } from '@repo/contracts/profile';

export { getMyProfile, getUserProfile, updateMyProfile } from './api/profile.api.js';

export {
  myProfileQueryOptions,
  profileKeys,
  userProfileQueryOptions,
  useUpdateMyProfile,
} from './model/profile.queries.js';
