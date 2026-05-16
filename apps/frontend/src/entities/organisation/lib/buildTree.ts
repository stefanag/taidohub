import type { Organisation } from '@repo/contracts/organisations';

export interface OrganisationNode extends Organisation {
  children: OrganisationNode[];
}

export function buildTree(rows: readonly Organisation[]): OrganisationNode[] {
  const byId = new Map<string, OrganisationNode>();
  for (const row of rows) {
    byId.set(row.id, { ...row, children: [] });
  }
  const roots: OrganisationNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
