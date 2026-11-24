import { type CallToolResult, type McpServer, type ToolAnnotations } from '@modelcontextprotocol/server';
import { HttpException, Logger } from '@nestjs/common';

import { type McpToolContext, type McpToolDefinition, type McpToolKind } from './mcp.types.js';

const ANNOTATIONS: Record<McpToolKind, ToolAnnotations> = {
  read: { readOnlyHint: true, openWorldHint: false },
  staged: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  decision: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

/**
 * Turns an exception from a service into a tool error. Services throw Nest
 * `HttpException`s carrying the app's error envelope
 * (`{ error: { code, message } }`); the agent gets `CODE: message`.
 * Anything else is logged and reported without internals.
 */
export function toToolError(err: unknown, logger: Logger): CallToolResult {
  if (err instanceof HttpException) {
    const body = err.getResponse() as { error?: { code?: string; message?: string } } | string;
    const code =
      typeof body === 'object' && body.error?.code ? body.error.code : `HTTP_${String(err.getStatus())}`;
    const message =
      typeof body === 'object' && body.error?.message ? body.error.message : err.message;
    return { isError: true, content: [{ type: 'text', text: `${code}: ${message}` }] };
  }
  logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  return {
    isError: true,
    content: [{ type: 'text', text: 'INTERNAL_ERROR: The request failed. Nothing was changed.' }],
  };
}

/**
 * Registers tool definitions on a per-request `McpServer`. Every call runs
 * the tool's declared CASL check before its handler (default deny: a tool
 * cannot be declared without one), and service errors become tool errors.
 */
export class McpToolRegistry {
  private readonly logger = new Logger('McpTools');

  constructor(readonly tools: readonly McpToolDefinition[]) {
    const names = new Set<string>();
    for (const tool of tools) {
      if (names.has(tool.name)) throw new Error(`Duplicate MCP tool name: ${tool.name}`);
      names.add(tool.name);
      if (tool.ability.length !== 2) throw new Error(`MCP tool ${tool.name} declares no ability.`);
    }
  }

  registerAll(server: McpServer, ctx: McpToolContext): void {
    for (const tool of this.tools) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: { title: tool.title, ...ANNOTATIONS[tool.kind] },
        },
        async (input: unknown) => this.call(tool, input, ctx),
      );
    }
  }

  async call(tool: McpToolDefinition, input: unknown, ctx: McpToolContext): Promise<CallToolResult> {
    const [action, subject] = tool.ability;
    if (ctx.ability.cannot(action, subject)) {
      return {
        isError: true,
        content: [{ type: 'text', text: `FORBIDDEN: You may not use ${tool.name}.` }],
      };
    }
    try {
      const parsed = tool.inputSchema.parse(input);
      const result = tool.outputSchema.parse(await tool.handler(parsed, ctx)) as Record<string, unknown>;
      // Round-trip through JSON so Dates and the like reach the client exactly
      // as they are described in the output schema.
      const structured = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
      return {
        content: [{ type: 'text', text: JSON.stringify(structured) }],
        structuredContent: structured,
      };
    } catch (err) {
      return toToolError(err, this.logger);
    }
  }
}
