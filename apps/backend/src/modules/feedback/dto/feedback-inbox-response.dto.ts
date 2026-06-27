import { createZodDto } from 'nestjs-zod';

import { FeedbackInboxResponseSchema } from '@repo/contracts/feedback';

/**
 * `GET /api/feedback/inbox` response shape — the `Paginated<T>`
 * envelope introduced in Chunk 3.1 (`{ data, nextCursor }`).
 *
 * Wired here so the OpenAPI generator emits the schema by `$ref`
 * instead of an empty 200 — chunk 4.1 closes a loose end that 3.1
 * left open (the contract was correct but the endpoint never
 * registered a response decorator, so the generated spec hid the
 * envelope shape).
 */
export class FeedbackInboxResponseDto extends createZodDto(FeedbackInboxResponseSchema) {}
