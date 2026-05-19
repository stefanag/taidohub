import { ListMembershipsQuerySchema } from '@repo/contracts/memberships';
import { createZodDto } from 'nestjs-zod';
export class ListMembershipsQueryDto extends createZodDto(ListMembershipsQuerySchema) {}
