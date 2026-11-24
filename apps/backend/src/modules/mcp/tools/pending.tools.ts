import { Injectable } from '@nestjs/common';
import {
  McpEmptyInputSchema,
  McpOperationInputSchema,
  McpPendingOperationOutputSchema,
  McpPendingOperationsOutputSchema,
  McpProposeRankEntryInputSchema,
  McpStagedResultSchema,
} from '@repo/contracts/mcp';

import { PendingOperationsService } from '../../pending-operations/pending-operations.service.js';
import { defineTool, type McpToolDefinition } from '../mcp.types.js';

/**
 * Tools for writes. None of them writes to the target data: a proposal is
 * stored and its proposer approves it in the web app. There is deliberately
 * no approve tool — the agent holds the user's token, so it could otherwise
 * approve its own proposal.
 */
@Injectable()
export class McpPendingTools {
  constructor(private readonly pending: PendingOperationsService) {}

  definitions(): McpToolDefinition[] {
    return [
      defineTool({
        name: 'propose_rank_entry',
        title: 'Propose a grading entry',
        description:
          "Use to propose adding a passed grading to a student's rank history. Nothing is saved until the user approves it in TaidoHub under Pending operations; tell them so.",
        inputSchema: McpProposeRankEntryInputSchema,
        outputSchema: McpStagedResultSchema,
        ability: ['create', 'PendingOperation'],
        kind: 'staged',
        handler: async (input, { actor }) => {
          const operation = await this.pending.proposeRankEntry(input, actor);
          const { preview } = operation;
          return {
            staged: true as const,
            operationId: operation.id,
            preview,
            message: `Proposed ${preview.rankName} on ${preview.date} for ${preview.studentName ?? preview.studentUserId}. It is saved only after you approve it in TaidoHub under Pending operations.`,
          };
        },
      }),
      defineTool({
        name: 'list_pending_operations',
        title: 'List pending operations',
        description:
          'Use to see the proposals the user has made through AI clients and whether each is still pending, approved, rejected or failed.',
        inputSchema: McpEmptyInputSchema,
        outputSchema: McpPendingOperationsOutputSchema,
        ability: ['read', 'PendingOperation'],
        kind: 'read',
        handler: async (_input, { actor }) => ({
          operations: await this.pending.listMine(actor),
        }),
      }),
      defineTool({
        name: 'reject_pending_operation',
        title: 'Withdraw a proposal',
        description:
          'Use to withdraw a pending proposal, for example one made by mistake. Approving is only possible in the TaidoHub web app.',
        inputSchema: McpOperationInputSchema,
        outputSchema: McpPendingOperationOutputSchema,
        ability: ['update', 'PendingOperation'],
        kind: 'decision',
        handler: async ({ operationId }, { actor }) => ({
          operation: await this.pending.reject(operationId, actor),
        }),
      }),
    ];
  }
}
