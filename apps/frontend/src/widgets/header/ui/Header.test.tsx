import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';

// Stub the locale switcher — it has its own QueryClient + feature
// flag dependencies that aren't part of this test's surface. The
// stub renders a placeholder so the header layout still shows the
// switcher slot is there.
vi.mock('@/features/locale-switcher', () => ({
  LocaleSwitcher: () => <span data-testid="locale-switcher-stub" />,
}));

// Stub TanStack Router so the test doesn't need a `RouterProvider`.
// `Link` renders as a plain anchor; the test asserts on the href
// attribute to confirm routing intent.
vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode } & Record<string, unknown>) => (
      <a href={to} {...rest}>{children}</a>
    ),
  };
});

import { Header } from './Header.js';

/**
 * Tiny widget — public-facing top bar. The behaviour worth pinning
 * is the rendering of the three slots (home link, locale switcher,
 * sign-in CTA) and the `to` prop of each `<Link>`. A future "let me
 * silently change the sign-in href" change would otherwise fail
 * quietly.
 */

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

function renderHeader() {
  return render(
    <I18nextProvider i18n={i18n}>
      <Header />
    </I18nextProvider>,
  );
}

describe('<Header>', () => {
  it('renders the brand link pointing at the root', () => {
    renderHeader();
    const brand = screen.getByRole('link', { name: /taidohub/i });
    expect(brand).toHaveAttribute('href', '/');
  });

  it('renders the locale switcher slot', () => {
    renderHeader();
    expect(screen.getByTestId('locale-switcher-stub')).toBeInTheDocument();
  });

  it('renders the Sign in link pointing at /login', () => {
    renderHeader();
    const signIn = screen.getByRole('link', { name: /sign in/i });
    expect(signIn).toHaveAttribute('href', '/login');
  });
});
