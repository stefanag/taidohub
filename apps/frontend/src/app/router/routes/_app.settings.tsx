import { createRoute, Outlet } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

/**
 * Layout under `/settings`. The settings hub (index) + the
 * `/settings/labels` admin sit underneath as siblings. Without this
 * Outlet wrapper, the codegen would make `/settings/labels` a child
 * of the hub route, which would have to render an `<Outlet />` to
 * pass the child through — but if the hub renders the hub page
 * component instead, the child silently never mounts. Same shape
 * fix as `_app.students.tsx` and `_app.admin.<resource>.tsx`.
 *
 * The `check-route-mount` script enforces this pattern repo-wide
 * (Chunk 3.3) — adding a sibling under any new path now fails CI
 * if the parent forgets the Outlet split.
 */
export const settingsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/settings',
  component: () => <Outlet />,
});

export const Route = settingsRoute;
