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

const TECHNIQUE_ID = '550e8400-e29b-41d4-a716-446655440000';
const STUDENT_ID = 'student-user-1';

const upsertTechSpy = vi.fn();
const upsertPatSpy = vi.fn();
const deleteTechSpy = vi.fn();
const deletePatSpy = vi.fn();
const studentProgressSpy = vi.fn<() => { data: Progress[] | undefined; isLoading: boolean }>(
  () => ({ data: undefined, isLoading: false }),
);

vi.mock('@/entities/student', () => ({
  useStudentProgressQuery: () => studentProgressSpy(),
  useUpsertStudentTechniqueProgressMutation: () => ({
    mutate: upsertTechSpy,
    isPending: false,
  }),
  useUpsertStudentPatternProgressMutation: () => ({
    mutate: upsertPatSpy,
    isPending: false,
  }),
  useDeleteStudentTechniqueProgressMutation: () => ({
    mutate: deleteTechSpy,
    isPending: false,
  }),
  useDeleteStudentPatternProgressMutation: () => ({
    mutate: deletePatSpy,
    isPending: false,
  }),
}));

import { StudentProgressEditorDialog } from './StudentProgressEditorDialog.js';

function renderDialog(
  props: Partial<React.ComponentProps<typeof StudentProgressEditorDialog>> = {},
) {
  const onOpenChange = vi.fn();
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <StudentProgressEditorDialog
        open
        onOpenChange={onOpenChange}
        studentUserId={STUDENT_ID}
        contentType="technique"
        contentId={TECHNIQUE_ID}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function makeProgressRow(overrides: Partial<Progress> = {}): Progress {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    userId: STUDENT_ID,
    contentType: 'technique',
    techniqueId: TECHNIQUE_ID,
    patternId: null,
    status: 'learning',
    studentNotes: '',
    instructorNotes: '',
    lastPracticedAt: null,
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  upsertTechSpy.mockClear();
  upsertPatSpy.mockClear();
  deleteTechSpy.mockClear();
  deletePatSpy.mockClear();
  studentProgressSpy.mockReset();
  studentProgressSpy.mockReturnValue({ data: undefined, isLoading: false });
});

describe('<StudentProgressEditorDialog>', () => {
  it('renders existing.studentNotes read-only when set', () => {
    studentProgressSpy.mockReturnValue({
      data: [
        makeProgressRow({
          studentNotes: 'Need to drill turning footwork more',
        }),
      ],
      isLoading: false,
    });

    renderDialog();

    const node = screen.getByText('Need to drill turning footwork more');
    expect(node).toBeInTheDocument();
    // The read-only display is a <p>, not an input/textarea.
    expect(node.tagName.toLowerCase()).toBe('p');
  });

  it('submitting calls upsert mutation with status, instructorNotes, lastPracticedAt', async () => {
    renderDialog();
    fireEvent.click(
      screen.getByRole('button', {
        name: /^save$|^spara$|^tallenna$|progress\.save/i,
      }),
    );
    await waitFor(() => {
      expect(upsertTechSpy).toHaveBeenCalled();
    });
    const [arg] = upsertTechSpy.mock.calls[0]!;
    expect(arg).toMatchObject({
      techniqueId: TECHNIQUE_ID,
      input: expect.objectContaining({
        status: 'not_started',
        instructorNotes: '',
        lastPracticedAt: null,
      }),
    });
  });

  it('Reset (with confirmed window.confirm) calls the delete mutation', () => {
    studentProgressSpy.mockReturnValue({
      data: [makeProgressRow()],
      isLoading: false,
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderDialog();
    fireEvent.click(
      screen.getByRole('button', {
        name: /reset|återställ|nollaa|progress\.reset/i,
      }),
    );

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteTechSpy).toHaveBeenCalled();
    const [arg] = deleteTechSpy.mock.calls[0]!;
    expect(arg).toBe(TECHNIQUE_ID);

    confirmSpy.mockRestore();
  });
});
