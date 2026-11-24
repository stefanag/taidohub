import { requireMcpAuth } from '@better-auth/mcp';
import { createMcpHandler, type McpHttpHandler, originValidationResponse } from '@modelcontextprotocol/server';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toNodeHandler } from 'better-auth/node';

import { type Env } from '../../config/env.schema.js';
import { AbilityFactory } from '../../infrastructure/ability/ability.factory.js';
import { type Auth, BETTER_AUTH } from '../../infrastructure/auth/better-auth.js';
import { mcpResource } from '../../infrastructure/auth/mcp-access.js';
import { UserContextService } from '../../infrastructure/auth/user-context.service.js';

import { McpActorRepository } from './mcp-actor.repository.js';
import { McpServerFactory } from './mcp-server.factory.js';
import { type McpToolContext } from './mcp.types.js';

/** A JSON-RPC error response with an HTTP status, in the shape MCP clients expect. */
function rpcError(status: number, code: string, message: string): Response {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message, data: { code } } },
    { status },
  );
}

/**
 * The `/api/mcp` endpoint. Runs, in order:
 *
 *  1. `Origin` check (DNS-rebinding defence required by the MCP spec): a
 *     request with an `Origin` header must come from one of `WEB_ORIGIN`.
 *     Server-side MCP clients send none.
 *  2. `requireMcpAuth`: bearer JWT signed by our JWKS, issuer, audience
 *     (the MCP resource) and expiry. Without one: 401 with a
 *     `WWW-Authenticate` header pointing at the protected resource metadata.
 *  3. Load the actor fresh from the database (role, deactivation, memberships).
 *  4. CASL `use Mcp`: instructors, students and plain users get 403.
 *  5. Serve the request with a per-request `McpServer` bound to the actor,
 *     inside `UserContextService.run` so services that read the request
 *     user see the MCP actor.
 *
 * Mounted with `app.use` next to better-auth, outside the Nest router: the
 * global `AuthGuard` reads the session cookie, which MCP clients never have.
 */
@Injectable()
export class McpHttpService {
  private readonly mcp: McpHttpHandler;
  private readonly allowedOriginHosts: string[];
  private readonly authenticated: (request: Request) => Promise<Response>;

  constructor(
    @Inject(BETTER_AUTH) auth: Auth,
    config: ConfigService<Env, true>,
    private readonly actors: McpActorRepository,
    private readonly abilities: AbilityFactory,
    private readonly userContext: UserContextService,
    private readonly servers: McpServerFactory,
  ) {
    const env = {
      BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
      WEB_ORIGIN: config.get('WEB_ORIGIN', { infer: true }),
    };
    this.allowedOriginHosts = [
      ...new Set(
        [...env.WEB_ORIGIN.split(','), env.BETTER_AUTH_URL]
          .map((s) => s.trim())
          .filter(Boolean)
          .map((origin) => new URL(origin).hostname),
      ),
    ];
    this.mcp = createMcpHandler(
      (ctx) => this.servers.build((ctx.authInfo?.extra as { tool: McpToolContext }).tool),
      { responseMode: 'json' },
    );
    this.authenticated = requireMcpAuth(
      auth,
      async (request, claims) => this.serveAuthenticated(request, claims.sub, claims.azp),
      { resource: mcpResource(env) },
    );
  }

  /** Express/Node middleware for `app.use('/api/mcp', …)`. */
  nodeHandler(): ReturnType<typeof toNodeHandler> {
    return toNodeHandler((request: Request) => this.handle(request));
  }

  async handle(request: Request): Promise<Response> {
    const rejected = originValidationResponse(request, this.allowedOriginHosts);
    if (rejected) return rejected;
    return this.authenticated(request);
  }

  private async serveAuthenticated(
    request: Request,
    userId: string | undefined,
    clientId: unknown,
  ): Promise<Response> {
    const actor = userId ? await this.actors.load(userId) : null;
    if (!actor) return rpcError(401, 'UNAUTHORIZED', 'The access token names no known user.');
    if (actor.deactivatedAt !== null) {
      return rpcError(403, 'DEACTIVATED', 'Account is deactivated.');
    }
    const ability = this.abilities.createForUser(actor);
    if (ability.cannot('use', 'Mcp')) {
      return rpcError(
        403,
        'MCP_NOT_ALLOWED',
        'Only sysadmins and organisation admins can use the TaidoHub MCP server.',
      );
    }
    const tool: McpToolContext = { actor, ability };
    return this.userContext.run(actor, () =>
      this.mcp.fetch(request, {
        authInfo: {
          token: '',
          clientId: typeof clientId === 'string' ? clientId : '',
          scopes: [],
          extra: { tool },
        },
      }),
    );
  }
}
