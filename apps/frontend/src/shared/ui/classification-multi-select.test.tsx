import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@/entities/classification-category', () => ({
  useClassificationCategoriesByRootQuery: () => ({
    data: mockOptions,
    isPending: false,
  }),
}));

import { ClassificationMultiSelect } from './classification-multi-select.js';

function setup(selectedIds: string[] = []) {
  const onChange = vi.fn();
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ClassificationMultiSelect
        rootCode="attack_type"
        selectedIds={selectedIds}
        onChange={onChange}
        label="Attack type"
      />
    </QueryClientProvider>,
  );
  return { onChange };
}

describe('<ClassificationMultiSelect>', () => {
  it('renders chips from the hook (active options only by default)', () => {
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
});
