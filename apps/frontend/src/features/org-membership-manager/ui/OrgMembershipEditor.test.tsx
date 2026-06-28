import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MembershipRole } from '@/entities/membership';

import i18n from '@/i18n';

// Mock through the entity's public API barrel rather than the deep
// path `@/entities/user/api/user.api.js` — `fsd/no-public-api-sidestep`
// flags the deep import. We intercept at the hook layer: replace
// `listUsersQueryOptions` with a stable queryOptions object whose
// `queryFn` resolves the fixture synchronously. The component reads
// `useQuery(listUsersQueryOptions(...))`, so the mock takes effect
// without touching the underlying `listUsers` fetcher. Recipe lives
// in `docs/fsd-test-barrel-recipe.md`.
const { listUsersFixture } = vi.hoisted(() => ({
  listUsersFixture: {
    data: [
      {
        id: 'u-ada',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        emailVerified: true,
        image: null,
        role: 'user' as const,
        deactivatedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'u-bob',
        email: 'bob@example.com',
        name: null,
        emailVerified: true,
        image: null,
        role: 'user' as const,
        deactivatedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    total: 2,
    page: 1,
    perPage: 25,
  },
}));
vi.mock('@/entities/user', async (orig) => {
  const actual = await orig<typeof import('@/entities/user')>();
  return {
    ...actual,
    listUsersQueryOptions: (query: import('@/entities/user').ListUsersQuery) => ({
      queryKey: ['user', 'list', query] as const,
      queryFn: () => Promise.resolve(listUsersFixture),
    }),
  };
});

import { OrgMembershipEditor } from './OrgMembershipEditor.js';

/**
 * Open a Radix Select trigger in jsdom. Same stubs as MembershipEditor.test.tsx.
 */
function openRadixSelect(trigger: HTMLElement): void {
  window.HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture ??= vi.fn();
  window.HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  window.HTMLElement.prototype.scrollIntoView ??= vi.fn();

  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
  fireEvent.pointerUp(trigger, { button: 0, pointerId: 1 });
  fireEvent.click(trigger);
}

function renderEditor(
  props: Partial<React.ComponentProps<typeof OrgMembershipEditor>> = {},
) {
  const onConfirm = vi.fn<(userId: string, role: MembershipRole) => Promise<void>>(
    async () => undefined,
  );
  const onOpenChange = vi.fn();
  const allowedRoles: readonly MembershipRole[] = props.allowedRoles ?? [
    'orgadmin',
    'instructor',
  ];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <OrgMembershipEditor
          open
          onOpenChange={onOpenChange}
          allowedRoles={allowedRoles}
          onConfirm={onConfirm}
          {...props}
        />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onConfirm, onOpenChange };
}

describe('<OrgMembershipEditor>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the user picker and the supplied roles', async () => {
    renderEditor();

    // `User` and `Role` are the two field labels — both must be wired up.
    expect(screen.getByLabelText('User')).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();

    // Both supplied roles should be selectable in the role picker.
    openRadixSelect(screen.getByLabelText(/role/i));
    expect(
      await screen.findByRole('option', { name: /organisation administrator/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('option', { name: /instructor/i }),
    ).toBeInTheDocument();
  });

  it('hides the orgadmin role when only instructor is allowed', async () => {
    renderEditor({ allowedRoles: ['instructor'] });

    openRadixSelect(screen.getByLabelText(/role/i));
    expect(
      await screen.findByRole('option', { name: /instructor/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /organisation administrator/i }),
    ).not.toBeInTheDocument();
  });

  it('blocks submit and surfaces a validation error until a user is picked', async () => {
    const { onConfirm } = renderEditor();

    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /please select a user/i,
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
