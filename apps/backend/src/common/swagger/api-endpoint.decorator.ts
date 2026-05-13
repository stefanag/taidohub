import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

interface ApiEndpointOptions {
  summary: string;
  description?: string;
  operationId?: string;
  /** Response type returned on the success path. */
  ok?: Type<unknown>;
  /** Which standard error responses to attach. Defaults to all of them. */
  errors?: Array<'400' | '401' | '403' | '404' | '409' | '422'>;
  /** Reference to the shared `ErrorEnvelopeDto`. */
  errorType?: Type<unknown>;
}

/**
 * Composite decorator that applies the project's standard Swagger boilerplate
 * to a controller method. Discoverable so authors can drop down to the raw
 * `@Api…` decorators when they need to.
 */
export function ApiEndpoint(opts: ApiEndpointOptions): MethodDecorator {
  const errors = opts.errors ?? ['400', '401', '403', '404'];
  const errorType = opts.errorType;

  const decorators: MethodDecorator[] = [
    ApiOperation({
      summary: opts.summary,
      ...(opts.description ? { description: opts.description } : {}),
      ...(opts.operationId ? { operationId: opts.operationId } : {}),
    }),
  ];

  if (opts.ok) {
    decorators.push(ApiOkResponse({ type: opts.ok }));
  }

  if (errors.includes('400')) {
    decorators.push(
      ApiBadRequestResponse(errorType ? { type: errorType } : { description: 'Validation failed.' }),
    );
  }
  if (errors.includes('401')) {
    decorators.push(
      ApiUnauthorizedResponse(errorType ? { type: errorType } : { description: 'Unauthenticated.' }),
    );
  }
  if (errors.includes('403')) {
    decorators.push(
      ApiForbiddenResponse(errorType ? { type: errorType } : { description: 'Forbidden.' }),
    );
  }
  if (errors.includes('404')) {
    decorators.push(
      ApiNotFoundResponse(errorType ? { type: errorType } : { description: 'Not found.' }),
    );
  }
  if (errors.includes('409')) {
    decorators.push(
      ApiConflictResponse(errorType ? { type: errorType } : { description: 'Conflict.' }),
    );
  }
  if (errors.includes('422')) {
    decorators.push(
      ApiUnprocessableEntityResponse(
        errorType ? { type: errorType } : { description: 'Unprocessable.' },
      ),
    );
  }

  return applyDecorators(...decorators);
}
