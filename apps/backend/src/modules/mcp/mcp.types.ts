import { type z } from 'zod';

import {
  type AppAbility,
  type AppAction,
  type AppSubjectName,
} from '../../infrastructure/ability/ability.types.js';
import { type AuthenticatedUser } from '../../infrastructure/auth/auth.types.js';

/** What every tool handler receives: the acting user and their CASL ability. */
export interface McpToolContext {
  actor: AuthenticatedUser;
  ability: AppAbility;
}

/**
 * - `read`: never writes.
 * - `staged`: records a proposal; returns the staged envelope.
 * - `decision`: changes the state of a proposal the actor made (e.g. reject).
 */
export type McpToolKind = 'read' | 'staged' | 'decision';

/**
 * One MCP tool, declared once and registered on every per-request server.
 * Definitions are static: nothing in them may depend on the request, so
 * `tools/list` is byte-stable. See the conventions in
 * `docs/superpowers/specs/2026-11-24-mcp-module-design.md`.
 */
export interface McpToolDefinition<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
> {
  name: string;
  title: string;
  /** At most 280 characters, written for the agent ("Use to …"). */
  description: string;
  inputSchema: I;
  outputSchema: O;
  /** The CASL check run before the handler. Required: there is no default allow. */
  ability: readonly [AppAction, AppSubjectName];
  kind: McpToolKind;
  handler: (input: z.infer<I>, ctx: McpToolContext) => Promise<z.infer<O>>;
}

/** Helper that keeps each tool's input and output types tied to its schemas. */
export function defineTool<I extends z.ZodObject, O extends z.ZodObject>(
  tool: McpToolDefinition<I, O>,
): McpToolDefinition {
  return tool as unknown as McpToolDefinition;
}
