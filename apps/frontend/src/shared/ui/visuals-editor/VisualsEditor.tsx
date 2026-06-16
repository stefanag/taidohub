import {
  BELT_COLORS,
  type BeltColor,
  type BeltVisuals,
} from '@repo/contracts/ranks';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button, FormField, Label } from '@/shared/ui';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select.js';

const NONE = '__none__';

/**
 * Named visual presets surfaced in the editor's preset dropdown. The
 * "use-standard" button (when present) is handled by the consumer via the
 * `onApplyStandard` prop because the standard for a belt rank depends on
 * the form's currently-picked system + level.
 */
export const VISUAL_PRESETS: Array<{
  key: string;
  labelKey: string;
  value: BeltVisuals;
}> = [
  {
    key: 'plainDan',
    labelKey: 'admin.beltCatalog.visuals.presets.plainDan',
    value: { gradient: 'black' },
  },
  {
    key: 'shogoRenshi',
    labelKey: 'admin.beltCatalog.visuals.presets.shogoRenshi',
    value: { gradient: 'black', overlayTopHalf: 'magenta' },
  },
  {
    key: 'shogoKyoshi',
    labelKey: 'admin.beltCatalog.visuals.presets.shogoKyoshi',
    value: { gradient: 'black', overlayTopHalf: 'green' },
  },
  {
    key: 'shogoHanshi',
    labelKey: 'admin.beltCatalog.visuals.presets.shogoHanshi',
    value: { gradient: 'black', overlayTopHalf: 'brown' },
  },
  {
    key: 'monWhiteBase',
    labelKey: 'admin.beltCatalog.visuals.presets.monWhiteBase',
    value: { gradient: 'white', midLine: 'magenta', midLineGradient: true, stripe: 'black' },
  },
  {
    key: 'monColoredBase',
    labelKey: 'admin.beltCatalog.visuals.presets.monColoredBase',
    value: { gradient: 'magenta', midLine: 'white', stripe: 'black' },
  },
];

export interface VisualsEditorProps {
  value: BeltVisuals;
  onChange: (next: BeltVisuals) => void;
  /**
   * Optional handler for the "Use standard" button. Belt-rank forms supply
   * this so the button can compute defaults from the rank's system + level.
   * When omitted (e.g. shogo titles), the button is hidden.
   */
  onApplyStandard?: () => void;
  /** Disable the "Use standard" button (e.g. while system or level is empty). */
  applyStandardDisabled?: boolean;
}

/**
 * Per-field editor for `BeltVisuals`. Used inside `BeltRankForm` and
 * `ShogoTitleForm`. The consumer holds the form state and renders its own
 * `<BeltGraphic>` preview so it can pair the editor with any layout it
 * needs (e.g. alongside a color-swatch + checkbox in BeltRankForm).
 */
export function VisualsEditor({
  value,
  onChange,
  onApplyStandard,
  applyStandardDisabled,
}: VisualsEditorProps): React.ReactElement {
  const { t } = useTranslation();

  function applyPreset(presetKey: string): void {
    const preset = VISUAL_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    onChange(preset.value);
  }

  function setField<K extends keyof BeltVisuals>(key: K, next: BeltVisuals[K] | undefined): void {
    const updated = { ...value };
    if (next === undefined) {
      delete updated[key];
    } else {
      updated[key] = next;
    }
    onChange(updated);
  }

  return (
    <fieldset className="rounded border border-outline-variant p-3 space-y-3">
      <legend className="px-1 text-xs uppercase text-on-surface-variant">
        {t('admin.beltCatalog.visuals.title')}
      </legend>

      <div className="flex flex-wrap items-end gap-2">
        {onApplyStandard ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onApplyStandard}
            disabled={applyStandardDisabled}
            title={t('admin.beltCatalog.visuals.useStandardHint')}
          >
            {t('admin.beltCatalog.visuals.useStandard')}
          </Button>
        ) : null}
        <div className="min-w-[12rem]">
          <Label htmlFor="ve-preset" className="text-xs">
            {t('admin.beltCatalog.visuals.presetLabel')}
          </Label>
          <Select onValueChange={applyPreset}>
            <SelectTrigger id="ve-preset">
              <SelectValue placeholder={t('admin.beltCatalog.visuals.presetPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {VISUAL_PRESETS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {t(p.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField>
          <Label htmlFor="ve-gradient">{t('admin.beltCatalog.visuals.gradient')}</Label>
          <Select
            value={value.gradient}
            onValueChange={(v) => setField('gradient', v as BeltColor)}
          >
            <SelectTrigger id="ve-gradient"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BELT_COLORS.map((c) => (
                <SelectItem key={c} value={c}>{t(`admin.beltCatalog.visuals.colors.${c}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField>
          <Label htmlFor="ve-stripe">{t('admin.beltCatalog.visuals.stripe')}</Label>
          <Select
            value={value.stripe ?? NONE}
            onValueChange={(v) => setField('stripe', v === NONE ? undefined : (v as BeltColor))}
          >
            <SelectTrigger id="ve-stripe"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('admin.beltCatalog.visuals.none')}</SelectItem>
              {BELT_COLORS.map((c) => (
                <SelectItem key={c} value={c}>{t(`admin.beltCatalog.visuals.colors.${c}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField>
          <Label htmlFor="ve-midline">{t('admin.beltCatalog.visuals.midLine')}</Label>
          <Select
            value={value.midLine ?? NONE}
            onValueChange={(v) => {
              if (v === NONE) {
                // Clear midLine + midLineGradient together.
                const next = { ...value };
                delete next.midLine;
                delete next.midLineGradient;
                onChange(next);
              } else {
                setField('midLine', v as BeltColor);
              }
            }}
          >
            <SelectTrigger id="ve-midline"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('admin.beltCatalog.visuals.none')}</SelectItem>
              {BELT_COLORS.map((c) => (
                <SelectItem key={c} value={c}>{t(`admin.beltCatalog.visuals.colors.${c}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField>
          <Label htmlFor="ve-overlay">{t('admin.beltCatalog.visuals.overlayTopHalf')}</Label>
          <Select
            value={value.overlayTopHalf ?? NONE}
            onValueChange={(v) => setField('overlayTopHalf', v === NONE ? undefined : (v as BeltColor))}
          >
            <SelectTrigger id="ve-overlay"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('admin.beltCatalog.visuals.none')}</SelectItem>
              {BELT_COLORS.map((c) => (
                <SelectItem key={c} value={c}>{t(`admin.beltCatalog.visuals.colors.${c}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!value.badge}
            onChange={(e) => setField('badge', e.target.checked ? true : undefined)}
          />
          {t('admin.beltCatalog.visuals.badge')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!value.midLineGradient}
            disabled={!value.midLine}
            onChange={(e) => setField('midLineGradient', e.target.checked ? true : undefined)}
          />
          {t('admin.beltCatalog.visuals.midLineGradient')}
        </label>
      </div>
    </fieldset>
  );
}
