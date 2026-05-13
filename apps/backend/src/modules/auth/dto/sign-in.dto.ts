import { SignInWithEmailSchema } from '@repo/contracts/auth';
import { createZodDto } from 'nestjs-zod';

export class SignInWithEmailDto extends createZodDto(SignInWithEmailSchema) {}
