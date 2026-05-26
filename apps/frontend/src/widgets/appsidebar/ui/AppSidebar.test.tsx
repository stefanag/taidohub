import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '@/features/auth-by-email';
import i18n from '@/i18n';
import { AbilityContext, defineAbilityFor } from '@/shared/lib/casl';
import { SidebarProvider } from '@/shared/ui';

// jsdom doesn't implement matchMedia; shadcn's `useIsMobile` hook calls it.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

// Partial-mock TanStack Router so `Link` keeps working while we control
// `useRouterState` and `useNavigate`.
const navigateMock = vi.fn();
const useRouterStateMock = vi.fn<() => string>(() => '/dashboard');

vi.mock('@tanstack/react-router', async (orig) => {
  const actual = await orig<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    // `Link` normally needs a router context (RouterProvider). For unit tests
    // we don't care about real navigation — render it as a plain anchor.
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode } & Record<string, unknown>) => (
      <a href={to} {...rest}>{children}</a>
    ),
    useNavigate: () => navigateMock,
    useRouterState: (opts: { select: (s: { location: { pathname: string } }) => string }) =>
      opts.select({ location: { pathname: useRouterStateMock() } }),
  };
});

import { AppSidebar } from './AppSidebar.js';

function renderInProvider(): ReturnType<typeof render> {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
  );
}

function renderInProviderWithAbility(
  role: 'sysadmin' | 'user',
): ReturnType<typeof render> {
  const ability = defineAbilityFor({ id: 'u1', role });
  return render(
    <SidebarProvider>
      <AbilityContext.Provider value={ability}>
        <AppSidebar />
      </AbilityContext.Provider>
    </SidebarProvider>,
  );
}

describe('<AppSidebar>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useRouterStateMock.mockReturnValue('/dashboard');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockReset();
    useRouterStateMock.mockReset();
  });

  it('renders the nav entries with translated English labels', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b' }, session: { id: 's1' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    renderInProvider();

    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
  });

  it('renders the signed-in user email in the footer', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'ada@example.com' }, session: { id: 's1' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    renderInProvider();

    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
  });

  it('signs the user out and navigates to / when sign-out is clicked', async () => {
    const signOutSpy = vi.spyOn(authApi, 'signOut').mockResolvedValue();
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b' }, session: { id: 's1' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    const user = userEvent.setup();
    renderInProvider();

    await user.click(screen.getByRole('button', { name: /Sign out/i }));

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: '/' });
    });
  });

  it('renders the admin organisations link when the user is a sysadmin', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b' }, session: { id: 's1' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    renderInProviderWithAbility('sysadmin');

    const adminLink = screen.getByRole('link', { name: /^Organisations$/i });
    expect(adminLink).toBeInTheDocument();
    expect(adminLink).toHaveAttribute('href', '/admin/organisations');

    const auditLogLink = screen.getByRole('link', { name: /^Audit log$/i });
    expect(auditLogLink).toBeInTheDocument();
    expect(auditLogLink).toHaveAttribute('href', '/admin/audit-log');
  });

  it('hides the admin organisations link for non-admin users', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b' }, session: { id: 's1' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    renderInProviderWithAbility('user');

    expect(
      screen.queryByRole('link', { name: /^Organisations$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /^Audit log$/i }),
    ).not.toBeInTheDocument();
    const links = screen.queryAllByRole('link');
    expect(
      links.find((l) => l.getAttribute('href') === '/admin/organisations'),
    ).toBeUndefined();
    expect(
      links.find((l) => l.getAttribute('href') === '/admin/audit-log'),
    ).toBeUndefined();
  });

  it('renders the belt catalog link for sysadmin users', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b' }, session: { id: 's1' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    renderInProviderWithAbility('sysadmin');

    const beltCatalogLink = screen.getByRole('link', { name: /^Belt catalog$/i });
    expect(beltCatalogLink).toBeInTheDocument();
    expect(beltCatalogLink).toHaveAttribute('href', '/admin/belt-catalog');
  });

  it('hides the belt catalog link for non-admin users', () => {
    vi.spyOn(authApi, 'useSession').mockReturnValue({
      data: { user: { id: 'u1', email: 'a@b' }, session: { id: 's1' } },
      isPending: false,
      error: null,
      refetch: () => Promise.resolve(),
    } as unknown as ReturnType<typeof authApi.useSession>);

    renderInProviderWithAbility('user');

    expect(
      screen.queryByRole('link', { name: /^Belt catalog$/i }),
    ).not.toBeInTheDocument();
  });
});
