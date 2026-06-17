import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

// `useNavigate` is the only TanStack Router surface the page touches; stub
// it so we can assert call shape without bringing up a router context.
const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

// Stub the classification hook so chips render synchronously.
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

// Stub the technique hooks. The list query returns one row; the mutation
// hooks just need a stable shape — the page only reads `isPending`.
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
        ],
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
      },
    ],
    isPending: false,
  }),
  useCreateTechniqueMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTechniqueMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTechniqueMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AdminTechniquesPage } from './AdminTechniquesPage.js';

function renderPage(): void {
  navigateMock.mockClear();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminTechniquesPage />
    </QueryClientProvider>,
  );
}

describe('<AdminTechniquesPage>', () => {
  it('renders the "New technique" button, filter pickers, and one row per technique', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /new technique|ny teknik|uusi tekniikka/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Option technique_type' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Option sotai_category' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Option attack_type' }),
    ).toBeInTheDocument();
    // The localised name takes the primary slot (en="Front kick"); romaji
    // falls to the secondary line in the reusable list item.
    expect(screen.getByText('Front kick')).toBeInTheDocument();
    expect(screen.getByText('mae geri')).toBeInTheDocument();
  });

  it('navigates to /admin/techniques/new when "New technique" is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      screen.getByRole('button', { name: /new technique|ny teknik|uusi tekniikka/i }),
    );
    expect(navigateMock).toHaveBeenCalledWith({ to: '/admin/techniques/new' });
  });

  it('navigates to the edit page when a row Edit button is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole('button', { name: /edit|redigera|muokkaa/i })[0]!);
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/admin/techniques/$techniqueId',
      params: { techniqueId: '660e8400-e29b-41d4-a716-446655440010' },
    });
  });
});
