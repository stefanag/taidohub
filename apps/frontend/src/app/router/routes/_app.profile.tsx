import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { ProfilePage } from '@/pages/profile';


export const profileRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/profile',
  component: ProfilePage,
});

export const Route = profileRoute;
