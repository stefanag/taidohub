import { OrganisationMembershipSchema } from '@repo/contracts/memberships';
import { createZodDto } from 'nestjs-zod';
export class OrganisationMembershipDto extends createZodDto(OrganisationMembershipSchema) {}
