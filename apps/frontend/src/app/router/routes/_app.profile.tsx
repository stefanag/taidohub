import { createRoute } from '@tanstack/react-router';

import { ProfilePage } from '@/pages/profile';

import { appLayoutRoute } from './_app.js';

export const profileRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/profile',
  component: ProfilePage,
});

export const Route = profileRoute;
