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

// Stub the pattern hooks. Both the page and PatternFormDialog import from
// `@/entities/pattern`, so this single mock covers both.
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
        ],
        createdAt: '2026-06-10T00:00:00.000Z',
        updatedAt: '2026-06-10T00:00:00.000Z',
      },
    ],
    isPending: false,
  }),
  useCreatePatternMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePatternMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePatternMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AdminPatternsPage } from './AdminPatternsPage.js';

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AdminPatternsPage />
    </QueryClientProvider>,
  );
}

describe('<AdminPatternsPage>', () => {
  it('renders the "New pattern" button, filter picker, and one row per pattern', () => {
    renderPage();
    // "New pattern" key falls back to its raw path until Task 11 seeds it.
    expect(
      screen.getByRole('button', {
        name: /admin\.patterns\.newPattern|new pattern|nytt mönster|uusi kuvio/i,
      }),
    ).toBeInTheDocument();
    // pattern_type filter picker — one chip from the mock.
    expect(
      screen.getByRole('button', { name: 'Hokei type' }),
    ).toBeInTheDocument();
    // hokei_subtype picker is conditional and hidden until a hokei chip is
    // selected — so it should NOT be in the document on initial render.
    expect(
      screen.queryByRole('button', { name: 'Sei subtype' }),
    ).not.toBeInTheDocument();
    // Row body uses nameRomaji.
    expect(screen.getByText('sei no hokei')).toBeInTheDocument();
  });

  it('opens the pattern form dialog when "New pattern" is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      screen.getByRole('button', {
        name: /admin\.patterns\.newPattern|new pattern|nytt mönster|uusi kuvio/i,
      }),
    );
    // The dialog's "Save" button only mounts when the dialog opens. Its label
    // resolves through i18n fallbacks (en/sv/fi) so accept any of them.
    expect(
      await screen.findByRole('button', { name: /save|spara|tallenna/i }),
    ).toBeInTheDocument();
  });
});
