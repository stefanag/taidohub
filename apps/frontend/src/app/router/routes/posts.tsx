import { createRoute, redirect } from '@tanstack/react-router';

import { PostsPage } from '@/pages/posts';
import { authClient } from '@/features/auth-by-email';

import { rootRoute } from './__root.js';

export const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts',
  beforeLoad: async () => {
    // Auth-protected: bounce to /login if there is no session.
    const result = await authClient.getSession();
    if (!result.data) {
      throw redirect({ to: '/login' });
    }
  },
  component: PostsPage,
});

export const Route = postsRoute;
