import type { Post } from '@repo/contracts/posts';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui';

export interface PostCardProps {
  post: Post;
}

/**
 * Read-only display of a Post — accepts the `Post` type from `@repo/contracts`
 * verbatim so server, MSW handlers, and UI all share one definition.
 */
export function PostCard({ post }: PostCardProps): React.ReactElement {
  const subtitle = post.published ? 'Published' : 'Draft';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{post.title}</CardTitle>
        <CardDescription>
          {subtitle} · {new Date(post.createdAt).toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">
          {post.content}
        </p>
      </CardContent>
    </Card>
  );
}
