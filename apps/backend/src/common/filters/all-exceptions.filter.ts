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

/**
 * Global exception filter. Every error leaving a controller is normalised to
 * the contracts-defined error envelope:
 *
 *   { error: { code, message, details? } }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.toEnvelope(exception);

    if (status >= 500) {
      this.logger.error(
        `Unhandled ${status}: ${body.error.message}`,
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
