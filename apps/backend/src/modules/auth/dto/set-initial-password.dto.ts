import { AcceptLinkWithGoogleSchema, SetInitialPasswordSchema } from '@repo/contracts/users';
import { createZodDto } from 'nestjs-zod';
export class SetInitialPasswordDto extends createZodDto(SetInitialPasswordSchema) {}

export class AcceptLinkWithGoogleDto extends createZodDto(AcceptLinkWithGoogleSchema) {}
