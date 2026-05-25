import { ShogoTitleSchema } from '@repo/contracts/shogo-titles';
import { createZodDto } from 'nestjs-zod';
export class ShogoTitleDto extends createZodDto(ShogoTitleSchema) {}
