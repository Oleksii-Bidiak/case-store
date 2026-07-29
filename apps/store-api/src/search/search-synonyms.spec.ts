import { UA_EN_SYNONYMS, extractSearchSynonymTerms } from './search-synonyms';

describe('UA_EN_SYNONYMS', () => {
  it('covers the QA-critical brand pair in both directions', () => {
    expect(UA_EN_SYNONYMS['айфон']).toContain('iphone');
    expect(UA_EN_SYNONYMS['iphone']).toContain('айфон');
  });

  it('is fully bidirectional — every sibling maps back to its term', () => {
    for (const [term, siblings] of Object.entries(UA_EN_SYNONYMS)) {
      for (const sibling of siblings) {
        expect(UA_EN_SYNONYMS[sibling]).toContain(term);
      }
    }
  });

  it('never maps a term to itself and has no duplicate siblings', () => {
    for (const [term, siblings] of Object.entries(UA_EN_SYNONYMS)) {
      expect(siblings).not.toContain(term);
      expect(new Set(siblings).size).toBe(siblings.length);
    }
  });

  it('contains only single lowercase words (Meili synonym expansion is per-word)', () => {
    for (const [term, siblings] of Object.entries(UA_EN_SYNONYMS)) {
      for (const word of [term, ...siblings]) {
        expect(word).toBe(word.toLowerCase());
        expect(word).not.toMatch(/\s/);
      }
    }
  });

  /**
   * An apostrophe splits a token, so «пам'ять» could never match as one word.
   * Guards the dictionary against a well-meaning future addition.
   */
  it('contains no term the tokenizer would split', () => {
    for (const [term, siblings] of Object.entries(UA_EN_SYNONYMS)) {
      for (const word of [term, ...siblings]) {
        expect(word.split(/[^\p{L}\p{N}]+/u)).toHaveLength(1);
      }
    }
  });

  it('lists plural category tokens explicitly in both scripts (exact-word matching)', () => {
    expect(UA_EN_SYNONYMS['cases']).toContain('чохол');
    expect(UA_EN_SYNONYMS['чохли']).toContain('case');
    expect(UA_EN_SYNONYMS['chargers']).toContain('зарядка');
    expect(UA_EN_SYNONYMS['cables']).toContain('кабель');
  });

  /** The vocabulary the Ukrainian catalogue introduced (TASK-366/367). */
  it('covers the categories added with the Ukrainian catalogue', () => {
    expect(UA_EN_SYNONYMS['павербанк']).toContain('powerbank');
    expect(UA_EN_SYNONYMS['колонка']).toContain('speaker');
    expect(UA_EN_SYNONYMS['тримач']).toContain('holder');
    expect(UA_EN_SYNONYMS['ремінець']).toContain('strap');
    expect(UA_EN_SYNONYMS['флешка']).toContain('flash');
    expect(UA_EN_SYNONYMS['перехідник']).toContain('adapter');
    expect(UA_EN_SYNONYMS['вкладиші']).toContain('earbuds');
  });

  /** `band` is in two groups; the map must union both sets of siblings. */
  it('unions siblings for a term that appears in several groups', () => {
    expect(UA_EN_SYNONYMS['band']).toContain('ремінець');
    expect(UA_EN_SYNONYMS['band']).toContain('браслет');
  });
});

describe('extractSearchSynonymTerms', () => {
  /**
   * The catalogue is Ukrainian (TASK-366), so this is the direction that matters
   * now: a shopper typing the English word must still find «Чохол …».
   */
  it('injects the Latin equivalents of a Ukrainian product name', () => {
    const terms = extractSearchSynonymTerms('Чохол Spigen Liquid Air для iPhone 15 Чохли');
    expect(terms).toContain('case');
    expect(terms).toContain('cases');
  });

  it('still injects the Cyrillic equivalents of a Latin-named product', () => {
    expect(extractSearchSynonymTerms('Навушники Apple AirPods Pro 2')).toContain('ейрподс');
  });

  it('omits equivalents the text already contains (they would only dilute ranking)', () => {
    const terms = extractSearchSynonymTerms('Чохол case для iPhone айфон');
    expect(terms).not.toContain('case');
    expect(terms).not.toContain('айфон');
    // «чохли» / «cases» are absent from the text, so they are still injected.
    expect(terms).toContain('чохли');
  });

  it('tokenizes across punctuation and hyphens', () => {
    expect(extractSearchSynonymTerms('Кабель USB-C — USB-C')).toContain('cable');
  });

  it('deduplicates terms shared by several tokens', () => {
    const terms = extractSearchSynonymTerms('Чохол чохол Чохли');
    expect(terms.filter((t) => t === 'case')).toHaveLength(1);
  });

  it('returns an empty array when no token is in the dictionary', () => {
    expect(extractSearchSynonymTerms('Універсальний аксесуар')).toEqual([]);
  });
});
