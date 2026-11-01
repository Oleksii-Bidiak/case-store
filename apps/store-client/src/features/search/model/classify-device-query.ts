// Device-model recognition in a search query (TASK-2069, Д3-2).
//
// ONE classifier for the header suggestions popup and the /search model row:
// strip what is not the model (linking words, «смартфон» / «256 гб», an
// accessory word), then let the shared typo-tolerant matcher
// (`entities/device` — the same one the device picker runs) find the model.
//
//   «айфон 15 про»                   → iPhone 15 Pro, corrected
//   «смартфон iphone 15 pro 256 гб»  → iPhone 15 Pro, device intent
//   «чохол iphone 15 pro»            → iPhone 15 Pro, product word «cases»
//   «чохол»                          → null

import {
  detectDeviceModelInQuery,
  matchDeviceModels,
  type MatchableDeviceModel,
} from "@/entities/device";

/** Accessory words a query may carry; the value is the category slug. */
export type ProductWordKey =
  | "cases"
  | "screen-protectors"
  | "chargers"
  | "cables"
  | "power-banks"
  | "watch-bands";

/** Prefixes, so every case form hits: «чохол», «чохли», «чохлів». */
const PRODUCT_WORDS: readonly {
  key: ProductWordKey;
  prefixes: readonly string[];
}[] = [
  { key: "cases", prefixes: ["чохол", "чохл", "case", "бампер"] },
  {
    key: "screen-protectors",
    prefixes: ["скло", "плівк", "glass", "захисн"],
  },
  { key: "power-banks", prefixes: ["павербанк", "powerbank", "power"] },
  { key: "chargers", prefixes: ["заряд", "charger"] },
  { key: "cables", prefixes: ["кабел", "cable"] },
  { key: "watch-bands", prefixes: ["ремін", "band", "strap"] },
];

/** Words that say "the device itself": «смартфон …», «купити …», «256 гб». */
const DEVICE_INTENT_PREFIXES: readonly string[] = [
  "смартфон",
  "телефон",
  "купити",
  "новий",
  "нова",
  "нові",
  "phone",
  "гб",
  "gb",
  "тб",
  "tb",
];

/**
 * A storage size: «256», «256гб», «1тб», «8/256». A bare «1» / «2» is NOT a
 * size (Watch SE 2, Galaxy Watch 4…) — it needs the unit glued on.
 */
const STORAGE_SIZE =
  /^(?:(?:64|128|256|512|1024)(?:гб|gb|тб|tb)?|[12](?:тб|tb)|\d{1,2}\/\d{2,4}(?:гб|gb)?)$/;

/** Linking words dropped before matching («чохол для iphone 15»). */
const STOP_WORDS = new Set(["для", "for", "на", "до", "під"]);

const CYRILLIC = /[а-яіїєґёъыэ]/i;

/** Leading/trailing punctuation off a word, `+` kept («S24+»). */
function cleanWord(word: string): string {
  return word.replace(/^[^\p{L}\p{N}+]+|[^\p{L}\p{N}+]+$/gu, "");
}

export interface ParsedDeviceQuery {
  /** The words left for the model matcher, as typed (lowercased). */
  modelText: string;
  /** The first accessory word of the query, if any. */
  productWord: ProductWordKey | null;
  /**
   * The shopper asks for the device itself (a device word or a storage size).
   * Always `false` when an accessory word is present — the accessory wins.
   */
  deviceIntent: boolean;
}

function productWordOf(word: string): ProductWordKey | null {
  for (const { key, prefixes } of PRODUCT_WORDS) {
    if (prefixes.some((p) => word.startsWith(p))) return key;
  }
  return null;
}

function isDeviceIntentWord(word: string): boolean {
  return (
    STORAGE_SIZE.test(word) ||
    DEVICE_INTENT_PREFIXES.some((p) => word.startsWith(p))
  );
}

/**
 * Split a query into the model words, the accessory word and the device
 * intent (Search mockup, Д3-2 §1.1). Pure — no model list needed.
 */
export function parseDeviceQuery(query: string): ParsedDeviceQuery {
  const words = query.toLowerCase().split(/\s+/).map(cleanWord).filter(Boolean);

  let productWord: ProductWordKey | null = null;
  let deviceIntent = false;
  const modelWords: string[] = [];
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    const product = productWordOf(word);
    if (product) {
      productWord ??= product;
      continue;
    }
    if (isDeviceIntentWord(word)) {
      deviceIntent = true;
      continue;
    }
    modelWords.push(word);
  }
  return {
    modelText: modelWords.join(" "),
    productWord,
    deviceIntent: deviceIntent && productWord === null,
  };
}

export interface DeviceQueryMatch<T> extends ParsedDeviceQuery {
  /** The recognised model — the best match of the query's model words. */
  model: T;
  /**
   * The query had to be read with a fix — Cyrillic / transliteration or a
   * typo — so the UI says «Схоже, ви шукаєте модель», not «Модель».
   */
  corrected: boolean;
  /** Up to three other models the same words match («iPhone 15 Pro Max»). */
  alternatives: T[];
}

/** How many «Також:» / «Або можливо:» models to offer. */
export const MAX_MODEL_ALTERNATIVES = 3;

/**
 * Recognise a device model in a search query. `null` when the query names
 * no model (an accessory alone, a brand alone, nothing recognisable).
 */
export function classifyDeviceQuery<T extends MatchableDeviceModel>(
  query: string,
  models: readonly T[],
): DeviceQueryMatch<T> | null {
  if (models.length === 0) return null;
  const parsed = parseDeviceQuery(query);
  if (!parsed.modelText) return null;

  const detected = detectDeviceModelInQuery(parsed.modelText, models);
  if (!detected) return null;
  const model = detected.match.model;

  const alternatives = matchDeviceModels(detected.modelText, models)
    .map((m) => m.model)
    .filter((m) => m !== model)
    .slice(0, MAX_MODEL_ALTERNATIVES);

  return {
    ...parsed,
    model,
    corrected: detected.match.corrected || CYRILLIC.test(detected.modelText),
    alternatives,
  };
}

/** Where the «Сам … у продажу» block goes relative to the model row. */
export type DeviceBlockPlacement = "before" | "after" | "hidden";

/**
 * The Д3-2 rules for the device block (owner, 2026-10-30):
 * - an accessory word → no block;
 * - the device is not sold (or not known yet) → no block;
 * - a device word or a storage size → the block FIRST, above the model row;
 * - a bare model → the block under the model row.
 *
 * `sold` is `undefined` while the lookup is still running.
 */
export function deviceBlockPlacement(
  match: Pick<ParsedDeviceQuery, "productWord" | "deviceIntent">,
  sold: boolean | undefined,
): DeviceBlockPlacement {
  if (match.productWord !== null || sold !== true) return "hidden";
  return match.deviceIntent ? "before" : "after";
}

/**
 * «Сам … зараз не продаємо — лише аксесуари» — only when the shopper asked
 * for the device itself (device word / storage) and we know it is not sold.
 * A bare model that is not sold shows no line: the shopper may well be after
 * accessories, and an unprompted "we don't sell it" reads as a dead end.
 */
export function showNotSoldLine(
  match: Pick<ParsedDeviceQuery, "productWord" | "deviceIntent">,
  sold: boolean | undefined,
): boolean {
  return match.productWord === null && match.deviceIntent && sold === false;
}
