import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { type AuthenticatedUser } from '../auth/auth.types.js';

import { AbilityFactory } from './ability.factory.js';
import { CHECK_ABILITY_KEY, type RequiredAbility } from './check-ability.decorator.js';

@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredAbility[]>(
      CHECK_ABILITY_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required?.length) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const ability = this.abilityFactory.createForUser(req.user ?? null);

    for (const { action, subject } of required) {
      if (!ability.can(action, subject)) {
        throw new ForbiddenException({
          error: {
            code: 'FORBIDDEN',
            message: `Not allowed to ${action} ${subject}.`,
          },
        });
      }
    }

    return true;
  }
}
