import { UpdateShogoTitleSchema } from '@repo/contracts/shogo-titles';
import { createZodDto } from 'nestjs-zod';
export class UpdateShogoTitleDto extends createZodDto(UpdateShogoTitleSchema) {}
