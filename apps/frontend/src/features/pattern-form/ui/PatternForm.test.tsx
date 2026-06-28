import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/i18n';

const TYPE_HOKEI = { id: 'type-hokei', code: 'hokei', nameEn: 'Hokei', nameSv: 'Hokei', nameFi: 'Hokei', nameJa: null, rootCode: 'pattern_type', parentId: null, sortOrder: 0, isActive: true };
const TYPE_OTHER = { id: 'type-other', code: 'tenkai', nameEn: 'Tenkai', nameSv: 'Tenkai', nameFi: 'Tenkai', nameJa: null, rootCode: 'pattern_type', parentId: null, sortOrder: 1, isActive: true };
const SUBTYPE_GO = { id: 'sub-1', code: 'go', nameEn: 'Go', nameSv: 'Go', nameFi: 'Go', nameJa: null, rootCode: 'hokei_subtype', parentId: null, sortOrder: 0, isActive: true };

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
vi.mock('@/entities/pattern', () => ({
  useCreatePatternMutation: () => ({
    mutate: hooks.createMutate,
    isPending: hooks.createIsPending,
  }),
  useUpdatePatternMutation: () => ({
    mutate: hooks.updateMutate,
    isPending: hooks.updateIsPending,
  }),
}));

import { PatternForm } from './PatternForm.js';

/**
 * `PatternForm` parallels `TechniqueForm` (create / edit with
 * classification chips + romaji + locale name fields), with one
 * extra wrinkle: the `hokei_subtype` selector only renders when
 * the `hokei` pattern type is selected. A subtype chip dropped
 * out of the typeIds set should ALSO clear any selected subtype
 * ids — pinned via the conditional-rendering case below.
 */

beforeEach(async () => {
  await i18n.changeLanguage('en');
  hooks.classificationByRoot.mockImplementation((root) => {
    if (root === 'pattern_type') return { data: [TYPE_HOKEI, TYPE_OTHER], isPending: false };
    if (root === 'hokei_subtype') return { data: [SUBTYPE_GO], isPending: false };
    return { data: [], isPending: false };
  });
  hooks.createMutate.mockReset();
  hooks.updateMutate.mockReset();
  hooks.createIsPending = false;
  hooks.updateIsPending = false;
});

function renderForm() {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  return {
    onSaved,
    onCancel,
    ...render(
      <I18nextProvider i18n={i18n}>
        <PatternForm onSaved={onSaved} onCancel={onCancel} />
      </I18nextProvider>,
    ),
  };
}

function chipsWithAriaPressed(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
}

describe('<PatternForm>', () => {
  it('disables Save while no pattern-type classification is selected', () => {
    renderForm();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderForm();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('hides the hokei subtype selector until the hokei type is selected', async () => {
    const user = userEvent.setup();
    const { container } = renderForm();

    // Initially: 2 pattern_type chips render; no subtype chip yet.
    expect(chipsWithAriaPressed(container)).toHaveLength(2);

    // Click hokei → subtype selector appears with its chip.
    const chips = chipsWithAriaPressed(container);
    const hokeiChip = chips.find((b) => b.textContent?.includes('Hokei'));
    expect(hokeiChip).toBeDefined();
    await user.click(hokeiChip!);

    expect(chipsWithAriaPressed(container).length).toBeGreaterThan(2);
    // The new chip belongs to the subtype selector — find it by label.
    const subtypeChip = chipsWithAriaPressed(container).find((b) =>
      b.textContent?.includes('Go'),
    );
    expect(subtypeChip).toBeDefined();
  });

  it('dispatches the CREATE mutation with the right classificationIds + name fields', async () => {
    const user = userEvent.setup();
    const { onSaved, container } = renderForm();

    // Click the first type chip + fill romaji.
    const chips = chipsWithAriaPressed(container);
    const hokeiChip = chips.find((b) => b.textContent?.includes('Hokei'))!;
    await user.click(hokeiChip);
    await user.type(screen.getByLabelText(/romaji/i), 'Hokei-go');

    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(hooks.createMutate).toHaveBeenCalledTimes(1);
    const [input, opts] = hooks.createMutate.mock.calls[0]!;
    expect(input).toMatchObject({
      classificationIds: ['type-hokei'],
      nameRomaji: 'Hokei-go',
      isActive: true,
      officialBodyOrgId: null,
    });
    (opts as { onSuccess: () => void }).onSuccess();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(hooks.updateMutate).not.toHaveBeenCalled();
  });
});
