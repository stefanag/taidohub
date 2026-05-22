import { SetInitialPasswordSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class SetInitialPasswordDto extends createZodDto(SetInitialPasswordSchema) {}
