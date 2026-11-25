import { createRoute } from '@tanstack/react-router';

import { settingsRoute } from './_app.settings.js';

import { SettingsPage } from '@/pages/settings';


/**
 * Index of `/settings` — the hub page. The parent
 * (`_app.settings.tsx`) is an Outlet-only layout, so this index
 * renders here, and `_app.settings.labels.tsx` renders for
 * `/settings/labels` as a sibling instead of being trapped inside
 * the hub's component tree.
 */
export const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  component: SettingsPage,
});

export const Route = settingsIndexRoute;
