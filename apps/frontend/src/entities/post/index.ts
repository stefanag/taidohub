/**
 * Public API for `entities/post`.
 *
 * Other layers must import from `@/entities/post` — never reach into
 * `entities/post/api/...` directly.
 */
export type {
  CreatePostInput,
  ListPostsQuery,
  ListPostsResponse,
  Post,
  UpdatePostInput,
} from '@repo/contracts/posts';

export {
  createPost,
  deletePost,
  getPost,
  listPosts,
  updatePost,
} from './api/post.api.js';

export {
  listPostsQueryOptions,
  postKeys,
  postQueryOptions,
  useCreatePost,
  useDeletePost,
  useUpdatePost,
  type UpdatePostVariables,
} from './model/post.queries.js';

export { postHandlers, resetPostStore } from './model/post.msw.js';

export { PostCard, type PostCardProps } from './ui/PostCard.js';
