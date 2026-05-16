import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Organisation } from '@/entities/organisation';
import type { OrganisationNode } from '@/entities/organisation';
import i18n from '@/i18n';

import { OrganisationTree } from './OrganisationTree.js';

const ORG = (over: Partial<Organisation> = {}): Organisation => ({
  id: '7d3a2e0e-2e8c-4b7a-9a6e-1f9d1e54b8f5',
  parentId: null,
  type: 'club',
  shortCode: 'STK',
  slug: null,
  country: 'SWE',
  nameEn: 'Stockholm',
  nameSv: 'Stockholm',
  nameFi: 'Tukholma',
  nameJa: null,
  logoUrl: null,
  address: null,
  contactEmail: null,
  headInstructorId: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

const node = (over: Partial<Organisation> = {}, children: OrganisationNode[] = []): OrganisationNode => ({
  ...ORG(over),
  children,
});

function renderTree(
  nodes: OrganisationNode[],
  overrides: Partial<{
    onEdit: (org: Organisation) => void;
    onMove: (org: Organisation) => void;
    onDelete: (org: Organisation) => void;
  }> = {},
) {
  const handlers = {
    onEdit: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(
    <I18nextProvider i18n={i18n}>
      <OrganisationTree
        nodes={nodes}
        onEdit={handlers.onEdit}
        onMove={handlers.onMove}
        onDelete={handlers.onDelete}
      />
    </I18nextProvider>,
  );
  return handlers;
}

describe('<OrganisationTree>', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders a single leaf node without an expand chevron', () => {
    const leaf = node({
      id: '11111111-1111-4111-8111-111111111111',
      nameEn: 'Solo Club',
    });

    renderTree([leaf]);

    expect(screen.getByText('Solo Club')).toBeInTheDocument();
    expect(screen.queryByLabelText('Collapse')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Expand')).not.toBeInTheDocument();
  });

  it('renders a parent with two children visible by default (expanded)', () => {
    const parent = node(
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'national_federation',
        nameEn: 'National Fed',
      },
      [
        node({
          id: '22222222-2222-4222-8222-222222222222',
          nameEn: 'Child A',
          parentId: '11111111-1111-4111-8111-111111111111',
        }),
        node({
          id: '33333333-3333-4333-8333-333333333333',
          nameEn: 'Child B',
          parentId: '11111111-1111-4111-8111-111111111111',
        }),
      ],
    );

    renderTree([parent]);

    expect(screen.getByText('National Fed')).toBeInTheDocument();
    expect(screen.getByText('Child A')).toBeInTheDocument();
    expect(screen.getByText('Child B')).toBeInTheDocument();
    // The parent has a chevron showing it's expanded
    expect(screen.getByLabelText('Collapse')).toBeInTheDocument();
  });

  it('collapses children when the chevron is clicked', async () => {
    const user = userEvent.setup();
    const parent = node(
      {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'national_federation',
        nameEn: 'National Fed',
      },
      [
        node({
          id: '22222222-2222-4222-8222-222222222222',
          nameEn: 'Child A',
          parentId: '11111111-1111-4111-8111-111111111111',
        }),
      ],
    );

    renderTree([parent]);

    expect(screen.getByText('Child A')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Collapse'));

    expect(screen.queryByText('Child A')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Expand')).toBeInTheDocument();
  });

  it('invokes the right callback with the right Organisation from the dropdown menu', async () => {
    const user = userEvent.setup();
    const target = node({
      id: '11111111-1111-4111-8111-111111111111',
      nameEn: 'Target Club',
    });

    // Edit
    {
      const handlers = renderTree([target]);

      await user.click(screen.getByLabelText('Actions'));
      await user.click(await screen.findByRole('menuitem', { name: /Edit/i }));

      expect(handlers.onEdit).toHaveBeenCalledTimes(1);
      expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: target.id, nameEn: 'Target Club' }));
      expect(handlers.onMove).not.toHaveBeenCalled();
      expect(handlers.onDelete).not.toHaveBeenCalled();
    }
  });

  it('invokes onMove when the Move menu item is clicked', async () => {
    const user = userEvent.setup();
    const target = node({
      id: '11111111-1111-4111-8111-111111111111',
      nameEn: 'Target Club',
    });

    const handlers = renderTree([target]);

    await user.click(screen.getByLabelText('Actions'));
    await user.click(await screen.findByRole('menuitem', { name: /Move/i }));

    expect(handlers.onMove).toHaveBeenCalledTimes(1);
    expect(handlers.onMove).toHaveBeenCalledWith(expect.objectContaining({ id: target.id }));
    expect(handlers.onEdit).not.toHaveBeenCalled();
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('invokes onDelete when the Delete menu item is clicked', async () => {
    const user = userEvent.setup();
    const target = node({
      id: '11111111-1111-4111-8111-111111111111',
      nameEn: 'Target Club',
    });

    const handlers = renderTree([target]);

    await user.click(screen.getByLabelText('Actions'));
    await user.click(await screen.findByRole('menuitem', { name: /Delete/i }));

    expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    expect(handlers.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: target.id }));
    expect(handlers.onEdit).not.toHaveBeenCalled();
    expect(handlers.onMove).not.toHaveBeenCalled();
  });
});
