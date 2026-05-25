import { UpdateBeltSystemSchema } from '@repo/contracts/belt-systems';
import { createZodDto } from 'nestjs-zod';
export class UpdateBeltSystemDto extends createZodDto(UpdateBeltSystemSchema) {}
