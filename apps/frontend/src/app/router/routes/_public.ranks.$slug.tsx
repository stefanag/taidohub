import { createRoute } from '@tanstack/react-router';

import { PublicRankPage } from '@/pages/public-rank';

import { publicLayoutRoute } from './_public.js';

/**
 * Anonymous, public rank page. Mounted under the existing `_public` layout
 * (which already renders the global `Header` for non-auth public pages).
 * 404 is rendered by `PublicRankPage` itself when the slug is unknown or
 * the rank is not publicly visible — the backend returns 404 in both cases.
 */
export const publicRankRoute = createRoute({
  getParentRoute: () => publicLayoutRoute,
  path: '/ranks/$slug',
  component: PublicRankPage,
});

export const Route = publicRankRoute;
