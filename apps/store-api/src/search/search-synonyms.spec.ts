import { UA_EN_SYNONYMS, extractUaSearchTerms } from './search-synonyms';

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

  it('lists EN plural category tokens explicitly (exact-word matching)', () => {
    expect(UA_EN_SYNONYMS['cases']).toContain('чохол');
    expect(UA_EN_SYNONYMS['chargers']).toContain('зарядка');
    expect(UA_EN_SYNONYMS['cables']).toContain('кабель');
  });
});

describe('extractUaSearchTerms', () => {
  it('injects the Cyrillic equivalents of name + category tokens', () => {
    expect(extractUaSearchTerms('iPhone 15 Case Cases')).toEqual(['айфон', 'чохол', 'чохли']);
  });

  it('returns only Cyrillic terms — Latin tokens are already in the document', () => {
    for (const term of extractUaSearchTerms('Clear MagSafe Case for iPhone 15 Pro Cases')) {
      expect(term).toMatch(/\p{Script=Cyrillic}/u);
    }
  });

  it('tokenizes across punctuation and hyphens', () => {
    expect(extractUaSearchTerms('USB-C to USB-C Cable')).toEqual(['кабель', 'кабелі']);
  });

  it('deduplicates terms shared by several tokens', () => {
    const terms = extractUaSearchTerms('Case case Cases');
    expect(terms.filter((t) => t === 'чохол')).toHaveLength(1);
  });

  it('returns an empty array when no token is in the dictionary', () => {
    expect(extractUaSearchTerms('Universal Dashboard Mount')).toEqual([]);
  });
});
