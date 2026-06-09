import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response as ExpressResponse } from 'express';

import { CurrentUser } from '../../infrastructure/auth/current-user.decorator.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

import { UserImpersonationService } from './user-impersonation.service.js';

/**
 * Sysadmin-only impersonation endpoints. Bridge between Express's req/res
 * objects and better-auth's fetch-style `Response`:
 *
 * 1. Build a WHATWG `Headers` from the incoming Express headers (string-valued
 *    only — better-auth needs the session cookie to identify the caller).
 * 2. Let the service do the policy + better-auth call.
 * 3. Mirror the resulting `Response`'s headers (notably `Set-Cookie`) onto the
 *    Express reply, then status + body.
 *
 * `passthrough: false` is required because we need to drive the status code
 * explicitly and forward whatever better-auth chose, rather than the default
 * 200 Nest would otherwise emit.
 */
@Controller()
export class UserImpersonationController {
  constructor(private readonly service: UserImpersonationService) {}

  @Post('admin/impersonate-user')
  async start(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { userId: string },
    @Req() req: Request,
    @Res({ passthrough: false }) res: ExpressResponse,
  ): Promise<void> {
    const headers = this.buildHeaders(req);
    const response = await this.service.start(user, body.userId, headers);
    await this.forward(response, res);
  }

  @Post('admin/stop-impersonating')
  async stop(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: false }) res: ExpressResponse,
  ): Promise<void> {
    const headers = this.buildHeaders(req);
    const response = await this.service.stop(user, headers);
    await this.forward(response, res);
  }

  private buildHeaders(req: Request): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        // Express normalises most headers to strings; arrays only appear for
        // `set-cookie` on responses. Defensive in case any middleware sets one
        // on the request side — join with comma per RFC 7230 §3.2.2.
        headers.set(key, value.join(', '));
      }
    }
    return headers;
  }

  private async forward(response: Response, res: ExpressResponse): Promise<void> {
    // `getSetCookie()` returns the Set-Cookie values as an array so each cookie
    // gets its own header line; a single string would collapse them into one.
    for (const cookie of response.headers.getSetCookie()) {
      res.append('set-cookie', cookie);
    }
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return;
      res.setHeader(key, value);
    });
    const payload = await response.json().catch(() => null);
    res.status(response.status).send(payload);
  }
}
