import { UpdateUserProfileSchema } from '@repo/contracts/profile';
import { createZodDto } from 'nestjs-zod';

export class UpdateUserProfileDto extends createZodDto(UpdateUserProfileSchema) {}
