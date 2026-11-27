import { describe, expect, it } from 'vitest';

import { buildTerms, makeQuestions, type CatalogueEntry } from './quiz.js';

const entry = (
  id: string,
  romaji: string,
  sv: string,
  ja: string | null = null,
): CatalogueEntry => ({
  id,
  nameJa: ja,
  nameRomaji: romaji,
  nameSv: sv,
  nameEn: '',
  nameFi: '',
});

const techniques = [
  entry('t1', 'Tsuki', 'Slag', '突き'),
  entry('t2', 'Geri', 'Spark'),
  entry('t3', 'Uke', 'Blockering'),
  entry('t4', 'Sen', 'Sen'),
  entry('t5', 'Hen', ''),
];
const patterns = [entry('p1', 'Sei no hokei', 'Grundformen')];

// Deterministic "random" so the order is reproducible.
const seq = () => {
  let i = 0;
  return () => (((i++ * 0.37) % 1) + 1) % 1;
};

describe('self-test quiz', () => {
  it('keeps only terms with a translation different from the romaji', () => {
    const terms = buildTerms({ techniques, patterns }, 'sv');
    expect(terms.map((t) => t.id)).toEqual(['t1', 't2', 't3', 'p1']);
    expect(terms[0]!.japanese).toBe('Tsuki (突き)');
    expect(buildTerms({ techniques, patterns }, 'en')).toEqual([]);
  });

  it('builds questions with one right answer among distinct options', () => {
    const terms = buildTerms({ techniques, patterns }, 'sv');
    const qs = makeQuestions(terms, 'ja-to-local', 10, seq());
    expect(qs).toHaveLength(4);
    for (const q of qs) {
      expect(q.options).toContain(q.answer);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.options.length).toBe(4);
      expect(q.answer).toBe(q.term.translation);
    }
  });

  it('asks the other way round', () => {
    const terms = buildTerms({ techniques, patterns }, 'sv');
    const [q] = makeQuestions(terms, 'local-to-ja', 1, seq());
    expect(q!.prompt).toBe(q!.term.translation);
    expect(q!.answer).toBe(q!.term.japanese);
  });
});
