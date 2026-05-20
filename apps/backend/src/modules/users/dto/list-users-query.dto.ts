import { ListUsersQuerySchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class ListUsersQueryDto extends createZodDto(ListUsersQuerySchema) {}
