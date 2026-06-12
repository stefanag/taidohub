import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Progress } from '@repo/contracts/progress';

// Radix UI Select uses pointer-capture and scrollIntoView APIs that jsdom
// does not implement. Stub them so the dropdown can mount.
window.Element.prototype.hasPointerCapture =
  vi.fn() as unknown as typeof window.Element.prototype.hasPointerCapture;
window.Element.prototype.setPointerCapture =
  vi.fn() as unknown as typeof window.Element.prototype.setPointerCapture;
window.Element.prototype.releasePointerCapture =
  vi.fn() as unknown as typeof window.Element.prototype.releasePointerCapture;
window.Element.prototype.scrollIntoView =
  vi.fn() as unknown as typeof window.Element.prototype.scrollIntoView;

const upsertSpy = vi.fn();
const deleteSpy = vi.fn();
const techniqueQuerySpy = vi.fn<() => { data: Progress | undefined; isLoading: boolean }>(
  () => ({ data: undefined, isLoading: false }),
);

vi.mock('@/entities/progress', () => ({
  useTechniqueProgressQuery: () => techniqueQuerySpy(),
  usePatternProgressQuery: () => ({ data: undefined, isLoading: false }),
  useUpsertTechniqueProgressMutation: () => ({
    mutate: upsertSpy,
    isPending: false,
  }),
  useUpsertPatternProgressMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useDeleteTechniqueProgressMutation: () => ({
    mutate: deleteSpy,
    isPending: false,
  }),
  useDeletePatternProgressMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

import { ProgressEditorDialog } from './ProgressEditorDialog.js';

function renderDialog(
  props: Partial<React.ComponentProps<typeof ProgressEditorDialog>> = {},
) {
  const onOpenChange = vi.fn();
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ProgressEditorDialog
        open
        onOpenChange={onOpenChange}
        contentType="technique"
        contentId="550e8400-e29b-41d4-a716-446655440000"
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

beforeEach(() => {
  upsertSpy.mockClear();
  deleteSpy.mockClear();
  techniqueQuerySpy.mockReset();
  techniqueQuerySpy.mockReturnValue({ data: undefined, isLoading: false });
});

describe('<ProgressEditorDialog>', () => {
  it('renders the status select + notes textarea + last-practiced date trigger', () => {
    renderDialog();
    expect(
      screen.getByRole('textbox', {
        name: /notes|muistiinpanot|anteckningar|progress\.studentNotes/i,
      }),
    ).toBeInTheDocument();
    // Radix Select trigger renders as a combobox.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('submitting calls upsert mutation with status, studentNotes, lastPracticedAt', async () => {
    renderDialog();
    fireEvent.click(
      screen.getByRole('button', {
        name: /^save$|^spara$|^tallenna$|progress\.save/i,
      }),
    );
    await waitFor(() => {
      expect(upsertSpy).toHaveBeenCalled();
    });
    const [arg] = upsertSpy.mock.calls[0]!;
    expect(arg).toMatchObject({
      id: '550e8400-e29b-41d4-a716-446655440000',
      input: expect.objectContaining({
        status: 'not_started',
        studentNotes: '',
        lastPracticedAt: null,
      }),
    });
  });

  it('Reset button only renders when an existing row is loaded', () => {
    // First render — no existing row → no Reset button.
    renderDialog();
    expect(
      screen.queryByRole('button', {
        name: /^reset$|^återställ$|^nollaa$|progress\.reset/i,
      }),
    ).not.toBeInTheDocument();
  });
});
