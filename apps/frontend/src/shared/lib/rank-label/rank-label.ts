/**
 * Format a belt rank for display: `"{romaji} — {localised}"`, falling back to
 * `"{romaji}"` when the localised name is empty. Ported verbatim from the
 * Taidopass `lib/rankLabel.ts` module; the narrowing behaviour (BCP-47
 * `en-US` → `en`, unknown → `en`) is preserved.
 */

export type Lang = 'en' | 'sv' | 'fi';

export interface RankLabelInput {
  nameRomaji: string;
  nameEn: string;
  nameSv: string;
  nameFi: string;
}

function narrowLang(raw: string): Lang {
  if (raw === 'en' || raw === 'sv' || raw === 'fi') return raw;
  const base = raw.split('-')[0];
  if (base === 'en' || base === 'sv' || base === 'fi') return base;
  return 'en';
}

export function rankLabel(rank: RankLabelInput, rawLang: string): string {
  const lang = narrowLang(rawLang);
  const localised =
    lang === 'en' ? rank.nameEn : lang === 'fi' ? rank.nameFi : rank.nameSv;
  return localised ? `${rank.nameRomaji} — ${localised}` : rank.nameRomaji;
}
