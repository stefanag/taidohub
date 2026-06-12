import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Stub the classification hook so chips render synchronously without network.
vi.mock('@/entities/classification-category', () => ({
  useClassificationCategoriesByRootQuery: (rootCode: string) => ({
    data: [
      {
        id:
          rootCode === 'technique_type'
            ? '550e8400-e29b-41d4-a716-446655440001'
            : rootCode === 'sotai_category'
              ? '550e8400-e29b-41d4-a716-446655440002'
              : '550e8400-e29b-41d4-a716-446655440003',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        rootCode,
        code: `${rootCode}-opt`,
        nameEn: `Option ${rootCode}`,
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

// Stub the progress list query — no rows means the pill renders as
// "not_started" without any network traffic.
vi.mock('@/entities/progress', () => ({
  useProgressListQuery: () => ({ data: [], isLoading: false }),
}));

// Stub the editor dialog — the page test only confirms wiring, not the
// dialog's internals (covered in its own test file).
vi.mock('@/features/progress-editor-dialog', () => ({
  ProgressEditorDialog: () => null,
}));

// Stub the technique list query — one row with two classifications attached.
vi.mock('@/entities/technique', () => ({
  useTechniquesQuery: () => ({
    data: [
      {
        id: '660e8400-e29b-41d4-a716-446655440010',
        createdByOrganisationId: null,
        isKihon: false,
        isActive: true,
        sortOrder: 0,
        minRankId: null,
        nameJa: '',
        nameRomaji: 'mae geri',
        nameSv: '',
        nameEn: 'Front kick',
        nameFi: '',
        descriptionSv: '',
        descriptionEn: '',
        descriptionFi: '',
        classificationsByRoot: {
          technique_type: [],
          sotai_category: [],
          attack_type: [],
        },
        classifications: [
          {
            id: '770e8400-e29b-41d4-a716-446655440101',
            parentId: null,
            rootCode: 'technique_type',
            code: 'kihon',
            nameEn: 'Kihon',
            nameSv: '',
            nameFi: '',
            nameJa: '',
            sortOrder: 0,
            isActive: true,
          },
          {
            id: '770e8400-e29b-41d4-a716-446655440102',
            parentId: null,
            rootCode: 'attack_type',
            code: 'kick',
            nameEn: 'Kick',
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

import { TechniquesPage } from './TechniquesPage.js';

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <TechniquesPage />
    </QueryClientProvider>,
  );
}

describe('<TechniquesPage>', () => {
  it('renders the three classification filter pickers with chip options', () => {
    renderPage();
    // Each rootCode emits one chip with nameEn `Option <root>`. Three pickers,
    // three chips — confirms all three pickers mounted.
    expect(
      screen.getByRole('button', { name: 'Option technique_type' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Option sotai_category' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Option attack_type' }),
    ).toBeInTheDocument();
  });

  it('renders one row per technique with its classification badges', () => {
    renderPage();
    // The English name is rendered for the row.
    expect(screen.getByText('Front kick')).toBeInTheDocument();
    // Both classification badges show as text — the mock has two entries.
    expect(screen.getByText('Kihon')).toBeInTheDocument();
    expect(screen.getByText('Kick')).toBeInTheDocument();
  });
});
