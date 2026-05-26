/**
 * Map a belt rank to its visual representation. The rule table is sourced
 * from the Taidopass codebase verbatim:
 *
 *  - KYU (level 0..8): KYU_COLORS = ['white','yellow','yellow','magenta',
 *    'magenta','green','green','brown','brown']; badge=true when level>0 and
 *    level is even.
 *  - DAN: always black; optional `overlayTopHalf` from SHOGO_COLORS = {
 *    renshi:'magenta', kyoshi:'green', hanshi:'brown' }.
 *  - MON (level 1..12): cycles in groups of 4. Color cycles every 4 levels
 *    (1-4 magenta, 5-8 green, 9-12 brown). Within each group of 4, pos =
 *    (level-1) % 4 selects the styling — see the table comment below.
 */

/**
 * Local mirrors of the BeltGraphic prop surface — kept here so this module
 * has no upward (shared/lib → shared/ui) dependency. `BeltGraphic` re-exports
 * these so consumers can rely on a single canonical shape.
 */
export type BeltColor = 'yellow' | 'magenta' | 'green' | 'brown' | 'black' | 'white';

export interface BeltVisuals {
  gradient: BeltColor;
  badge?: boolean;
  stripe?: BeltColor;
  midLine?: BeltColor;
  midLineGradient?: boolean;
  overlayTopHalf?: BeltColor;
}

const KYU_COLORS: BeltColor[] = [
  'white',
  'yellow',
  'yellow',
  'magenta',
  'magenta',
  'green',
  'green',
  'brown',
  'brown',
];

const SHOGO_COLORS: Record<string, BeltColor> = {
  renshi: 'magenta',
  kyoshi: 'green',
  hanshi: 'brown',
};

const MON_COLORS: BeltColor[] = [
  'magenta',
  'magenta',
  'magenta',
  'magenta',
  'green',
  'green',
  'green',
  'green',
  'brown',
  'brown',
  'brown',
  'brown',
];

export function getBeltVisuals(
  systemCode: string,
  level: number,
  shogoTitle?: string | null,
): BeltVisuals {
  if (systemCode === 'dan') return getDanVisuals(shogoTitle);
  if (systemCode === 'kyu') return getKyuVisuals(level);
  if (systemCode === 'mon') return getMonVisuals(level);
  return { gradient: 'white' };
}

function getKyuVisuals(level: number): BeltVisuals {
  const gradient = KYU_COLORS[level] ?? 'white';
  const badge = level > 0 && level % 2 === 0;
  return { gradient, badge };
}

function getDanVisuals(shogoTitle?: string | null): BeltVisuals {
  const result: BeltVisuals = { gradient: 'black' };
  if (shogoTitle) {
    const overlayTopHalf = SHOGO_COLORS[shogoTitle.toLowerCase()];
    if (overlayTopHalf) {
      result.overlayTopHalf = overlayTopHalf;
    }
  }
  return result;
}

/**
 * Within each group of 4 (pos = (level - 1) % 4):
 *   0: white base, colored mid-line (gradient), no stripe
 *   1: white base, colored mid-line (gradient), black stripe
 *   2: colored base, white mid-line (flat), no stripe
 *   3: colored base, white mid-line (flat), black stripe
 */
function getMonVisuals(level: number): BeltVisuals {
  const idx = Math.max(0, level - 1);
  const color = MON_COLORS[idx] ?? 'magenta';
  const pos = idx % 4;

  const isWhiteBase = pos <= 1;
  const hasStripe = pos === 1 || pos === 3;

  const result: BeltVisuals = {
    gradient: isWhiteBase ? 'white' : color,
    midLine: isWhiteBase ? color : 'white',
    midLineGradient: isWhiteBase,
  };

  if (hasStripe) {
    result.stripe = 'black';
  }

  return result;
}
