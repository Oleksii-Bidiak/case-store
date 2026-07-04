/**
 * UA↔EN transliteration dictionary for the products index (TASK-200).
 *
 * Catalog data (names, categories) is English while Ukrainian shoppers type
 * Cyrillic («айфон», «чохол»). Meilisearch synonyms bridge the scripts, BUT
 * per the Meilisearch docs synonym expansion applies to the *exact* normalized
 * query word — it is NOT typo tolerant. A misspelled UA query («афйон») would
 * never reach the «айфон» synonym entry, so settings-level synonyms alone
 * cannot fix the reported bug. The dictionary is therefore used twice:
 *
 * 1. **Query side** — {@link UA_EN_SYNONYMS} is pushed into the index settings
 *    so a correctly-typed UA query («айфон») expands to the EN tokens.
 * 2. **Document side** — {@link extractUaSearchTerms} injects the Cyrillic
 *    equivalents of a product's name/category tokens into an indexed
 *    `searchTerms` attribute. The UA words then physically exist in the index,
 *    so ordinary typo tolerance handles misspellings («афйон» → «айфон» is one
 *    transposition = one typo).
 *
 * Every term in a group is a synonym of every other term in the same group
 * (bidirectional). Terms must be single lowercase words — Meilisearch
 * normalizes synonyms to lowercase at indexing time anyway, and single tokens
 * keep the document-side injection trivial. EN plurals are listed explicitly
 * because synonym matching is exact per word ("cases" does not match "case").
 *
 * Vocabulary covers the brands and category nouns present in the seed catalog
 * (prisma/seed.ts) plus common Apple-ecosystem terms. Extend the groups when
 * new brands/categories are added.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // Brands / devices
  ['iphone', 'айфон'],
  ['ipad', 'айпад'],
  ['macbook', 'макбук'],
  ['airpods', 'ейрподс', 'аірподс'],
  ['samsung', 'самсунг'],
  ['galaxy', 'галаксі'],
  ['xiaomi', 'ксяомі', 'сяомі'],
  ['magsafe', 'магсейф'],
  ['lightning', 'лайтнінг'],
  // Categories / product nouns
  ['case', 'cases', 'чохол', 'чохли'],
  ['charger', 'chargers', 'charging', 'зарядка', 'зарядне', 'зарядний'],
  ['cable', 'cables', 'кабель', 'кабелі'],
  ['glass', 'скло'],
  ['screen', 'екран'],
  ['protector', 'protectors', 'захисне', 'захисний'],
  ['holder', 'тримач'],
  ['headphones', 'навушники'],
  ['watch', 'годинник'],
  ['wireless', 'бездротовий', 'бездротова'],
];

/** Map every group term to all of its siblings (bidirectional synonyms). */
function buildSynonymMap(groups: readonly (readonly string[])[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const group of groups) {
    for (const term of group) {
      const siblings = group.filter((t) => t !== term);
      map[term] = [...new Set([...(map[term] ?? []), ...siblings])];
    }
  }
  return map;
}

/**
 * Bidirectional UA↔EN synonym map in the shape Meilisearch expects for the
 * `synonyms` index setting: `{ term: [equivalent, ...] }`.
 */
export const UA_EN_SYNONYMS: Record<string, string[]> = buildSynonymMap(SYNONYM_GROUPS);

const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * Derive the Cyrillic search terms to inject into a product document.
 *
 * Tokenizes the given text (product name + category name), looks each token up
 * in {@link UA_EN_SYNONYMS} and returns the deduplicated *Cyrillic* siblings —
 * the Latin ones are already present in the document itself.
 */
export function extractUaSearchTerms(text: string): string[] {
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const terms = new Set<string>();
  for (const token of tokens) {
    for (const sibling of UA_EN_SYNONYMS[token] ?? []) {
      if (CYRILLIC.test(sibling)) terms.add(sibling);
    }
  }
  return [...terms];
}
