import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { type Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ZodError, z } from 'zod';

import { AllExceptionsFilter, formatCauseChain } from './all-exceptions.filter.js';

/**
 * Two layers of coverage:
 *
 *   1. `formatCauseChain` as a pure helper — drives every edge of the
 *      walker (single layer, nested cause, non-Error cause, cycle,
 *      depth cap).
 *
 *   2. The filter's `catch()` integration — confirms that the chain
 *      is funnelled into the 5xx log AND that the HTTP envelope stays
 *      unchanged (the whole point of this work was server-side
 *      diagnostics, not a client-visible behaviour change).
 */

function makeHost(): {
  host: ArgumentsHost;
  statusCalls: number[];
  jsonCalls: unknown[];
} {
  const statusCalls: number[] = [];
  const jsonCalls: unknown[] = [];
  const response = {
    status(s: number) {
      statusCalls.push(s);
      return this as unknown as Response;
    },
    json(body: unknown) {
      jsonCalls.push(body);
      return this as unknown as Response;
    },
  } as unknown as Response;

  const host: ArgumentsHost = {
    switchToHttp() {
      return {
        getResponse: <T>() => response as unknown as T,
        getRequest: <T>() => ({}) as T,
        getNext: <T>() => (() => undefined) as unknown as T,
      };
    },
  } as ArgumentsHost;

  return { host, statusCalls, jsonCalls };
}

describe('formatCauseChain', () => {
  it('renders a single Error layer without indentation', () => {
    const out = formatCauseChain(new Error('boom'));
    expect(out).toBe('Error: boom');
  });

  it('walks `cause` recursively and indents each layer', () => {
    const inner = Object.assign(new Error('relation "belt_rank" does not exist'), {
      name: 'PostgresError',
      code: '42P01',
    });
    const outer = Object.assign(new Error('Failed query: SELECT …'), {
      name: 'DrizzleQueryError',
      cause: inner,
    });

    const out = formatCauseChain(outer);

    expect(out).toBe(
      [
        'DrizzleQueryError: Failed query: SELECT …',
        '  ↳ PostgresError [42P01]: relation "belt_rank" does not exist',
      ].join('\n'),
    );
  });

  it('surfaces a non-string code only if present', () => {
    // No `code` on the layer — should not render an empty `[]` block.
    const out = formatCauseChain(
      Object.assign(new Error('plain'), { name: 'PlainError' }),
    );
    expect(out).toBe('PlainError: plain');
  });

  it('survives a non-Error link in the cause chain', () => {
    const outer = Object.assign(new Error('wrapper'), {
      cause: { kind: 'weird', detail: 'string-shaped' },
    });

    const out = formatCauseChain(outer);

    expect(out).toContain('Error: wrapper');
    expect(out).toContain('<non-Error cause>');
    expect(out).toContain('"kind":"weird"');
  });

  it('truncates a self-referential cause chain instead of looping', () => {
    const e = new Error('self');
    (e as { cause?: unknown }).cause = e;

    const out = formatCauseChain(e);

    expect(out).toMatch(/Error: self[\s\S]*cycle in cause chain — truncated/);
  });

  it('caps very long chains so a long legitimate chain still logs cleanly', () => {
    let head = new Error('layer-0');
    for (let i = 1; i < 20; i++) {
      const next = new Error(`layer-${i}`);
      (next as { cause?: unknown }).cause = head;
      head = next;
    }

    const out = formatCauseChain(head);

    expect(out).toContain('cause chain exceeds 10 layers — truncated');
  });
});

describe('AllExceptionsFilter.catch', () => {
  it('passes a Zod validation error through as 400 with the original envelope code', () => {
    const filter = new AllExceptionsFilter();
    const { host, statusCalls, jsonCalls } = makeHost();

    const zErr = (() => {
      const schema = z.object({ name: z.string() });
      try {
        schema.parse({});
        throw new Error('unreachable');
      } catch (e) {
        return e as ZodError;
      }
    })();

    filter.catch(zErr, host);

    expect(statusCalls).toEqual([HttpStatus.BAD_REQUEST]);
    expect(jsonCalls[0]).toMatchObject({
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('passes a pre-enveloped HttpException through unchanged', () => {
    const filter = new AllExceptionsFilter();
    const { host, statusCalls, jsonCalls } = makeHost();

    const enveloped = new HttpException(
      { error: { code: 'FORBIDDEN', message: 'Nope.' } },
      HttpStatus.FORBIDDEN,
    );

    filter.catch(enveloped, host);

    expect(statusCalls).toEqual([HttpStatus.FORBIDDEN]);
    expect(jsonCalls[0]).toEqual({
      error: { code: 'FORBIDDEN', message: 'Nope.' },
    });
  });

  it('returns the opaque INTERNAL envelope on an unknown exception (client view unchanged)', () => {
    const filter = new AllExceptionsFilter();
    const { host, statusCalls, jsonCalls } = makeHost();

    const inner = Object.assign(new Error('relation "x" does not exist'), {
      name: 'PostgresError',
      code: '42P01',
    });
    const outer = Object.assign(new Error('Failed query: SELECT 1'), {
      name: 'DrizzleQueryError',
      cause: inner,
    });

    filter.catch(outer, host);

    expect(statusCalls).toEqual([HttpStatus.INTERNAL_SERVER_ERROR]);
    expect(jsonCalls[0]).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error.' },
    });
  });

  it('logs the full cause chain on a 5xx, including the inner Postgres message + code', () => {
    const filter = new AllExceptionsFilter();
    const { host } = makeHost();

    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const inner = Object.assign(new Error('relation "belt_rank" does not exist'), {
      name: 'PostgresError',
      code: '42P01',
    });
    const outer = Object.assign(new Error('Failed query: SELECT … FROM belt_rank …'), {
      name: 'DrizzleQueryError',
      cause: inner,
    });

    filter.catch(outer, host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const firstCall = errorSpy.mock.calls[0]![0] as string;
    expect(firstCall).toContain('DrizzleQueryError: Failed query: SELECT');
    expect(firstCall).toContain('PostgresError [42P01]: relation "belt_rank" does not exist');

    errorSpy.mockRestore();
  });
});
