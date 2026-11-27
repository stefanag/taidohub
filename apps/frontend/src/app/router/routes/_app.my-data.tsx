import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { MyDataPage } from '@/pages/my-data';

/** Authenticated `/my-data` route: a printable summary of the user's own data. */
export const myDataRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/my-data',
  component: MyDataPage,
});

export const Route = myDataRoute;
