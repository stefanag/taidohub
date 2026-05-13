import { SignUpWithEmailSchema } from '@repo/contracts/auth';
import { createZodDto } from 'nestjs-zod';

export class SignUpWithEmailDto extends createZodDto(SignUpWithEmailSchema) {}
