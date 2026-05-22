import { AddUserSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class AddUserDto extends createZodDto(AddUserSchema) {}
