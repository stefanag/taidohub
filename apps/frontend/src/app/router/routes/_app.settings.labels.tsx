import { createRoute } from '@tanstack/react-router';

import { SettingsLabelsPage } from '@/pages/settings-labels';

import { appLayoutRoute } from './_app.js';

/**
 * `/settings/labels` — admin surface for tags and categories. Lives under the
 * `_app` layout so the parent's session check applies; no extra role guard
 * here because org-scoped CRUD is allowed for any authenticated user. The
 * feature components themselves hide global-label editing from non-sysadmins.
 */
export const settingsLabelsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings/labels',
  component: SettingsLabelsPage,
});

export const Route = settingsLabelsRoute;
