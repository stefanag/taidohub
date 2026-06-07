import { createRoute } from '@tanstack/react-router';

import { SettingsPage } from '@/pages/settings';

import { appLayoutRoute } from './_app.js';

export const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings',
  component: SettingsPage,
});

export const Route = settingsRoute;
