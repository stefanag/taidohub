import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainingSessionDialog } from './TrainingSessionDialog.js';

import i18n from '@/i18n';

const create = vi.fn();

vi.mock('@/entities/technique', () => ({
  useTechniquesQuery: () => ({ data: [{ id: 't-1', nameRomaji: 'Tsuki' }] }),
}));
vi.mock('@/entities/pattern', () => ({
  usePatternsQuery: () => ({ data: [{ id: 'p-1', nameRomaji: 'Sen-un' }] }),
}));
vi.mock('@/entities/training-log', async (orig) => {
  const actual = await orig<typeof import('@/entities/training-log')>();
  return { ...actual, createTrainingSession: (input: unknown) => create(input) };
});

beforeEach(async () => {
  await i18n.changeLanguage('en');
  create.mockReset();
  create.mockResolvedValue({});
});

describe('<TrainingSessionDialog>', () => {
  it('logs a session with a picked pattern', async () => {
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nextProvider i18n={i18n}>
          <TrainingSessionDialog open onOpenChange={onOpenChange} />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Practised techniques and patterns'), {
      target: { value: 'sen' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sen-un/ }));
    expect(screen.getByRole('list', { name: 'Chosen techniques and patterns' })).toHaveTextContent(
      'Sen-un',
    );

    fireEvent.change(screen.getByLabelText('Duration (minutes)'), { target: { value: '90' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'club',
        durationMinutes: 90,
        items: [{ contentType: 'pattern', contentId: 'p-1' }],
      }),
    );
  });

  it('rejects a duration out of range without saving', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nextProvider i18n={i18n}>
          <TrainingSessionDialog open onOpenChange={vi.fn()} />
        </I18nextProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Duration (minutes)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/between 1 and 1440/);
    expect(create).not.toHaveBeenCalled();
  });
});
