import { ListPostsResponseSchema } from '@repo/contracts/posts';
import { createZodDto } from 'nestjs-zod';

export class ListPostsResponseDto extends createZodDto(ListPostsResponseSchema) {}
