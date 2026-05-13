import { UpdatePostSchema } from '@repo/contracts/posts';
import { createZodDto } from 'nestjs-zod';

export class UpdatePostDto extends createZodDto(UpdatePostSchema) {}
