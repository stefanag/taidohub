import { McpServer } from '@modelcontextprotocol/server';
import { Injectable } from '@nestjs/common';

import { McpToolRegistry } from './mcp-tool.registry.js';
import { MCP_INSTRUCTIONS } from './mcp.instructions.js';
import { type McpToolContext } from './mcp.types.js';
import { McpPendingTools } from './tools/pending.tools.js';
import { McpReadTools } from './tools/read.tools.js';

export const MCP_SERVER_NAME = 'taidohub';
export const MCP_SERVER_VERSION = '0.1.0';
export const ME_RESOURCE_URI = 'taidohub://me';

/**
 * Builds one `McpServer` per request, bound to the acting user. Tool
 * definitions are created once, here, so every request lists the same tools
 * in the same order.
 */
@Injectable()
export class McpServerFactory {
  readonly registry: McpToolRegistry;

  constructor(
    private readonly readTools: McpReadTools,
    pendingTools: McpPendingTools,
  ) {
    this.registry = new McpToolRegistry([...readTools.definitions(), ...pendingTools.definitions()]);
  }

  build(ctx: McpToolContext): McpServer {
    const server = new McpServer(
      { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      { instructions: MCP_INSTRUCTIONS },
    );
    this.registry.registerAll(server, ctx);
    server.registerResource(
      'me',
      ME_RESOURCE_URI,
      {
        title: 'Current user',
        description: 'Who you act for: id, name, global role and organisation memberships. Read this first.',
        mimeType: 'application/json',
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(await this.readTools.me(ctx.actor)),
          },
        ],
      }),
    );
    return server;
  }
}
