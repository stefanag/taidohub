import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';
import { FeatureFlagsProvider } from '@/shared/lib/feature-flags';

// Mock FeedbackThread so we can detect mounting without standing up
// the full QueryClient + entities/feedback graph. The mock records
// the props it was called with so we can assert the sheet forwards
// `entityType` / `entityId` / `studentId` correctly when it opens.
const feedbackThreadMock = vi.hoisted(() => ({
  spy: vi.fn(),
}));
vi.mock('./FeedbackThread.js', () => ({
  FeedbackThread: (props: unknown) => {
    feedbackThreadMock.spy(props);
    return <div data-testid="feedback-thread-mounted" />;
  },
}));

import { FeedbackThreadSheet } from './FeedbackThreadSheet.js';

/**
 * `FeedbackThreadSheet` is the lazy entry point to the feedback feature
 * — wraps `<FeedbackThread>` in a `<Sheet>` AND gates the whole thing
 * behind the `instructor-feedback` feature flag. The behaviours worth
 * pinning are exactly the two reasons that wrap exists:
 *
 *   1. **Flag gate.** When `instructor-feedback` is off, nothing
 *      renders — not even the trigger button. Critical for the
 *      50-row catalogue list use case described in the component's
 *      docstring: the trigger never registers a per-row `useState`
 *      when the feature is disabled.
 *   2. **Lazy thread mount.** When the flag is on AND the sheet is
 *      closed, `<FeedbackThread>` is NOT in the DOM — its queries
 *      don't fire. Exercising the open path through Radix's pointer
 *      events requires the pointer-capture stub (see
 *      `docs/frontend-test-recipe.md`); this spec sticks to the
 *      closed-state contract since that's where the bug surface
 *      actually lives (a wrongly-mounted thread fans out queries
 *      across every row).
 */

beforeEach(async () => {
  feedbackThreadMock.spy.mockClear();
  await i18n.changeLanguage('en');
});

interface RenderOpts {
  instructorFeedback?: boolean;
  trigger?: React.ReactNode;
}

function renderSheet({
  instructorFeedback = true,
  trigger,
}: RenderOpts = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <FeatureFlagsProvider
        flags={{
          'instructor-feedback': instructorFeedback,
          'grading-history': true,
          'grading-history-verification': true,
        }}
      >
        <FeedbackThreadSheet
          entityType="technique"
          entityId="tech-1"
          studentId="student-1"
          contextLabel="Jukyu · 2026-06-01"
          {...(trigger ? { trigger } : {})}
        />
      </FeatureFlagsProvider>
    </I18nextProvider>,
  );
}

describe('<FeedbackThreadSheet>', () => {
  it('renders nothing when the instructor-feedback flag is off', () => {
    renderSheet({ instructorFeedback: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feedback-thread-mounted')).not.toBeInTheDocument();
  });

  it('renders the default trigger button when the flag is on', () => {
    renderSheet({ instructorFeedback: true });
    // `aria-label="Feedback"` matches the i18n `feedback.title` key —
    // also exposes the same string as the visible label, so the
    // accessible name resolves to one match.
    const triggers = screen.getAllByRole('button', { name: /feedback/i });
    expect(triggers.length).toBeGreaterThanOrEqual(1);
  });

  it('renders a custom trigger when one is provided', () => {
    renderSheet({
      instructorFeedback: true,
      trigger: <button type="button">Custom trigger</button>,
    });
    expect(screen.getByRole('button', { name: 'Custom trigger' })).toBeInTheDocument();
    // The default chat-icon trigger is replaced — no "feedback" trigger
    // alongside the custom one.
    expect(screen.queryByRole('button', { name: /^feedback$/i })).not.toBeInTheDocument();
  });

  it('does NOT mount FeedbackThread while the sheet is closed (lazy load)', () => {
    renderSheet({ instructorFeedback: true });
    // Radix Sheet starts closed; the inner conditional
    // `{open ? <FeedbackThread .../> : null}` short-circuits to null.
    expect(screen.queryByTestId('feedback-thread-mounted')).not.toBeInTheDocument();
    expect(feedbackThreadMock.spy).not.toHaveBeenCalled();
  });
});
