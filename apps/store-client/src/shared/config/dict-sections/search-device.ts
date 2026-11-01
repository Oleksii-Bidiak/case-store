// `dict.searchDevice` — copy for K5 V-пошук (TASK-2069), SД3.
// Kept in its own module so the SД3 clusters can add copy in parallel without
// all of them editing dictionary.ts at once. Same rules as dictionary.ts:
// every user-facing string lives here, interpolated strings are functions.

import { pluralUk } from "../plural";

/** What a device of the recognised model is — picks the «сам …» wording. */
type DeviceKind = "phone" | "watch" | "tablet";

export const searchDeviceDict = {
  // ── The device action, shared by the header popup and the /search row ──
  action: {
    add: "Додати до моїх пристроїв",
    activate: "Показувати для нього",
    mine: "Ваш пристрій",
  },

  // ── Header suggestions popup: the model block (SearchSuggest mockup) ──
  suggest: {
    blockAria: (name: string) => `Модель ${name}`,
    kicker: "Модель",
    kickerCorrected: "Схоже, ви шукаєте модель",
    allFor: (name: string, n: number) =>
      `Все для ${name} · ${n} ${pluralUk(n, "товар", "товари", "товарів")}`,
    alsoLabel: "Також:",
  },

  // ── /search: the model row (Search mockup, Д3-2) ──
  row: {
    aria: "Знайдена модель",
    kickerActive: "Ваш активний пристрій",
    kickerSaved: "Збережено у ваших",
    kickerSavedLabel: (label: string) => `Збережено у ваших · ${label}`,
    kickerGuess: "Схоже, ви шукаєте модель",
    /** `count` arrives already digit-grouped («1 280»). */
    accessoriesFor: (short: string, count: string) =>
      `Аксесуари для ${short} · ${count}`,
    productFor: (title: string, short: string, count: string) =>
      `${title} для ${short} · ${count}`,
    categoriesAria: (name: string) => `Аксесуари для ${name} за категоріями`,
    notSold: (name: string) =>
      `Сам ${name} зараз не продаємо — лише аксесуари до нього.`,
    alternativesLabel: "Або можливо:",
  },

  /** Accessory words a query may carry → the category title in the row. */
  productWords: {
    cases: "Чохли",
    "screen-protectors": "Захисне скло",
    chargers: "Зарядки",
    cables: "Кабелі",
    "power-banks": "Павербанки",
    "watch-bands": "Ремінці",
  },

  // ── /search: the fix line under the h1 (Д3-2 §3.2) ──
  fix: {
    /** «Шукаємо як iPhone 15 Pro · шукати точно «…»». */
    lead: "Шукаємо як",
    /** With an accessory word: «чохли для iPhone 15 Pro». */
    productFor: (title: string, name: string) =>
      `${title.toLocaleLowerCase("uk")} для ${name}`,
    exact: (q: string) => `шукати точно «${q}»`,
  },

  // ── /search: nothing found — «never a dead end» (Д3-2 §3.8) ──
  empty: {
    heading: (q: string) => `За запитом «${q}» нічого немає`,
    body: "Перевірте написання або шукайте за моделлю пристрою — наприклад, «чохол iPhone 15».",
    popularLead: "Або оберіть популярну модель:",
    popularAria: "Популярні моделі",
  },

  // ── /search: «Сам … у продажу» — the device itself (owner, 2026-10-30) ──
  sale: {
    kickerFirst: "Сам пристрій",
    kickerAfter: {
      phone: "Шукаєте сам телефон?",
      watch: "Шукаєте сам годинник?",
      tablet: "Шукаєте сам планшет?",
    } satisfies Record<DeviceKind, string>,
    /** `price` arrives formatted with the currency («45 999 ₴»). */
    title: (name: string, price: string) => `${name} у продажу · від ${price}`,
    allOf: {
      phone: (brand: string) => `Усі смартфони ${brand}`.trim(),
      watch: (brand: string) => `Усі смарт-годинники ${brand}`.trim(),
      tablet: (brand: string) => `Усі планшети ${brand}`.trim(),
    } satisfies Record<DeviceKind, (brand: string) => string>,
  },
} as const;
