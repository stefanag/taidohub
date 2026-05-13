import { ListPostsQuerySchema } from '@repo/contracts/posts';
import { createZodDto } from 'nestjs-zod';

export class ListPostsQueryDto extends createZodDto(ListPostsQuerySchema) {}
