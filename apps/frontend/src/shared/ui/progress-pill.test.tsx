import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProgressPill } from './progress-pill.js';

describe('<ProgressPill>', () => {
  it('renders the status label (raw key fallback OR seeded translation)', () => {
    render(<ProgressPill status="learning" onClick={() => {}} />);
    // i18n keys land in Task 10. Accept any locale's "learning" string or the raw key.
    expect(
      screen.getByRole('button', { name: /learning|opiskelen|lär mig|progress\.status\.learning/i }),
    ).toBeInTheDocument();
  });

  it('click fires the handler', () => {
    const onClick = vi.fn();
    render(<ProgressPill status="learning" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
