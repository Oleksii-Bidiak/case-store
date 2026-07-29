/**
 * UA↔EN cross-script dictionary for the products index (TASK-200, TASK-367).
 *
 * Meilisearch synonym expansion applies to the *exact* normalized query word —
 * it is NOT typo tolerant. A misspelled query («афйон») never reaches the
 * «айфон» synonym entry, so settings-level synonyms alone cannot fix the
 * originally reported bug. The dictionary is therefore used twice:
 *
 * 1. **Query side** — {@link UA_EN_SYNONYMS} goes into the index settings, so a
 *    correctly-typed query expands to its equivalents in the other script.
 * 2. **Document side** — {@link extractSearchSynonymTerms} injects the missing
 *    equivalents of a product's own tokens into an indexed `searchTerms`
 *    attribute. Those words then physically exist in the index, so ordinary typo
 *    tolerance handles misspellings («афйон» → «айфон» is one transposition).
 *
 * **The catalogue became Ukrainian in TASK-366, and that reversed the injection.**
 * While product names were English, injecting only the *Cyrillic* siblings was
 * right — the Latin words were already in the document. Now the opposite holds: a
 * product called «Чохол Spigen Liquid Air для iPhone 15» already contains
 * «чохол», and what it lacks is `case` / `cases`, so a shopper typing the English
 * word found nothing. The function now injects whichever equivalents the text
 * does not already contain, in either direction.
 *
 * Every term in a group is a synonym of every other term in the same group
 * (bidirectional). Terms must be single lowercase words — Meilisearch normalizes
 * synonyms to lowercase anyway, and single tokens keep the document-side
 * injection trivial. Plurals are listed explicitly in both scripts because
 * synonym matching is exact per word: «чохли» does not match «чохол», and
 * `cases` does not match `case`.
 *
 * A term may appear in more than one group — the map unions its siblings, which
 * is how `band` is both a watch strap and a fitness bracelet.
 *
 * Words containing an apostrophe («пам'ять») are deliberately absent: the
 * tokenizer splits on it, so they could never match as a single token.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // ── Brands / devices ──
  ['iphone', 'айфон'],
  ['ipad', 'айпад'],
  ['macbook', 'макбук'],
  ['airpods', 'ейрподс', 'аірподс'],
  ['samsung', 'самсунг'],
  ['galaxy', 'галаксі'],
  ['xiaomi', 'ксяомі', 'сяомі'],
  ['redmi', 'редмі'],
  ['magsafe', 'магсейф'],
  ['lightning', 'лайтнінг'],
  ['anker', 'анкер'],
  ['baseus', 'басеус'],
  ['spigen', 'спіген'],
  ['belkin', 'белкін'],
  ['ugreen', 'югрін'],
  ['sandisk', 'сандіск'],
  ['nillkin', 'ніллкін'],

  // ── Смартфони ──
  ['smartphone', 'smartphones', 'phone', 'phones', 'смартфон', 'смартфони', 'телефон'],

  // ── Аудіо ──
  ['headphones', 'headphone', 'навушники'],
  ['earbuds', 'tws', 'вкладиші', 'вакуумні'],
  ['speaker', 'speakers', 'колонка', 'колонки'],

  // ── Годинники та браслети ──
  ['watch', 'watches', 'smartwatch', 'smartwatches', 'годинник', 'годинники'],
  ['band', 'bands', 'strap', 'straps', 'ремінець', 'ремінці'],
  // `band` is deliberately here as well as in the strap group above: «Фітнес-браслет
  // Xiaomi Smart Band 9» is found by «браслет», and «ремінець» is what a shopper
  // calls a watch band. The map unions both sets of siblings.
  ['bracelet', 'band', 'браслет', 'браслети', 'фітнес'],

  // ── Живлення ──
  ['powerbank', 'powerbanks', 'павербанк', 'павербанки', 'повербанк'],
  ['charger', 'chargers', 'charging', 'зарядка', 'зарядне', 'зарядний'],
  ['adapter', 'adapters', 'адаптер', 'перехідник', 'перехідники'],
  ['wireless', 'бездротовий', 'бездротова'],

  // ── Захист ──
  ['case', 'cases', 'чохол', 'чохли'],
  ['glass', 'скло'],
  ['film', 'films', 'плівка', 'плівки'],
  ['hydrogel', 'гідрогелева', 'гідрогель'],
  ['screen', 'екран'],
  ['protector', 'protectors', 'захисне', 'захисний'],

  // ── Кабелі, хаби, тримачі ──
  ['cable', 'cables', 'кабель', 'кабелі'],
  ['hub', 'hubs', 'хаб', 'хаби'],
  ['holder', 'holders', 'mount', 'тримач', 'тримачі', 'автотримач'],
  ['stand', 'stands', 'підставка', 'підставки'],
  ['popsocket', 'попсокет'],

  // ── Накопичувачі ──
  ['microsd', 'мікросд'],
  ['card', 'cards', 'карта', 'картка'],
  ['flash', 'flashdrive', 'флешка', 'флешки'],
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

/**
 * Derive the cross-script search terms to inject into a product document.
 *
 * Tokenizes the given text (product name + category + brand), looks each token up
 * in {@link UA_EN_SYNONYMS} and returns the deduplicated equivalents the text does
 * **not** already contain. Direction-agnostic on purpose: the catalogue is
 * Ukrainian, so most injections are now Latin, but an entry named «AirPods Pro 2»
 * still needs «ейрподс».
 *
 * Dropping siblings that are already present keeps `searchTerms` from restating
 * what the indexed `name` covers, which would only dilute relevance scoring.
 */
export function extractSearchSynonymTerms(text: string): string[] {
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const present = new Set(tokens);
  const terms = new Set<string>();
  for (const token of tokens) {
    for (const sibling of UA_EN_SYNONYMS[token] ?? []) {
      if (!present.has(sibling)) terms.add(sibling);
    }
  }
  return [...terms];
}
