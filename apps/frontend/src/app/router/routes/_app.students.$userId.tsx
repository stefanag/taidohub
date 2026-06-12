import { createRoute } from '@tanstack/react-router';

import { StudentDetailPage } from '@/pages/student-detail';

import { appLayoutRoute } from './_app.js';

/**
 * Per-student progress view. The backend returns 403 if the calling
 * instructor cannot see this student; the page renders that as an inline
 * forbidden message rather than a stack trace.
 */
export const studentDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/students/$userId',
  component: StudentDetailPage,
});

export const Route = studentDetailRoute;
