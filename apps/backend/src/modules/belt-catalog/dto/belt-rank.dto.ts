import { BeltRankSchema } from '@repo/contracts/ranks';
import { createZodDto } from 'nestjs-zod';
export class BeltRankDto extends createZodDto(BeltRankSchema) {}
