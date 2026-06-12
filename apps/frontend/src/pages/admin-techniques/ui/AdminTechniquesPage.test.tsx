import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom doesn't implement matchMedia; shadcn's Dialog underpinnings may
// reach for it.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

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

// Stub the progress list query — no rows means the pill renders as
// "not_started" without any network traffic.
vi.mock('@/entities/progress', () => ({
  useProgressListQuery: () => ({ data: [], isLoading: false }),
}));

// Stub the progress editor dialog — the page test only confirms wiring, not
// the dialog's internals (covered in its own test file). The real dialog
// would otherwise pull in the Select/DatePicker primitives that need
// pointer-capture stubs in jsdom.
vi.mock('@/features/progress-editor-dialog', () => ({
  ProgressEditorDialog: () => null,
}));

// Stub the technique hooks. Both the page and the TechniqueFormDialog import
// from `@/entities/technique`, so this single mock covers both.
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
    // "New technique" key falls back to its raw path until Task 12 seeds it.
    expect(
      screen.getByRole('button', { name: /new technique|ny teknik|uusi tekniikka/i }),
    ).toBeInTheDocument();
    // Filter pickers — one chip per rootCode.
    expect(
      screen.getByRole('button', { name: 'Option technique_type' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Option sotai_category' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Option attack_type' }),
    ).toBeInTheDocument();
    // Row body uses nameRomaji.
    expect(screen.getByText('mae geri')).toBeInTheDocument();
  });

  it('opens the technique form dialog when "New technique" is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      screen.getByRole('button', { name: /new technique|ny teknik|uusi tekniikka/i }),
    );
    // The dialog's "Save" button only mounts when the dialog opens. Its label
    // resolves through i18n fallbacks (en/sv/fi) so accept any of them.
    expect(
      await screen.findByRole('button', { name: /save|spara|tallenna/i }),
    ).toBeInTheDocument();
  });
});
