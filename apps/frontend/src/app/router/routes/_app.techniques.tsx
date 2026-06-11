import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { TechniquesPage } from '@/pages/techniques';


/**
 * Authenticated-but-otherwise-open technique catalogue. The `_app` parent
 * already handles the session check, so no extra `beforeLoad` is needed
 * here.
 */
export const techniquesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/techniques',
  component: TechniquesPage,
});

export const Route = techniquesRoute;
