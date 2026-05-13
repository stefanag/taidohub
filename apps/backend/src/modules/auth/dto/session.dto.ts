import { SessionSchema } from '@repo/contracts/auth';
import { createZodDto } from 'nestjs-zod';

export class SessionDto extends createZodDto(SessionSchema) {}
