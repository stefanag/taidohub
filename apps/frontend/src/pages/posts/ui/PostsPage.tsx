import { useQuery } from '@tanstack/react-query';

import { listPostsQueryOptions, PostCard } from '@/entities/post';
import { Can } from '@/shared/lib/casl/ability-context';
import { Button } from '@/shared/ui';

/**
 * Listing page for posts. Fetches via TanStack Query and gates the
 * "New post" button behind the CASL `<Can I="create" a="Post">` check, so
 * anonymous visitors never see it (and an admin/user does).
 */
export function PostsPage(): React.ReactElement {
  const { data, isLoading, isError, error } = useQuery(
    listPostsQueryOptions({ page: 1, perPage: 20 }),
  );

  return (
    <main className="container py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Posts</h1>
        <Can I="create" a="Post">
          <Button>New post</Button>
        </Can>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-destructive">
          Failed to load posts: {error instanceof Error ? error.message : 'unknown error'}
        </p>
      ) : (
        <ul className="space-y-4">
          {data?.data.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
