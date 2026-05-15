import { useTranslation } from 'react-i18next';

import type { Post } from '@repo/contracts/posts';

import { formatDate } from '@/i18n/formatters';
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
  const { t } = useTranslation();
  const subtitle = post.published ? t('posts.published') : t('posts.draft');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{post.title}</CardTitle>
        <CardDescription>
          {subtitle} · {formatDate(post.createdAt)}
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
