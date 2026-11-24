import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { PendingOperationsPage } from '@/pages/pending-operations';


/**
 * Authenticated `/pending-operations` route: proposals made by AI clients,
 * waiting for the user to approve or reject them.
 */
export const pendingOperationsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/pending-operations',
  component: PendingOperationsPage,
});

export const Route = pendingOperationsRoute;
