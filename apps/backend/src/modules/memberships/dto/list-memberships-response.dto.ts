import { ListMembershipsResponseSchema } from '@repo/contracts/memberships';
import { createZodDto } from 'nestjs-zod';
export class ListMembershipsResponseDto extends createZodDto(ListMembershipsResponseSchema) {}
