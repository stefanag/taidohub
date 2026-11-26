import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { AdminLegalDocumentsPage } from '@/pages/admin-legal-documents';

/**
 * Terms and privacy texts. Under `_app`, so a session is required; who may
 * edit which owner's texts (sysadmin: all; orgadmin: their organisations) is
 * decided by the page from the user's memberships and enforced by the API.
 */
export const adminLegalDocumentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/admin/legal-documents',
  component: AdminLegalDocumentsPage,
});

export const Route = adminLegalDocumentsRoute;
