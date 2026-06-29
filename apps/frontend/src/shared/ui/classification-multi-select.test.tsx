import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ClassificationMultiSelect } from './classification-multi-select.js';

const mockOptions = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    parentId: '550e8400-e29b-41d4-a716-446655440000',
    rootCode: 'attack_type' as const,
    code: 'kick',
    nameEn: 'Kick',
    nameSv: 'Spark',
    nameFi: 'Potku',
    nameJa: '',
    sortOrder: 0,
    isActive: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    parentId: '550e8400-e29b-41d4-a716-446655440000',
    rootCode: 'attack_type' as const,
    code: 'punch',
    nameEn: 'Punch',
    nameSv: 'Slag',
    nameFi: 'Lyönti',
    nameJa: '',
    sortOrder: 1,
    isActive: false, // inactive — visibility depends on selectedIds
  },
];

function setup(selectedIds: string[] = []) {
  const onChange = vi.fn();
  render(
    <ClassificationMultiSelect
      options={mockOptions}
      selectedIds={selectedIds}
      onChange={onChange}
      label="Attack type"
    />,
  );
  return { onChange };
}

describe('<ClassificationMultiSelect>', () => {
  it('renders chips from the supplied options (active only by default)', () => {
    setup([]);
    expect(screen.getByRole('button', { name: /^Kick$/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Punch$/i }),
    ).not.toBeInTheDocument();
  });

  it('inactive option stays visible when pre-selected', () => {
    setup(['550e8400-e29b-41d4-a716-446655440002']);
    expect(
      screen.getByRole('button', { name: /^Punch$/i }),
    ).toBeInTheDocument();
  });

  it('click toggles selection', () => {
    const { onChange } = setup([]);
    fireEvent.click(screen.getByRole('button', { name: /^Kick$/i }));
    expect(onChange).toHaveBeenCalledWith([
      '550e8400-e29b-41d4-a716-446655440001',
    ]);
  });

  it('exposes the field label as the chip group accessible name', () => {
    setup([]);
    // Querying `getByRole('group', { name: 'Attack type' })` resolves
    // through the `aria-labelledby` link to the `<Label>`. Without
    // this wiring a screen reader entering the chip cluster hears
    // only "Kick, button, pressed false" with no field context —
    // particularly confusing on the technique form which stacks
    // three of these selectors vertically.
    expect(
      screen.getByRole('group', { name: /attack type/i }),
    ).toBeInTheDocument();
  });

  it('keeps each chip accessible name as the option label (no field-prefix duplication)', () => {
    setup([]);
    // The chip itself stays cleanly labelled "Kick" — the group's
    // `aria-labelledby` adds the field context at the group level
    // without repeating "Attack type" on every chip read.
    const chip = screen.getByRole('button', { name: /^Kick$/i });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('omits aria-labelledby on the group when no label prop is provided', () => {
    const onChange = vi.fn();
    render(
      <ClassificationMultiSelect
        options={mockOptions}
        selectedIds={[]}
        onChange={onChange}
      />,
    );
    // With no `label` prop, the group still renders (the chips
    // remain grouped semantically) but without an aria-labelledby
    // pointing at a non-existent label id.
    const group = screen.getByRole('group');
    expect(group).not.toHaveAttribute('aria-labelledby');
  });
});
