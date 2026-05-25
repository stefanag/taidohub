import { RankHistorySchema } from '@repo/contracts/rank-history';
import { createZodDto } from 'nestjs-zod';
export class RankHistoryDto extends createZodDto(RankHistorySchema) {}
