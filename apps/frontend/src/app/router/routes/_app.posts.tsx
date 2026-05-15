import { createRoute } from '@tanstack/react-router';

import { PostsPage } from '@/pages/posts';

import { appLayoutRoute } from './_app.js';

export const postsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/posts',
  component: PostsPage,
});

export const Route = postsRoute;
