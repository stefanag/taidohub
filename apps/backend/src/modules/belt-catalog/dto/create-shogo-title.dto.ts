import { CreateShogoTitleSchema } from '@repo/contracts/shogo-titles';
import { createZodDto } from 'nestjs-zod';
export class CreateShogoTitleDto extends createZodDto(CreateShogoTitleSchema) {}
