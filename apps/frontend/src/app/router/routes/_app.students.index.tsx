import { createRoute } from '@tanstack/react-router';

import { StudentsPage } from '@/pages/students';

import { studentsRoute } from './_app.students.js';

/**
 * Index of `/students` — the roster. The parent (`_app.students.tsx`)
 * is an Outlet-only layout, so this index renders here, and
 * `_app.students.$userId.tsx` renders for `/students/<id>` as a sibling
 * instead of being trapped inside the roster's component tree.
 */
export const studentsIndexRoute = createRoute({
  getParentRoute: () => studentsRoute,
  path: '/',
  component: StudentsPage,
});

export const Route = studentsIndexRoute;
