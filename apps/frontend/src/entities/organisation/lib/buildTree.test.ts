import { describe, expect, it } from 'vitest';

import { buildTree, type OrganisationNode } from './buildTree.js';
import type { Organisation } from '@repo/contracts/organisations';

const ROW = (id: string, parentId: string | null, nameEn: string): Organisation => ({
  id, parentId, type: 'club' as const, shortCode: id.toUpperCase(), slug: null,
  country: 'SWE', nameEn, nameSv: nameEn, nameFi: nameEn, nameJa: null,
  logoUrl: null, address: null, contactEmail: null, headInstructorId: null,
  createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
});

describe('buildTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('nests children under parents', () => {
    const tree = buildTree([ROW('a', null, 'Root'), ROW('b', 'a', 'Child'), ROW('c', 'b', 'Grandchild')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('b');
    expect(tree[0].children[0].children[0].id).toBe('c');
  });

  it('treats orphans (missing parent) as roots', () => {
    const tree = buildTree([ROW('b', 'missing', 'Orphan')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('b');
  });

  it('supports multiple roots', () => {
    const tree = buildTree([ROW('a', null, 'A'), ROW('b', null, 'B')]);
    expect(tree).toHaveLength(2);
  });

  it('children inherit type from buildTree<OrganisationNode>', () => {
    const tree: OrganisationNode[] = buildTree([ROW('a', null, 'A')]);
    expect(tree[0].children).toEqual([]);
  });
});
