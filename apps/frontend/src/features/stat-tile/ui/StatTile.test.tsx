import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatTile } from './StatTile.js';

describe('<StatTile>', () => {
  it('renders the label and formatted value', () => {
    render(<StatTile label="Students" value={1234} />);
    expect(screen.getByText('Students')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders an up delta with a "+" prefix', () => {
    render(<StatTile label="X" value={10} deltaPct={12.5} />);
    expect(screen.getByText(/\+12\.5%/)).toBeInTheDocument();
  });

  it('renders a down delta with a "−" prefix', () => {
    render(<StatTile label="X" value={10} deltaPct={-3.4} />);
    expect(screen.getByText(/−3\.4%/)).toBeInTheDocument();
  });
});
