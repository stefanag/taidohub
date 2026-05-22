import { InviteUserSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class InviteUserDto extends createZodDto(InviteUserSchema) {}
