import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Technique } from '@repo/contracts/techniques';

import i18n from '@/i18n';

const TYPE_KIHON = { id: 'type-1', code: 'kihon', nameEn: 'Kihon', nameSv: 'Kihon', nameFi: 'Kihon', nameJa: null, rootCode: 'technique_type', parentId: null, sortOrder: 0, isActive: true };
const SOTAI_HOIKO = { id: 'sotai-1', code: 'hoiko', nameEn: 'Hoiko', nameSv: 'Hoiko', nameFi: 'Hoiko', nameJa: null, rootCode: 'sotai_category', parentId: null, sortOrder: 0, isActive: true };
const ATTACK_PUNCH = { id: 'attack-1', code: 'punch', nameEn: 'Punch', nameSv: 'Punch', nameFi: 'Punch', nameJa: null, rootCode: 'attack_type', parentId: null, sortOrder: 0, isActive: true };

const { hooks } = vi.hoisted(() => ({
  hooks: {
    classificationByRoot: vi.fn<(root: string) => { data: unknown[]; isPending: boolean }>(),
    createMutate: vi.fn<(input: unknown, opts?: { onSuccess?: () => void }) => void>(),
    updateMutate: vi.fn<(input: unknown, opts?: { onSuccess?: () => void }) => void>(),
    createIsPending: false,
    updateIsPending: false,
  },
}));

vi.mock('@/entities/classification-category', () => ({
  useClassificationCategoriesByRootQuery: (root: string) => hooks.classificationByRoot(root),
}));
vi.mock('@/entities/technique', () => ({
  useCreateTechniqueMutation: () => ({
    mutate: hooks.createMutate,
    isPending: hooks.createIsPending,
  }),
  useUpdateTechniqueMutation: () => ({
    mutate: hooks.updateMutate,
    isPending: hooks.updateIsPending,
  }),
}));

import { TechniqueForm } from './TechniqueForm.js';

/**
 * `TechniqueForm` is the create / edit form for catalogue techniques.
 * Local component state, no react-hook-form. The behaviour worth
 * pinning is the submit gate (typeIds + romaji required) and the
 * dual create / update mutation dispatch — a future "let me drop
 * the romaji check" change would silently let empty rows hit the
 * backend.
 */

beforeEach(async () => {
  await i18n.changeLanguage('en');
  hooks.classificationByRoot.mockImplementation((root) => {
    if (root === 'technique_type') return { data: [TYPE_KIHON], isPending: false };
    if (root === 'sotai_category') return { data: [SOTAI_HOIKO], isPending: false };
    if (root === 'attack_type') return { data: [ATTACK_PUNCH], isPending: false };
    return { data: [], isPending: false };
  });
  hooks.createMutate.mockReset();
  hooks.updateMutate.mockReset();
  hooks.createIsPending = false;
  hooks.updateIsPending = false;
});

function renderForm(technique?: Technique) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  return {
    onSaved,
    onCancel,
    ...render(
      <I18nextProvider i18n={i18n}>
        <TechniqueForm
          {...(technique ? { technique } : {})}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      </I18nextProvider>,
    ),
  };
}

describe('<TechniqueForm>', () => {
  it('disables Save when no technique-type classification has been selected', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('dispatches the CREATE mutation with classificationIds + name fields', async () => {
    const user = userEvent.setup();
    const { onSaved, container } = renderForm();

    // Locate the Kihon type chip via visible text (the chip Button
    // wraps `<span>Kihon</span>`; the accessible name resolves but
    // some i18n loading paths can race — text-query is more robust).
    const kihonChip = container.querySelector<HTMLButtonElement>(
      'button[aria-pressed]',
    );
    expect(kihonChip).not.toBeNull();
    expect(kihonChip!.textContent).toContain('Kihon');
    await user.click(kihonChip!);
    // Fill romaji
    const romajiInput = screen.getByLabelText(/romaji/i);
    await user.type(romajiInput, 'Tsuki');

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(hooks.createMutate).toHaveBeenCalledTimes(1);
    const [input, opts] = hooks.createMutate.mock.calls[0]!;
    expect(input).toMatchObject({
      classificationIds: ['type-1'],
      nameRomaji: 'Tsuki',
      isKihon: false,
      isActive: true,
    });
    // The onSuccess callback bridges to `onSaved`. Calling it ourselves
    // confirms the bridge is wired (the mutation hook would otherwise
    // invoke it on a real success).
    (opts as { onSuccess: () => void }).onSuccess();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(hooks.updateMutate).not.toHaveBeenCalled();
  });

  it('dispatches the UPDATE mutation when editing an existing technique', async () => {
    const user = userEvent.setup();
    const technique: Technique = {
      id: 'tech-1',
      classificationsByRoot: {
        technique_type: [TYPE_KIHON],
        sotai_category: [],
        attack_type: [],
      },
      isKihon: false,
      isActive: true,
      sortOrder: 0,
      nameJa: '',
      nameRomaji: 'Tsuki',
      nameSv: '',
      nameEn: '',
      nameFi: '',
      descriptionSv: '',
      descriptionEn: '',
      descriptionFi: '',
      minRankId: null,
      createdByOrganisationId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as Technique;

    const { onSaved } = renderForm(technique);
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(hooks.updateMutate).toHaveBeenCalledTimes(1);
    const [{ id, input }, opts] = hooks.updateMutate.mock.calls[0]! as [
      { id: string; input: unknown },
      { onSuccess: () => void },
    ];
    expect(id).toBe('tech-1');
    expect(input).toMatchObject({
      nameRomaji: 'Tsuki',
      classificationIds: ['type-1'],
    });
    opts.onSuccess();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(hooks.createMutate).not.toHaveBeenCalled();
  });
});
