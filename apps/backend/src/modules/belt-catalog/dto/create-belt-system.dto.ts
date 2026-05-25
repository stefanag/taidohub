import { CreateBeltSystemSchema } from '@repo/contracts/belt-systems';
import { createZodDto } from 'nestjs-zod';
export class CreateBeltSystemDto extends createZodDto(CreateBeltSystemSchema) {}
