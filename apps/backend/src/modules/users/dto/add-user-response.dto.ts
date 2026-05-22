import { AddUserResponseSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class AddUserResponseDto extends createZodDto(AddUserResponseSchema) {}
