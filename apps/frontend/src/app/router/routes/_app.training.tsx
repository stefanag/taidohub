import { createRoute } from '@tanstack/react-router';

import { appLayoutRoute } from './_app.js';

import { TrainingPage } from '@/pages/training';

/**
 * Authenticated `/training` route: the user's own training log and goals.
 * The page itself handles the training-log flag being off.
 */
export const trainingRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/training',
  component: TrainingPage,
});

export const Route = trainingRoute;
