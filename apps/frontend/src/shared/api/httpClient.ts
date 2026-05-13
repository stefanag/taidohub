import { ErrorEnvelopeSchema, type ErrorPayload } from '@repo/contracts/errors';

import { env } from '@/shared/lib/env';

/**
 * Strongly-typed error thrown by `httpClient` for any non-2xx response.
 * Carries the parsed `ErrorPayload` from the uniform backend envelope plus
 * the original HTTP status so callers can branch on `err.status === 401`,
 * `err.payload.code === 'FORBIDDEN'`, etc.
 */
export class HttpError extends Error {
  public readonly status: number;
  public readonly payload: ErrorPayload;

  constructor(status: number, payload: ErrorPayload) {
    super(payload.message || `HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.payload = payload;
  }
}

export interface HttpRequestOptions extends Omit<RequestInit, 'body'> {
  /** Object body — JSON-stringified automatically. Use `rawBody` for FormData/etc. */
  body?: unknown;
  /** Skip JSON serialisation; pass through to `fetch` as-is. */
  rawBody?: BodyInit | null;
  /** Query-string params appended to the URL. */
  query?: Record<string, string | number | boolean | undefined>;
}

const JSON_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

function buildUrl(path: string, query?: HttpRequestOptions['query']): string {
  const base = env.VITE_API_URL.replace(/\/+$/, '');
  const url = new URL(path.startsWith('/') ? `${base}${path}` : `${base}/${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseError(response: Response): Promise<ErrorPayload> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      code: 'INTERNAL',
      message: `Unexpected ${response.status} response (no JSON body).`,
    };
  }
  const parsed = ErrorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data.error;
  }
  return {
    code: 'INTERNAL',
    message: `Unexpected ${response.status} response (malformed error envelope).`,
    details: body,
  };
}

/**
 * The single fetch wrapper used by every `*.api.ts` module.
 *
 * - Prepends `VITE_API_URL`.
 * - Sets `credentials: 'include'` so better-auth's HTTP-only session cookie
 *   is sent on every cross-origin request.
 * - JSON-encodes plain object bodies and decodes JSON responses.
 * - Throws a typed `HttpError` carrying the uniform error envelope on non-2xx.
 *
 * The generic `T` is the *raw* response shape; the caller is expected to
 * pass the result through the appropriate Zod schema from `@repo/contracts`.
 */
export async function httpClient<T = unknown>(
  path: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const { body, rawBody, query, headers, ...rest } = options;

  const init: RequestInit = {
    credentials: 'include',
    ...rest,
    headers: {
      ...(body !== undefined ? JSON_HEADERS : { Accept: 'application/json' }),
      ...headers,
    },
  };

  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path, query), init);

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    throw new HttpError(response.status, await parseError(response));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
