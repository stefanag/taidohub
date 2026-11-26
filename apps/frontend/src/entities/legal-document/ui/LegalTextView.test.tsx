import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LegalTextView } from './LegalTextView.js';

import type { PublishedLegalDocument } from '@repo/contracts/legal-documents';

import i18n from '@/i18n';

const base: PublishedLegalDocument = {
  documentId: 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1e',
  kind: 'terms',
  audience: 'members',
  organisationId: null,
  versionId: 'c5a1d6f0-9f3a-4b2c-8d4e-6f7a8b9c0d1f',
  version: 2,
  publishedAt: '2026-11-26T10:00:00.000Z',
  authoritativeLocale: 'sv',
  availableLocales: ['en', 'sv'],
  translation: {
    locale: 'sv',
    revision: 1,
    title: 'Användarvillkor',
    body: { ops: [{ insert: 'Text\n' }] },
  },
  isFallback: false,
};

describe('<LegalTextView>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows the binding text without a translation notice', () => {
    render(<LegalTextView document={base} />);
    expect(screen.getByRole('heading', { name: 'Användarvillkor' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('marks a translation, in its own language, and offers the binding version', async () => {
    const onLocaleChange = vi.fn();
    render(
      <LegalTextView
        document={{
          ...base,
          translation: { ...base.translation, locale: 'en', title: 'Terms of use' },
        }}
        onLocaleChange={onLocaleChange}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'This is a translation. The Swedish version is legally binding and takes precedence if the versions differ.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show the Swedish version' }));
    expect(onLocaleChange).toHaveBeenCalledWith('sv');
  });

  it('writes the notice in the language of the translation, not of the interface', () => {
    render(
      <LegalTextView
        document={{
          ...base,
          authoritativeLocale: 'en',
          translation: { ...base.translation, locale: 'sv' },
        }}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'Detta är en översättning. Versionen på engelska är legalt gällande',
    );
  });

  it('marks the binding language in the language switcher', () => {
    render(<LegalTextView document={base} onLocaleChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Svenska.*Legally binding/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('says when the requested language is missing', () => {
    render(<LegalTextView document={{ ...base, isFallback: true }} />);
    expect(screen.getByRole('note')).toHaveTextContent('not available in your language');
  });
});
