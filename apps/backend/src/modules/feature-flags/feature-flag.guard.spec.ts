import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeatureFlagGuard } from './feature-flag.guard.js';
import { FeatureFlagsService } from './feature-flags.service.js';
import { FEATURE_FLAG_KEY } from './require-feature-flag.decorator.js';

function fakeCtx(): ExecutionContext {
  return {
    getHandler: () => (() => undefined) as unknown as () => void,
    getClass: () => class Fake {},
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}), getNext: () => undefined }),
    switchToWs: () => ({}) as ReturnType<ExecutionContext['switchToWs']>,
    switchToRpc: () => ({}) as ReturnType<ExecutionContext['switchToRpc']>,
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
  } as unknown as ExecutionContext;
}

describe('FeatureFlagGuard', () => {
  let reflector: { get: ReturnType<typeof vi.fn> };
  let service: { isEnabled: ReturnType<typeof vi.fn> };
  let guard: FeatureFlagGuard;

  beforeEach(() => {
    reflector = { get: vi.fn() };
    service = { isEnabled: vi.fn() };
    guard = new FeatureFlagGuard(
      reflector as unknown as Reflector,
      service as unknown as FeatureFlagsService,
    );
  });

  it('passes through when the route is not gated', async () => {
    reflector.get.mockReturnValue(undefined);
    await expect(guard.canActivate(fakeCtx())).resolves.toBe(true);
    expect(service.isEnabled).not.toHaveBeenCalled();
  });

  it('reads the metadata using the FEATURE_FLAG_KEY', async () => {
    reflector.get.mockReturnValue('grading-history');
    service.isEnabled.mockResolvedValue(true);
    await guard.canActivate(fakeCtx());
    expect(reflector.get.mock.calls[0]![0]).toBe(FEATURE_FLAG_KEY);
  });

  it('returns true when the flag is on', async () => {
    reflector.get.mockReturnValue('grading-history');
    service.isEnabled.mockResolvedValue(true);
    await expect(guard.canActivate(fakeCtx())).resolves.toBe(true);
  });

  it('throws NotFoundException when the flag is off', async () => {
    reflector.get.mockReturnValue('grading-history');
    service.isEnabled.mockResolvedValue(false);
    await expect(guard.canActivate(fakeCtx())).rejects.toBeInstanceOf(NotFoundException);
  });
});
