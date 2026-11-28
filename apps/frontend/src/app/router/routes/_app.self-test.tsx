import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { SelfTestPage } from '@/pages/self-test';

/** Authenticated `/self-test` route; the page handles the self-test flag being off. */
export const selfTestRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/self-test',
  component: SelfTestPage,
});

export const Route = selfTestRoute;
