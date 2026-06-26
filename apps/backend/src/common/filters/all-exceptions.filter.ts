import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCodes, type ErrorEnvelope } from '@repo/contracts/errors';
import { type Response } from 'express';
import { ZodError } from 'zod';

/** Hard cap on cause-chain depth so a self-referential `.cause` can't loop. */
const MAX_CAUSE_DEPTH = 10;

/**
 * Recursively format an Error's `cause` chain into a human-readable
 * multi-line string for the 5xx log. The HTTP response stays the
 * opaque "Internal server error." envelope — this is server-side
 * diagnostics only.
 *
 * Example output:
 *
 *   DrizzleQueryError: Failed query: SELECT … FROM belt_rank …
 *     ↳ PostgresError [42P01]: relation "belt_rank" does not exist
 *
 * Each layer renders `Name [code]: message`. The chain is walked via
 * `cause`, which Node's Error has natively since v16.9 and which
 * Drizzle / postgres-js / better-auth all use. A `seen` set guards
 * against cycles; `MAX_CAUSE_DEPTH` is a backstop against very long
 * legitimate chains.
 *
 * Exported (rather than a private method on the filter) so the unit
 * test can drive it without instantiating Nest's `ArgumentsHost`.
 */
export function formatCauseChain(err: unknown): string {
  const lines: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  let depth = 0;

  while (current !== undefined && current !== null) {
    if (seen.has(current)) {
      lines.push(`${indentFor(depth)}↳ (cycle in cause chain — truncated)`);
      break;
    }
    seen.add(current);

    if (depth >= MAX_CAUSE_DEPTH) {
      lines.push(`${indentFor(depth)}↳ (cause chain exceeds ${MAX_CAUSE_DEPTH} layers — truncated)`);
      break;
    }

    lines.push(formatLayer(current, depth));

    // `cause` exists on `Error` instances since ES2022; non-Error objects
    // may also carry it (postgres-js's PostgresError sets it on a plain
    // object in some paths). Read defensively.
    const next = (current as { cause?: unknown }).cause;
    if (next === undefined) break;
    current = next;
    depth += 1;
  }

  return lines.join('\n');
}

function indentFor(depth: number): string {
  return depth === 0 ? '' : '  '.repeat(depth);
}

function formatLayer(layer: unknown, depth: number): string {
  const prefix = depth === 0 ? '' : `${indentFor(depth)}↳ `;
  if (layer instanceof Error) {
    const code = readCode(layer);
    const name = layer.name || 'Error';
    const codeLabel = code !== undefined ? ` [${code}]` : '';
    return `${prefix}${name}${codeLabel}: ${layer.message}`;
  }
  // Non-Error objects: best-effort stringify so we don't drop signal.
  if (typeof layer === 'object') {
    try {
      return `${prefix}<non-Error cause> ${JSON.stringify(layer)}`;
    } catch {
      return `${prefix}<non-Error cause, not JSON-serialisable>`;
    }
  }
  return `${prefix}${String(layer)}`;
}

function readCode(err: Error): string | undefined {
  // Postgres errors carry `code`; some libraries use `errorCode` or
  // `status`. Surface any of them so the log line is grep-friendly.
  const raw = err as unknown as { code?: unknown; errorCode?: unknown };
  if (typeof raw.code === 'string') return raw.code;
  if (typeof raw.errorCode === 'string') return raw.errorCode;
  return undefined;
}

/**
 * Global exception filter. Every error leaving a controller is normalised to
 * the contracts-defined error envelope:
 *
 *   { error: { code, message, details? } }
 *
 * For 5xx errors the server-side log includes the full `cause` chain
 * (see {@link formatCauseChain}) so a wrapped DrizzleQueryError's
 * underlying Postgres message ("relation does not exist") doesn't get
 * lost behind the generic "Failed query: …" outer error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.toEnvelope(exception);

    if (status >= 500) {
      const chain = formatCauseChain(exception);
      this.logger.error(
        `Unhandled ${status}: ${body.error.message}\n${chain}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(body);
  }

  private toEnvelope(exception: unknown): { status: number; body: ErrorEnvelope } {
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          error: {
            code: ErrorCodes.VALIDATION_FAILED,
            message: 'Request failed validation.',
            details: exception.flatten(),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();

      // If the thrower already produced an envelope, pass it through.
      if (typeof raw === 'object' && raw !== null && 'error' in raw) {
        return { status, body: raw as ErrorEnvelope };
      }

      const code = this.codeFromStatus(status);
      const message =
        typeof raw === 'string'
          ? raw
          : (raw as { message?: string }).message ?? exception.message;
      const details =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : undefined;

      return {
        status,
        body: {
          error: { code, message, ...(details ? { details } : {}) },
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ErrorCodes.INTERNAL,
          message: 'Internal server error.',
        },
      },
    };
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCodes.UNPROCESSABLE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCodes.RATE_LIMITED;
      default:
        return ErrorCodes.INTERNAL;
    }
  }
}
