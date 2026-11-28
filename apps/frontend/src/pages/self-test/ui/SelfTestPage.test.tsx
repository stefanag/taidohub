import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SelfTestPage } from './SelfTestPage.js';

import i18n from '@/i18n';
import { DEFAULT_FLAGS, FeatureFlagsProvider } from '@/shared/lib/feature-flags';

const techniques = vi.fn();
const entry = (id: string, romaji: string, en: string) => ({
  id,
  nameJa: null,
  nameRomaji: romaji,
  nameEn: en,
  nameSv: '',
  nameFi: '',
});

vi.mock('@/entities/technique', () => ({ useTechniquesQuery: () => techniques() }));
vi.mock('@/entities/pattern', () => ({ usePatternsQuery: () => ({ data: [], isPending: false }) }));

function renderPage(flag = true) {
  return render(
    <FeatureFlagsProvider flags={{ ...DEFAULT_FLAGS, 'self-test': flag }}>
      <I18nextProvider i18n={i18n}>
        <SelfTestPage />
      </I18nextProvider>
    </FeatureFlagsProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  techniques.mockReturnValue({
    data: [
      entry('1', 'Tsuki', 'Punch'),
      entry('2', 'Geri', 'Kick'),
      entry('3', 'Uke', 'Block'),
      entry('4', 'Kamae', 'Stance'),
    ],
    isPending: false,
  });
});

describe('<SelfTestPage>', () => {
  it('says the feature is unavailable with the flag off', () => {
    renderPage(false);
    expect(screen.getByText('The self-test is not available yet.')).toBeInTheDocument();
  });

  it('needs at least four translated terms', () => {
    techniques.mockReturnValue({ data: [entry('1', 'Tsuki', 'Punch')], isPending: false });
    renderPage();
    expect(screen.getByTestId('self-test-too-few')).toBeInTheDocument();
  });

  it('scores a full round of multiple choice', () => {
    renderPage();
    const answers: Record<string, string> = {
      Tsuki: 'Punch',
      Geri: 'Kick',
      Uke: 'Block',
      Kamae: 'Stance',
    };
    for (let i = 0; i < 4; i++) {
      const prompt = screen.getByTestId('self-test-prompt').textContent!;
      fireEvent.click(screen.getByRole('button', { name: answers[prompt]! }));
      expect(screen.getByRole('status')).toHaveTextContent('Correct!');
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    expect(screen.getByTestId('self-test-score')).toHaveTextContent('You got 4 of 4 right.');
  });
});
