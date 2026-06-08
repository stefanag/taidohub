import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { FeatureFlagCode } from '@repo/contracts/feature-flags';

import { FeatureFlagsService } from './feature-flags.service.js';
import { FEATURE_FLAG_KEY } from './require-feature-flag.decorator.js';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const code = this.reflector.get<FeatureFlagCode | undefined>(
      FEATURE_FLAG_KEY,
      ctx.getHandler(),
    );
    if (!code) return true; // route is not gated
    const enabled = await this.flags.isEnabled(code);
    if (!enabled) throw new NotFoundException();
    return true;
  }
}
