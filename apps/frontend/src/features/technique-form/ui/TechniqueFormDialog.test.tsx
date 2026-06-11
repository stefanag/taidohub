import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Stub the classification hook so chips render synchronously.
vi.mock('@/entities/classification-category', () => ({
  useClassificationCategoriesByRootQuery: (rootCode: string) => ({
    data:
      rootCode === 'technique_type'
        ? [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              parentId: 'p',
              rootCode: 'technique_type',
              code: 'kihon',
              nameEn: 'Kihon',
              nameSv: '',
              nameFi: '',
              nameJa: '',
              sortOrder: 0,
              isActive: true,
            },
          ]
        : [
            {
              id: '550e8400-e29b-41d4-a716-446655440002',
              parentId: 'p',
              rootCode,
              code: 'x',
              nameEn: 'X',
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
vi.mock('@/entities/technique', () => ({
  useCreateTechniqueMutation: () => ({ mutate: createSpy, isPending: false }),
  useUpdateTechniqueMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { TechniqueFormDialog } from './TechniqueFormDialog.js';

function renderDialog() {
  const onOpenChange = vi.fn();
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <TechniqueFormDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('<TechniqueFormDialog>', () => {
  it('disables submit until at least one technique_type chip is selected and romaji is non-empty', () => {
    renderDialog();
    const save = screen.getByRole('button', { name: /save|spara|tallenna/i });
    expect(save).toBeDisabled();
  });

  it('calls create mutation with flattened classificationIds on submit', async () => {
    createSpy.mockClear();
    renderDialog();
    // Pick the technique_type chip.
    fireEvent.click(screen.getByRole('button', { name: /Kihon/i }));
    // Set romaji.
    fireEvent.change(screen.getByLabelText(/romaji/i), {
      target: { value: 'mae geri' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: /save|spara|tallenna/i }),
    );

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
    const [arg] = createSpy.mock.calls[0]!;
    expect(arg.classificationIds).toContain(
      '550e8400-e29b-41d4-a716-446655440001',
    );
    expect(arg.nameRomaji).toBe('mae geri');
  });
});
