import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Stub the classification hook so chips render synchronously without network.
// The pattern_type root returns a `hokei` option so the conditional subtype
// picker's logic is wired up (it only shows after the user selects hokei).
vi.mock('@/entities/classification-category', () => ({
  useClassificationCategoriesByRootQuery: (rootCode: string) => ({
    data: [
      {
        id:
          rootCode === 'pattern_type'
            ? '550e8400-e29b-41d4-a716-446655440011'
            : '550e8400-e29b-41d4-a716-446655440022',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        rootCode,
        code: rootCode === 'pattern_type' ? 'hokei' : 'sei',
        nameEn:
          rootCode === 'pattern_type' ? 'Hokei type' : 'Sei subtype',
        nameSv: '',
        nameFi: '',
        nameJa: '',
        sortOrder: 0,
        isActive: true,
      },
    ],
    isPending: false,
  }),
}));

// Stub the pattern list query — one row with two classifications attached.
vi.mock('@/entities/pattern', () => ({
  usePatternsQuery: () => ({
    data: [
      {
        id: '660e8400-e29b-41d4-a716-446655440020',
        createdByOrganisationId: null,
        officialBodyOrgId: null,
        isActive: true,
        sortOrder: 0,
        minRankId: null,
        nameJa: '',
        nameRomaji: 'sei no hokei',
        nameSv: '',
        nameEn: 'Sei no hokei',
        nameFi: '',
        descriptionSv: '',
        descriptionEn: '',
        descriptionFi: '',
        classificationsByRoot: {
          pattern_type: [],
          hokei_subtype: [],
        },
        classifications: [
          {
            id: '770e8400-e29b-41d4-a716-446655440201',
            parentId: null,
            rootCode: 'pattern_type',
            code: 'hokei',
            nameEn: 'Hokei',
            nameSv: '',
            nameFi: '',
            nameJa: '',
            sortOrder: 0,
            isActive: true,
          },
          {
            id: '770e8400-e29b-41d4-a716-446655440202',
            parentId: null,
            rootCode: 'hokei_subtype',
            code: 'sei',
            nameEn: 'Sei',
            nameSv: '',
            nameFi: '',
            nameJa: '',
            sortOrder: 0,
            isActive: true,
          },
        ],
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
      },
    ],
    isPending: false,
  }),
}));

import { PatternsPage } from './PatternsPage.js';

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <PatternsPage />
    </QueryClientProvider>,
  );
}

describe('<PatternsPage>', () => {
  it('renders the pattern_type filter picker and hides the hokei_subtype picker until hokei is selected', () => {
    renderPage();
    // pattern_type chip is always visible.
    expect(
      screen.getByRole('button', { name: 'Hokei type' }),
    ).toBeInTheDocument();
    // hokei_subtype chip is conditional — initial state has no selection,
    // so the subtype picker is not yet mounted.
    expect(
      screen.queryByRole('button', { name: 'Sei subtype' }),
    ).not.toBeInTheDocument();
  });

  it('renders one row per pattern with its classification badges', () => {
    renderPage();
    // The English name is rendered for the row.
    expect(screen.getByText('Sei no hokei')).toBeInTheDocument();
    // Both classification badges show as text — the mock has two entries.
    expect(screen.getByText('Hokei')).toBeInTheDocument();
    expect(screen.getByText('Sei')).toBeInTheDocument();
  });
});
