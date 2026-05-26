import { PublicRankResponseSchema } from '@repo/contracts/ranks';
import { createZodDto } from 'nestjs-zod';

export class PublicRankResponseDto extends createZodDto(PublicRankResponseSchema) {}
