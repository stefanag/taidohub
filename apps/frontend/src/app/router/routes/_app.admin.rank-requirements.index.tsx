import { createRoute } from '@tanstack/react-router';

import { adminRankRequirementsRoute } from './_app.admin.rank-requirements.js';

import { AdminRankRequirementsPage } from '@/pages/admin-rank-requirements';

/**
 * `?setId=&rankId=` — both optional; the page shows selection prompts until
 * both are chosen, then embeds `<RankRequirementsEditor>`. Kept as plain
 * strings (not UUID-validated) so an invalid/stale id in the URL degrades
 * to "not found in the list" rather than a route-level crash.
 */
interface RankRequirementsSearch {
  setId?: string;
  rankId?: string;
}

export const adminRankRequirementsIndexRoute = createRoute({
  getParentRoute: () => adminRankRequirementsRoute,
  path: '/',
  validateSearch: (input: Record<string, unknown>): RankRequirementsSearch => {
    const setId = typeof input.setId === 'string' ? input.setId : undefined;
    const rankId = typeof input.rankId === 'string' ? input.rankId : undefined;
    return {
      ...(setId !== undefined && { setId }),
      ...(rankId !== undefined && { rankId }),
    };
  },
  component: AdminRankRequirementsPage,
});

export const Route = adminRankRequirementsIndexRoute;
