import { MembershipRoleSchema } from '@repo/contracts/memberships';
import { z } from 'zod';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the "me" module — metadata about the currently
 * authenticated user that does not belong to any other entity slice.
 *
 * - `GET /api/me/memberships` — list `(organisationId, role)` rows for the
 *   authenticated user. Used by sidebar gating to decide whether to show
 *   instructor-only entries (e.g., the Students view).
 *
 * Responses are parsed with Zod so the frontend cannot drift away from the
 * backend's actual response shape.
 */

const MembershipRowSchema = z.object({
  organisationId: z.string().uuid(),
  role: MembershipRoleSchema,
});

const MembershipsResponseSchema = z.array(MembershipRowSchema);

export type Membership = z.infer<typeof MembershipRowSchema>;

export async function getMyMemberships(): Promise<Membership[]> {
  const raw = await httpClient('/api/me/memberships');
  return MembershipsResponseSchema.parse(raw);
}
