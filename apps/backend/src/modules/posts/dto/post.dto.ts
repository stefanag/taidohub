import { PostSchema } from '@repo/contracts/posts';
import { createZodDto } from 'nestjs-zod';

export class PostDto extends createZodDto(PostSchema) {}
