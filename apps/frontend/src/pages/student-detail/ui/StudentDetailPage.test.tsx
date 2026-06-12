import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

// Stub the route params hook so the page knows which student to render.
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ userId: 'u-1' }),
}));

vi.mock('@/entities/student', () => ({
  useStudentProgressQuery: () => ({
    data: [],
    isPending: false,
    isError: false,
    error: null,
  }),
  useStudentsQuery: () => ({
    data: [
      {
        userId: 'u-1',
        name: 'Aiko Tanaka',
        email: 'aiko@example.com',
        organisations: [],
        progressSummary: {
          not_started: 0,
          learning: 0,
          competent: 0,
          grading_ready: 0,
        },
      },
    ],
    isPending: false,
  }),
}));

vi.mock('@/entities/technique', () => ({
  useTechniquesQuery: () => ({
    data: [
      {
        id: 't-1',
        nameRomaji: 'mae geri',
        nameJa: '',
        nameEn: 'Front kick',
        nameSv: '',
        nameFi: '',
        classifications: [],
      },
    ],
    isPending: false,
  }),
}));

vi.mock('@/entities/pattern', () => ({
  usePatternsQuery: () => ({
    data: [
      {
        id: 'p-1',
        nameRomaji: 'hokei sho',
        nameJa: '',
        nameEn: 'Hokei sho',
        nameSv: '',
        nameFi: '',
        classifications: [],
      },
    ],
    isPending: false,
  }),
}));

// Lightweight dialog stub — renders a recognisable marker when open.
vi.mock('@/features/student-progress-editor-dialog', () => ({
  StudentProgressEditorDialog: ({
    open,
    contentLabel,
  }: {
    open: boolean;
    contentLabel?: string;
  }) =>
    open ? (
      <div role="dialog" aria-label="student-progress-editor">
        Editing: {contentLabel}
      </div>
    ) : null,
}));

import { StudentDetailPage } from './StudentDetailPage.js';

function renderPage(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <StudentDetailPage />
    </QueryClientProvider>,
  );
}

describe('<StudentDetailPage>', () => {
  it('renders the techniques and patterns sections with progress pills', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Techniques' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Patterns' }),
    ).toBeInTheDocument();
    expect(screen.getByText('mae geri')).toBeInTheDocument();
    expect(screen.getByText('hokei sho')).toBeInTheDocument();
  });

  it('opens the StudentProgressEditorDialog when a progress pill is clicked', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // ProgressPill renders as a button — click the first one (technique row).
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]!);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Editing: mae geri/)).toBeInTheDocument();
  });
});
