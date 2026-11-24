import {
  ListPendingOperationsQuerySchema,
  ListPendingOperationsResponseSchema,
  PendingOperationSchema,
} from '@repo/contracts/pending-operations';
import { createZodDto } from 'nestjs-zod';

export class PendingOperationDto extends createZodDto(PendingOperationSchema) {}
export class ListPendingOperationsQueryDto extends createZodDto(ListPendingOperationsQuerySchema) {}
export class ListPendingOperationsResponseDto extends createZodDto(ListPendingOperationsResponseSchema) {}
