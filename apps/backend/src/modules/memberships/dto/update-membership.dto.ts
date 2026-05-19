import { UpdateMembershipSchema } from '@repo/contracts/memberships';
import { createZodDto } from 'nestjs-zod';
export class UpdateMembershipDto extends createZodDto(UpdateMembershipSchema) {}
