/**
 * Terminology self-test from the technique and pattern catalogue: the
 * Japanese name (romaji, with kanji when recorded) against the name in the
 * reader's language. Pure functions; randomness is injected for tests.
 */

export interface CatalogueEntry {
  id: string;
  nameJa: string | null;
  nameRomaji: string;
  nameSv: string;
  nameEn: string;
  nameFi: string;
}

export interface Term {
  id: string;
  kind: 'technique' | 'pattern';
  japanese: string;
  translation: string;
}

export type Direction = 'ja-to-local' | 'local-to-ja';

export interface Question {
  term: Term;
  prompt: string;
  options: string[];
  answer: string;
}

export type Random = () => number;

function localName(entry: CatalogueEntry, language: string): string {
  const lang = language.slice(0, 2);
  return (lang === 'sv' ? entry.nameSv : lang === 'fi' ? entry.nameFi : entry.nameEn).trim();
}

/** Entries with a translation that differs from the romaji; others teach nothing. */
export function buildTerms(
  entries: { techniques: CatalogueEntry[]; patterns: CatalogueEntry[] },
  language: string,
): Term[] {
  const toTerms = (list: CatalogueEntry[], kind: Term['kind']) =>
    list.flatMap((e) => {
      const translation = localName(e, language);
      if (!translation || translation.toLowerCase() === e.nameRomaji.trim().toLowerCase())
        return [];
      const japanese = e.nameJa ? `${e.nameRomaji} (${e.nameJa})` : e.nameRomaji;
      return [{ id: e.id, kind, japanese, translation }];
    });
  return [...toTerms(entries.techniques, 'technique'), ...toTerms(entries.patterns, 'pattern')];
}

export function shuffle<T>(items: readonly T[], random: Random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Up to `count` questions, each with the right answer and up to three wrong
 * ones drawn from other terms of the same kind (techniques against
 * techniques), topped up from the other kind when there are too few.
 */
export function makeQuestions(
  terms: readonly Term[],
  direction: Direction,
  count: number,
  random: Random = Math.random,
): Question[] {
  const side = (t: Term) => (direction === 'ja-to-local' ? t.translation : t.japanese);
  const promptOf = (t: Term) => (direction === 'ja-to-local' ? t.japanese : t.translation);
  return shuffle(terms, random)
    .slice(0, count)
    .map((term) => {
      const answer = side(term);
      const candidates = [
        ...shuffle(
          terms.filter((t) => t.kind === term.kind),
          random,
        ),
        ...shuffle(
          terms.filter((t) => t.kind !== term.kind),
          random,
        ),
      ];
      const wrong: string[] = [];
      for (const c of candidates) {
        const value = side(c);
        if (value !== answer && !wrong.includes(value)) wrong.push(value);
        if (wrong.length === 3) break;
      }
      return { term, prompt: promptOf(term), options: shuffle([answer, ...wrong], random), answer };
    });
}
