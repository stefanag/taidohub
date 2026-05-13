import { CreatePostSchema } from '@repo/contracts/posts';
import { createZodDto } from 'nestjs-zod';

export class CreatePostDto extends createZodDto(CreatePostSchema) {}
