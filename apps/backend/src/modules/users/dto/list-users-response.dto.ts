import { ListUsersResponseSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class ListUsersResponseDto extends createZodDto(ListUsersResponseSchema) {}
