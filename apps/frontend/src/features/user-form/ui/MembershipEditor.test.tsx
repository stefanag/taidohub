import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MembershipEditor } from './MembershipEditor.js';

import i18n from '@/i18n';


// Mock the underlying API module so the query-options factory picks up the stub.
// vi.mock is hoisted by Vitest to the top of the file, so fixture data must be
// inlined directly in the factory — referencing module-level constants would be
// a TDZ error after hoisting.
vi.mock('@/entities/organisation/api/organisation.api.js', async (orig) => {
  const actual = await orig<typeof import('@/entities/organisation/api/organisation.api.js')>();
  return {
    ...actual,
    listOrganisations: vi.fn().mockResolvedValue({
      data: [
        // One club — instructor role should be allowed.
        {
          id: 'club-1', parentId: 'nf-1', type: 'club', shortCode: 'STK',
          slug: null, country: 'SWE', nameEn: 'Stockholm Club', nameSv: 'x',
          nameFi: 'x', nameJa: null, logoUrl: null, address: null,
          contactEmail: null, headInstructorId: null,
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
        // One national federation — instructor role should be disabled.
        {
          id: 'nf-1', parentId: 'if-1', type: 'national_federation', shortCode: 'STF',
          slug: null, country: 'SWE', nameEn: 'Swedish Fed', nameSv: 'x',
          nameFi: 'x', nameJa: null, logoUrl: null, address: null,
          contactEmail: null, headInstructorId: null,
          createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 2,
    }),
  };
});

/**
 * Open a Radix Select trigger in jsdom. Radix uses pointer events (not click)
 * on the trigger, and calls scrollIntoView on the selected item. Both are
 * missing or incomplete in jsdom, so we patch them temporarily.
 */
function openRadixSelect(trigger: HTMLElement): void {
  // Radix Select checks hasPointerCapture / sets pointer capture on the content.
  // jsdom leaves these unimplemented, so stub them when absent.
  window.HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture ??= vi.fn();
  window.HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  // Radix Select calls scrollIntoView on the highlighted item when the listbox
  // opens; jsdom does not implement it.
  window.HTMLElement.prototype.scrollIntoView ??= vi.fn();

  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
  fireEvent.pointerUp(trigger, { button: 0, pointerId: 1 });
  fireEvent.click(trigger);
}

function renderEditor() {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MembershipEditor open onOpenChange={vi.fn()} onConfirm={onConfirm} />
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { onConfirm };
}

describe('<MembershipEditor>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders the organisation and role pickers', () => {
    renderEditor();
    expect(screen.getByLabelText(/organisation/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
  });

  it('disables the instructor option when a non-club org is picked', async () => {
    renderEditor();

    const orgTrigger = screen.getByLabelText(/organisation/i);

    // Wait for the query data to populate the select (the API call resolves
    // async so the items may not be rendered immediately).
    openRadixSelect(orgTrigger);
    await screen.findByText(/Swedish Fed/);

    // Pick the national federation.
    fireEvent.click(screen.getByText(/Swedish Fed/));

    // Open the role picker and assert instructor is aria-disabled.
    const roleTrigger = screen.getByLabelText(/role/i);
    openRadixSelect(roleTrigger);
    const instructor = await screen.findByRole('option', { name: /instructor/i });
    expect(instructor).toHaveAttribute('aria-disabled', 'true');
  });

  it('allows instructor once a club is picked', async () => {
    renderEditor();

    const orgTrigger = screen.getByLabelText(/organisation/i);
    openRadixSelect(orgTrigger);
    await screen.findByText(/Stockholm Club/);

    fireEvent.click(screen.getByText(/Stockholm Club/));

    const roleTrigger = screen.getByLabelText(/role/i);
    openRadixSelect(roleTrigger);
    const instructor = await screen.findByRole('option', { name: /instructor/i });
    expect(instructor).not.toHaveAttribute('aria-disabled', 'true');
  });
});
