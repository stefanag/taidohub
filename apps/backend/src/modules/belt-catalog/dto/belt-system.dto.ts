import { BeltSystemSchema } from '@repo/contracts/belt-systems';
import { createZodDto } from 'nestjs-zod';
export class BeltSystemDto extends createZodDto(BeltSystemSchema) {}
