import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';

import { LabelsFilterBar } from './LabelsFilterBar.js';

// `vi.mock` is hoisted above all top-level consts, so the fixtures the mock
// factory needs have to live inside `vi.hoisted` (which is also hoisted but
// produces values usable from the factory and from the test bodies).
const { TAG_A, TAG_B, CAT_PARENT, CAT_CHILD } = vi.hoisted(() => ({
  TAG_A: {
    id: '11111111-1111-1111-1111-111111111111',
    organisationId: null,
    name: 'competition-team',
    createdByUserId: 'u-1',
    createdAt: '2026-06-07T10:00:00.000Z',
    updatedAt: '2026-06-07T10:00:00.000Z',
  },
  TAG_B: {
    id: '22222222-2222-2222-2222-222222222222',
    organisationId: null,
    name: 'recreational',
    createdByUserId: 'u-1',
    createdAt: '2026-06-07T10:00:00.000Z',
    updatedAt: '2026-06-07T10:00:00.000Z',
  },
  CAT_PARENT: {
    id: '33333333-3333-3333-3333-333333333333',
    organisationId: null,
    parentId: null,
    name: 'Region',
    createdByUserId: 'u-1',
    createdAt: '2026-06-07T10:00:00.000Z',
    updatedAt: '2026-06-07T10:00:00.000Z',
  },
  CAT_CHILD: {
    id: '44444444-4444-4444-4444-444444444444',
    organisationId: null,
    parentId: '33333333-3333-3333-3333-333333333333',
    name: 'Nordic',
    createdByUserId: 'u-1',
    createdAt: '2026-06-07T10:00:00.000Z',
    updatedAt: '2026-06-07T10:00:00.000Z',
  },
}));

// Stub the React Query hooks the bar consumes. We override the hooks at the
// labels entity's public barrel (not the deep api path) so the FSD
// `no-public-api-sidestep` rule stays satisfied. Mocking the deep `getTags`
// / `getCategories` would not work because `hooks.ts` binds to those
// functions via its own local `import * as api from '../api/...'`, which
// vitest's public-barrel mock cannot reach.
vi.mock('@/entities/label', async (orig) => {
  const actual = await orig<typeof import('@/entities/label')>();
  return {
    ...actual,
    useTagsQuery: () => ({
      data: [TAG_A, TAG_B],
      isLoading: false,
      isPending: false,
      error: null,
    }),
    useCategoriesQuery: () => ({
      data: [CAT_PARENT, CAT_CHILD],
      isLoading: false,
      isPending: false,
      error: null,
    }),
  };
});

function renderBar(
  props: Partial<React.ComponentProps<typeof LabelsFilterBar>> = {},
): {
  onChange: ReturnType<typeof vi.fn>;
  user: ReturnType<typeof userEvent.setup>;
} {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <LabelsFilterBar searchKey={{}} onChange={onChange} {...props} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { onChange, user };
}

describe('<LabelsFilterBar>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders tag and category selects with the translated labels', async () => {
    renderBar();
    // i18n keys labels.filter.* are seeded in Task 13; the en translations are
    // "Filter by tag" / "Filter by category".
    expect(
      await screen.findByRole('combobox', { name: 'Filter by tag' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Filter by category' }),
    ).toBeInTheDocument();
  });

  it('emits an onChange with the new tag id when a tag is picked', async () => {
    const { onChange, user } = renderBar();
    const select = await screen.findByRole('combobox', {
      name: 'Filter by tag',
    });
    // Wait for the React Query fetch to populate the options.
    await screen.findByRole('option', { name: TAG_A.name });
    await user.selectOptions(select, TAG_A.id);
    expect(onChange).toHaveBeenCalledWith({
      tag: [TAG_A.id],
      category: [],
    });
  });

  it('preserves the active category when toggling a tag', async () => {
    const { onChange, user } = renderBar({
      searchKey: { category: [CAT_PARENT.id] },
    });
    const select = await screen.findByRole('combobox', {
      name: 'Filter by tag',
    });
    await screen.findByRole('option', { name: TAG_A.name });
    await user.selectOptions(select, TAG_A.id);
    expect(onChange).toHaveBeenCalledWith({
      tag: [TAG_A.id],
      category: [CAT_PARENT.id],
    });
  });

  it('renders active selections as removable pill buttons', async () => {
    renderBar({ searchKey: { tag: [TAG_A.id], category: [CAT_CHILD.id] } });
    // The tag pill button text includes the leading remove glyph.
    expect(
      await screen.findByRole('button', {
        name: new RegExp(TAG_A.name, 'i'),
      }),
    ).toBeInTheDocument();
    // Child category renders as `Parent › Child`.
    expect(
      screen.getByRole('button', {
        name: new RegExp(`${CAT_PARENT.name}.+${CAT_CHILD.name}`, 'i'),
      }),
    ).toBeInTheDocument();
  });

  it('removes a tag id from the selection when its pill is clicked', async () => {
    const { onChange, user } = renderBar({
      searchKey: { tag: [TAG_A.id, TAG_B.id] },
    });
    const pill = await screen.findByRole('button', {
      name: new RegExp(TAG_A.name, 'i'),
    });
    await user.click(pill);
    expect(onChange).toHaveBeenCalledWith({
      tag: [TAG_B.id],
      category: [],
    });
  });
});
