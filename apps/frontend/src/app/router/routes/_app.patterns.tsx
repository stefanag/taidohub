import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { PatternsPage } from '@/pages/patterns';


/**
 * Authenticated-but-otherwise-open pattern catalogue. The `_app` parent
 * already handles the session check, so no extra `beforeLoad` is needed
 * here.
 */
export const patternsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/patterns',
  component: PatternsPage,
});

export const Route = patternsRoute;
