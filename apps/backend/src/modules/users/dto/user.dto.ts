import { UserSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';

/** Response DTO mirroring `UserSchema`. */
export class UserDto extends createZodDto(UserSchema) {}
