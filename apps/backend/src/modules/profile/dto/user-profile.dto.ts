import { UserProfileSchema } from '@repo/contracts/profile';
import { createZodDto } from 'nestjs-zod';

export class UserProfileDto extends createZodDto(UserProfileSchema) {}
