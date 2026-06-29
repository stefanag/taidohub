import { fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Test helpers for Radix Primitives interactions in jsdom.
 *
 * Radix uses pointer-capture APIs (`hasPointerCapture`,
 * `setPointerCapture`, `releasePointerCapture`) that jsdom doesn't
 * implement. The first time a spec tries to open a Popover, Dropdown,
 * Sheet, or Dialog by clicking its trigger, the click throws inside
 * the Radix root. The fix is to stub those four prototype methods
 * AND `scrollIntoView` (which Radix also calls when positioning).
 *
 * Pattern 3 in `docs/frontend-test-recipe.md` documents this; the
 * helpers below are the reusable form.
 *
 * # Usage
 *
 * ```ts
 * import { stubRadixPointerEvents, openRadixPopover } from '@/shared/test/radix';
 *
 * beforeAll(() => {
 *   stubRadixPointerEvents();
 * });
 *
 * it('opens the popover on trigger click', async () => {
 *   render(<Component />);
 *   await openRadixPopover(screen.getByRole('button', { name: /open/i }));
 *   expect(screen.getByRole('dialog')).toBeInTheDocument();
 * });
 * ```
 *
 * `stubRadixPointerEvents()` is idempotent — calling it multiple
 * times (e.g. once per `beforeAll` in different test files within
 * the same worker) only assigns the stubs that aren't already set.
 */
export function stubRadixPointerEvents(): void {
  window.HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture ??= vi.fn();
  window.HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  window.HTMLElement.prototype.scrollIntoView ??= vi.fn();
}

/**
 * Drive a Radix Popover / Dropdown / Select trigger through the
 * pointer sequence Radix expects. Returns when the click event has
 * been dispatched — the caller awaits any subsequent
 * `screen.findBy*` / `waitFor` for the portal-rendered content.
 *
 * Use this for triggers that open a portal (Popover, Dropdown,
 * Select). For triggers that toggle a Dialog or Sheet, the simpler
 * `userEvent.click(trigger)` works once `stubRadixPointerEvents`
 * has run — Dialog / Sheet don't need the full pointer dance.
 */
export async function openRadixPopover(trigger: HTMLElement): Promise<void> {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
  fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
  fireEvent.click(trigger);
}
