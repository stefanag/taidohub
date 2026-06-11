import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

const HOKEI_ID = '550e8400-e29b-41d4-a716-446655440001';
const KOBO_ID = '550e8400-e29b-41d4-a716-446655440002';
const YO_ID = '550e8400-e29b-41d4-a716-446655440003';

// Stub the classification hook so chips render synchronously and we can
// drive the conditional hokei_subtype picker logic by chip clicks.
vi.mock('@/entities/classification-category', () => ({
  useClassificationCategoriesByRootQuery: (rootCode: string) => ({
    data:
      rootCode === 'pattern_type'
        ? [
            {
              id: HOKEI_ID,
              parentId: 'p',
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
              id: KOBO_ID,
              parentId: 'p',
              rootCode: 'pattern_type',
              code: 'kobo',
              nameEn: 'Kobo',
              nameSv: '',
              nameFi: '',
              nameJa: '',
              sortOrder: 1,
              isActive: true,
            },
          ]
        : [
            {
              id: YO_ID,
              parentId: 'p',
              rootCode: 'hokei_subtype',
              code: 'yo',
              nameEn: 'Yo',
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

const createSpy = vi.fn();
vi.mock('@/entities/pattern', () => ({
  useCreatePatternMutation: () => ({ mutate: createSpy, isPending: false }),
  useUpdatePatternMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { PatternFormDialog } from './PatternFormDialog.js';

function renderDialog() {
  const onOpenChange = vi.fn();
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <PatternFormDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('<PatternFormDialog>', () => {
  it('disables submit until at least one pattern_type chip is selected and romaji is non-empty', () => {
    createSpy.mockClear();
    renderDialog();
    const save = screen.getByRole('button', { name: /save|spara|tallenna/i });
    expect(save).toBeDisabled();
  });

  it('hides the hokei_subtype picker when no hokei pattern_type chip is selected', () => {
    renderDialog();
    // Click the Kobo chip (NOT hokei).
    fireEvent.click(screen.getByRole('button', { name: /^Kobo$/i }));
    // The subtype 'Yo' chip should NOT be in the DOM.
    expect(
      screen.queryByRole('button', { name: /^Yo$/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the hokei_subtype picker after clicking the hokei chip', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /^Hokei$/i }));
    expect(
      screen.getByRole('button', { name: /^Yo$/i }),
    ).toBeInTheDocument();
  });

  it('clears subtype state when the hokei chip is deselected, then re-selected', async () => {
    createSpy.mockClear();
    renderDialog();
    // Click hokei → subtype picker appears.
    fireEvent.click(screen.getByRole('button', { name: /^Hokei$/i }));
    // Click Yo → subtypeIds = [YO_ID].
    fireEvent.click(screen.getByRole('button', { name: /^Yo$/i }));
    // Click hokei again to deselect — subtype picker hides.
    fireEvent.click(screen.getByRole('button', { name: /^Hokei$/i }));
    expect(
      screen.queryByRole('button', { name: /^Yo$/i }),
    ).not.toBeInTheDocument();
    // Fill romaji so submit can fire.
    fireEvent.change(screen.getByLabelText(/romaji/i), {
      target: { value: 'sei no hokei' },
    });
    // Re-select hokei to satisfy the required pattern_type constraint.
    fireEvent.click(screen.getByRole('button', { name: /^Hokei$/i }));

    fireEvent.click(
      screen.getByRole('button', { name: /save|spara|tallenna/i }),
    );

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
    const [arg] = createSpy.mock.calls[0]!;
    // classificationIds should contain HOKEI_ID but NOT YO_ID (cleared when
    // the subtype picker hid).
    expect(arg.classificationIds).toContain(HOKEI_ID);
    expect(arg.classificationIds).not.toContain(YO_ID);
    expect(arg.nameRomaji).toBe('sei no hokei');
    expect(arg.officialBodyOrgId).toBeNull();
  });
});
