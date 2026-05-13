/**
 * Uniform error envelope returned by the backend for every non-2xx response.
 *
 *   { error: { code, message, details? } }
 */
import { z } from './zod-openapi.js';

export const ErrorPayloadSchema = z
  .object({
    code: z.string().describe('Stable, machine-readable error code (e.g. `VALIDATION_FAILED`).'),
    message: z.string().describe('Human-readable error message safe to surface to end users.'),
    details: z
      .unknown()
      .optional()
      .describe('Optional structured context — e.g. per-field validation errors.'),
  })
  .meta({
    id: 'ErrorPayload',
    description: 'The body of a uniform error envelope.',
    example: {
      code: 'NOT_FOUND',
      message: 'The requested resource could not be found.',
    },
  });

export const ErrorEnvelopeSchema = z
  .object({
    error: ErrorPayloadSchema,
  })
  .meta({
    id: 'ErrorEnvelope',
    description:
      'The uniform error envelope returned for every non-2xx response from the API.',
    example: {
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource could not be found.',
      },
    },
  });

export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

/**
 * Common error codes used across the API. Not exhaustive; modules may add
 * their own codes, but they should reuse these whenever the semantics match.
 */
export const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE: 'UNPROCESSABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const ErrorEnvelopeOpenApiRegistry = {
  ErrorEnvelope: ErrorEnvelopeSchema,
  ErrorPayload: ErrorPayloadSchema,
} as const;
