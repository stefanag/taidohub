import {
  GradingRequirementsSchema,
  RankRequirementsRoutes,
  type GradingRequirements,
  type SetAgeGroupsInput,
  type SetGradingRequirementsInput,
} from '@repo/contracts';

import { httpClient } from '@/shared/api';

/**
 * Network surface for the RankRequirement module.
 *
 * Responses are parsed with the Zod schemas from `@repo/contracts`
 * so the frontend cannot drift away from the backend's actual response shape.
 *
 * - `GET    /api/requirements/:rankId`                     — resolve for the acting user.
 * - `GET    /api/requirements/:rankId?forUserId=<userId>`  — resolve for a specific user.
 * - `GET    /api/requirements/:rankId?setId=<setId>`        — resolve within a specific set.
 * - `PUT    /api/requirements/:rankId`                      — whole-scope replace.
 * - `DELETE /api/requirements/:rankId?setId=<setId>`        — clear within a specific set.
 */

export async function getRequirements(rankId: string): Promise<GradingRequirements> {
  const raw = await httpClient(RankRequirementsRoutes.byRankId(rankId));
  return GradingRequirementsSchema.parse(raw);
}

export async function getRequirementsForUser(
  rankId: string,
  userId: string,
): Promise<GradingRequirements> {
  const raw = await httpClient(
    `${RankRequirementsRoutes.byRankId(rankId)}?forUserId=${encodeURIComponent(userId)}`,
  );
  return GradingRequirementsSchema.parse(raw);
}

/** Within a set: the base requirement, or one age group's variant. */
export async function getRequirementsForSet(
  rankId: string,
  setId: string,
  ageGroupId: string | null = null,
): Promise<GradingRequirements> {
  const group = ageGroupId ? `&ageGroupId=${encodeURIComponent(ageGroupId)}` : '';
  const raw = await httpClient(
    `${RankRequirementsRoutes.byRankId(rankId)}?setId=${encodeURIComponent(setId)}${group}`,
  );
  return GradingRequirementsSchema.parse(raw);
}

/** Whole-list replace of a kyu or dan rank's age groups in a set. */
export async function setAgeGroups(rankId: string, body: SetAgeGroupsInput): Promise<GradingRequirements> {
  const raw = await httpClient(`${RankRequirementsRoutes.byRankId(rankId)}/age-groups`, {
    method: 'PUT',
    body,
  });
  return GradingRequirementsSchema.parse(raw);
}

export async function setRequirements(
  rankId: string,
  body: SetGradingRequirementsInput,
): Promise<GradingRequirements> {
  const raw = await httpClient(RankRequirementsRoutes.byRankId(rankId), {
    method: 'PUT',
    body,
  });
  return GradingRequirementsSchema.parse(raw);
}

export async function clearRequirements(rankId: string, setId: string): Promise<void> {
  await httpClient(
    `${RankRequirementsRoutes.byRankId(rankId)}?setId=${encodeURIComponent(setId)}`,
    { method: 'DELETE' },
  );
}
