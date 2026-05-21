import { UpdateUserSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
