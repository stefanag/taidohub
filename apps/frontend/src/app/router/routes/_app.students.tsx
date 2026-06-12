import { createRoute } from '@tanstack/react-router';

import { StudentsPage } from '@/pages/students';

import { appLayoutRoute } from './_app.js';

/**
 * Instructor-facing student roster. Mounts under the existing `_app` layout
 * (so the session check + sidebar shell are inherited). Backend already
 * enforces that only instructors and sysadmins can list students.
 */
export const studentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/students',
  component: StudentsPage,
});

export const Route = studentsRoute;
