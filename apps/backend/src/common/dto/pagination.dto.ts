import { ListPostsQuerySchema } from '@repo/contracts/posts';
import { createZodDto } from 'nestjs-zod';

/**
 * Generic offset/limit DTO derived from `ListPostsQuerySchema` — the same
 * shape is used by every paginated endpoint until a more specific query DTO
 * is needed.
 */
export class PaginationDto extends createZodDto(ListPostsQuerySchema) {}
