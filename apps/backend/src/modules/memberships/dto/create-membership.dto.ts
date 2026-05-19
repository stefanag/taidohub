import { CreateMembershipSchema } from '@repo/contracts/memberships';
import { createZodDto } from 'nestjs-zod';
export class CreateMembershipDto extends createZodDto(CreateMembershipSchema) {}
