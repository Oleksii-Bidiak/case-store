// Typo- and transliteration-tolerant device-model matcher (TASK-2069/2070/1952).
//
// Runs on the client over the full active model list (≤ 200 rows, React Query
// cache) — no search index. Spec: the K1 mockup brief §1 «Search», with two
// upgrades: Damerau–Levenshtein (so «iphnoe» is ONE edit from «iphone») and a
// letter-by-letter Cyrillic→Latin fallback for words the dictionary misses.
//
//   «iphone 15 про»      → iPhone 15 Pro first
//   «galaxy s24 ультра»  → Galaxy S24 Ultra first
//   «айфон 13»           → iPhone 13 first (then 13 Pro, 13 mini, 13 Pro Max)

/** The fields the matcher reads — a device-model list item satisfies it. */
export interface MatchableDeviceModel {
  name: string;
  brandName?: string | null;
}

export interface DeviceModelMatch<T> {
  model: T;
  /** Higher is better; only meaningful relative to other matches of a query. */
  score: number;
  /** True when a fuzzy (typo) edit or a transliteration was needed. */
  corrected: boolean;
}

// Whole-word dictionary, applied after tokenising. An empty string drops the
// word (brand noise that every model in that family would match anyway).
const DICTIONARY: Readonly<Record<string, string>> = {
  айфон: "iphone",
  айфона: "iphone",
  айфоні: "iphone",
  айфону: "iphone",
  айфони: "iphone",
  іфон: "iphone",
  ифон: "iphone",
  iphon: "iphone",
  галаксі: "galaxy",
  галакси: "galaxy",
  гелексі: "galaxy",
  гелакси: "galaxy",
  самсунг: "galaxy",
  samsung: "galaxy",
  редмі: "redmi",
  редми: "redmi",
  сяомі: "xiaomi",
  сяоми: "xiaomi",
  ксіаомі: "xiaomi",
  ксиаоми: "xiaomi",
  ксяомі: "xiaomi",
  айпад: "ipad",
  айпед: "ipad",
  вотч: "watch",
  ватч: "watch",
  годинник: "watch",
  про: "pro",
  макс: "max",
  плюс: "plus",
  ультра: "ultra",
  нот: "note",
  ноут: "note",
  міні: "mini",
  мини: "mini",
  ейр: "air",
  еір: "air",
  мм: "mm",
  покоління: "gen",
  поколения: "gen",
  го: "th",
  серія: "series",
  серии: "series",
  apple: "",
  епл: "",
  эпл: "",
};

// Ukrainian + Russian letters → Latin, for words the dictionary does not know.
const TRANSLIT: Readonly<Record<string, string>> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ye",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  і: "i",
  ї: "yi",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ъ: "",
  ы: "y",
  э: "e",
  ю: "yu",
  я: "ya",
};

const LETTER = "a-zа-яіїєґёъыэ";
const CYRILLIC = /[а-яіїєґёъыэ]/;
const SPLIT_LETTER_DIGIT = new RegExp(`([${LETTER}])(\\d)`, "g");
const SPLIT_DIGIT_LETTER = new RegExp(`(\\d)([${LETTER}])`, "g");
const NON_TOKEN = new RegExp(`[^${LETTER}0-9]+`);

/** Lower-case, `+` → plus, split «s24» → «s 24», tokenise. No dictionary. */
export function tokenizeModelText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(SPLIT_LETTER_DIGIT, "$1 $2")
    .replace(SPLIT_DIGIT_LETTER, "$1 $2")
    .split(NON_TOKEN)
    .filter(Boolean);
}

function transliterate(word: string): string {
  let out = "";
  for (const ch of word) out += TRANSLIT[ch] ?? ch;
  return out;
}

/** One query token after dictionary / transliteration; `""` = dropped word. */
function normalizeToken(token: string): { token: string; translit: boolean } {
  const mapped = DICTIONARY[token];
  if (mapped !== undefined) return { token: mapped, translit: false };
  if (CYRILLIC.test(token))
    return { token: transliterate(token), translit: true };
  return { token, translit: false };
}

/**
 * Normalise a user query into Latin model tokens:
 * «Айфон 15 Про» → ["iphone", "15", "pro"].
 */
export function normalizeModelQuery(query: string): string[] {
  return tokenizeModelText(query)
    .map((t) => normalizeToken(t).token)
    .filter(Boolean);
}

/**
 * Optimal-string-alignment Damerau–Levenshtein distance: insertions,
 * deletions, substitutions and adjacent transpositions each cost 1.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2][j - 2] + 1);
      }
      d[i][j] = best;
    }
  }
  return d[m][n];
}

/** Typo budget by token length: none below 4 chars or for numbers. */
function maxEdits(token: string): number {
  if (/^\d+$/.test(token) || token.length < 4) return 0;
  return token.length >= 8 ? 2 : 1;
}

const EXACT = 3;
const PREFIX = 2;
const FUZZY = 1;

/** Best way a single query token hits the model; 0 = no hit. */
function matchToken(token: string, modelTokens: readonly string[]): number {
  if (modelTokens.includes(token)) return EXACT;
  if (modelTokens.some((mt) => mt.startsWith(token))) return PREFIX;
  const budget = maxEdits(token);
  if (
    budget > 0 &&
    modelTokens.some(
      (mt) => !/^\d+$/.test(mt) && damerauLevenshtein(token, mt) <= budget,
    )
  ) {
    return FUZZY;
  }
  return 0;
}

interface PreparedModel<T> {
  model: T;
  /** Name tokens — the length penalty counts only these. */
  nameTokens: string[];
  /** Shorter names win ties: «iPhone 15» over «iPhone 15 Plus». */
  nameLength: number;
  /** Name + brand tokens — what a query token may hit. */
  tokens: string[];
}

function prepare<T extends MatchableDeviceModel>(model: T): PreparedModel<T> {
  const nameTokens = tokenizeModelText(model.name);
  const brandTokens = model.brandName ? tokenizeModelText(model.brandName) : [];
  return {
    model,
    nameTokens,
    nameLength: model.name.length,
    tokens: [
      ...nameTokens,
      ...brandTokens.filter((t) => !nameTokens.includes(t)),
    ],
  };
}

interface QueryToken {
  token: string;
  translit: boolean;
}

function toQueryTokens(words: readonly string[]): QueryToken[] {
  return words
    .flatMap((w) => tokenizeModelText(w))
    .map(normalizeToken)
    .filter((t) => t.token !== "");
}

function scoreModel<T>(
  query: readonly QueryToken[],
  prepared: PreparedModel<T>,
): DeviceModelMatch<T> | null {
  let points = 0;
  let corrected = false;
  for (const q of query) {
    const hit = matchToken(q.token, prepared.tokens);
    if (hit === 0) return null;
    points += hit;
    if (hit === FUZZY || q.translit) corrected = true;
  }
  const extra = Math.max(0, prepared.nameTokens.length - query.length);
  return {
    model: prepared.model,
    score: points * 100 - extra * 10 - prepared.nameLength,
    corrected,
  };
}

function rank<T>(
  query: readonly QueryToken[],
  prepared: readonly PreparedModel<T>[],
): DeviceModelMatch<T>[] {
  if (query.length === 0) return [];
  const out: DeviceModelMatch<T>[] = [];
  for (const p of prepared) {
    const match = scoreModel(query, p);
    if (match) out.push(match);
  }
  // Array.prototype.sort is stable: equal scores keep the list (API) order.
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Rank the models that match `query`. Every query word must hit some model
 * word — exactly (+3), as a prefix while typing (+2), or within the typo
 * budget (+1). Fewer leftover model words and a shorter name rank higher, so
 * «iphone 15» puts iPhone 15 above iPhone 15 Pro Max.
 */
export function matchDeviceModels<T extends MatchableDeviceModel>(
  query: string,
  models: readonly T[],
  options: { limit?: number } = {},
): DeviceModelMatch<T>[] {
  const ranked = rank(toQueryTokens([query]), models.map(prepare));
  return options.limit === undefined ? ranked : ranked.slice(0, options.limit);
}

/** Words that tie a product word to the model: «чохол для iPhone 15». */
const LINKING_WORDS = new Set(["для", "на", "до", "під", "for"]);

/** A short line letter + model number written as one word: «s24», «A55+». */
const MODEL_CODE = /^[a-zа-яіїєґ]{1,2}\d{1,3}\+?$/i;

export interface DetectedDeviceModel<T> {
  match: DeviceModelMatch<T>;
  /** The words of the query that named the model, as typed. */
  modelText: string;
  /** Everything else, as typed, joined by single spaces («чохол»). */
  rest: string;
}

/**
 * A window of words can name a model only if it carries an anchor: a hit on
 * the model's first word (iphone / galaxy / redmi / ipad / apple-watch line)
 * or a letters+digits code like «s24» / «a55». Stops «чохол pro» or a bare
 * «15» from being read as a device.
 */
function hasAnchor<T>(
  windowWords: readonly string[],
  query: readonly QueryToken[],
  prepared: PreparedModel<T>,
): boolean {
  if (windowWords.some((w) => MODEL_CODE.test(w))) return true;
  const anchors = [prepared.nameTokens[0], "watch"].filter(
    (a) => a && prepared.nameTokens.includes(a),
  );
  return query.some(
    (q) => q.token.length >= 3 && matchToken(q.token, anchors) >= FUZZY,
  );
}

/**
 * Find a device model inside a free-text query and split it off:
 * «чохол для айфон 15 про» → iPhone 15 Pro, rest «чохол».
 * The longest contiguous run of words that names a model wins (ties → best
 * score). A linking word right before the model («для», «на») is dropped from
 * the rest. Returns `null` when no model is named.
 */
export function detectDeviceModelInQuery<T extends MatchableDeviceModel>(
  query: string,
  models: readonly T[],
): DetectedDeviceModel<T> | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || models.length === 0) return null;
  const prepared = models.map(prepare);
  const byModel = new Map(prepared.map((p) => [p.model, p]));

  let best: { start: number; end: number; match: DeviceModelMatch<T> } | null =
    null;
  for (let start = 0; start < words.length; start += 1) {
    for (let end = words.length; end > start; end -= 1) {
      // A longer window than the best found so far is the only way to win
      // on length; equal length competes on score.
      if (best && end - start < best.end - best.start) break;
      const windowWords = words.slice(start, end);
      const tokens = toQueryTokens(windowWords);
      const top = rank(tokens, prepared).find((m) => {
        const p = byModel.get(m.model);
        return p !== undefined && hasAnchor(windowWords, tokens, p);
      });
      if (!top) continue;
      const longer = !best || end - start > best.end - best.start;
      if (longer || (best && top.score > best.match.score)) {
        best = { start, end, match: top };
      }
    }
  }
  if (!best) return null;

  const before = words.slice(0, best.start);
  if (
    before.length > 0 &&
    LINKING_WORDS.has(before[before.length - 1].toLowerCase())
  ) {
    before.pop();
  }
  return {
    match: best.match,
    modelText: words.slice(best.start, best.end).join(" "),
    rest: [...before, ...words.slice(best.end)].join(" "),
  };
}
