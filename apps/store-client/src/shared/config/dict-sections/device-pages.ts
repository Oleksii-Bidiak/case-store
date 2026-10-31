// `dict.devicePages` — copy for K3 V-пристрої-сторінки (TASK-1954, 2076), SД3.
// Kept in its own module so the SД3 clusters can add copy in parallel without
// all of them editing dictionary.ts at once. Same rules as dictionary.ts:
// every user-facing string lives here, interpolated strings are functions.

import { pluralUk } from "../plural";

/**
 * «1 234» — a count with a no-break space between thousands. Spelled out
 * rather than `toLocaleString`, whose separator differs between ICU builds
 * (U+00A0 vs U+202F) — a server/client mismatch in a hydrated chip.
 */
const formatCount = (n: number) =>
  String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** «1 товар», «44 товари», «1 234 товарів». */
const productCount = (n: number) =>
  `${formatCount(n)} ${pluralUk(n, "товар", "товари", "товарів")}`;

export const devicePagesDict = {
  formatCount,
  productCount,

  // ── TASK-1954: «Все для <модель>» — the model hub `/devices/<модель>` ──
  hub: {
    crumbHome: "Головна",
    crumbDevices: "Пристрої",
    heading: (model: string) => `Все для ${model}`,

    // Kicker over the H1 — the device's place in «Мої пристрої».
    kickerActiveLabelled: (label: string) => `Ваш активний · ${label}`,
    kickerActive: (brand: string) => `${brand} · ваш активний пристрій`,
    kickerSaved: (brand: string, label?: string) =>
      `${brand} · збережено у ваших${label ? ` · ${label}` : ""}`,
    kickerNeutral: (brand: string, series?: string | null) =>
      series ? `${brand} · ${series}` : brand,

    // «128 товарів, перевірених за моделлю: чохли, захисне скло та плівки,
    // зарядні пристрої й решта. Усе тут підходить — нічого перевіряти не треба.»
    lede: (count: number, categories: readonly string[], hasMore: boolean) =>
      `${productCount(count)}, перевірених за моделлю: ${categories.join(", ")}${
        hasMore ? " й решта" : ""
      }. Усе тут підходить — нічого перевіряти не треба.`,

    // Device-state actions (one of three) + the picker.
    activeState: "Ваш активний пристрій",
    showForIt: "Показувати для нього",
    addToMine: "Додати до моїх пристроїв",
    otherModel: "Інша модель",
    stateLoading: "Перевіряємо ваші пристрої…",

    chipsAria: "Категорії для моделі",
    chipAria: (category: string, count: number) =>
      `${category}: ${productCount(count)}`,

    sectionCount: (count: number, model: string) =>
      `${productCount(count)} для ${model}`,
    // «Усі чохли для iPhone 15 Pro» — the group's compatibility landing.
    seeAll: (categoryLower: string, model: string) =>
      `Усі ${categoryLower} для ${model}`,
    railAria: (category: string) => `Товари: ${category}`,

    relatedAria: "Інші моделі",
    relatedTitle: (series?: string | null) =>
      series ? `Інші моделі ${series}` : "Інші моделі",
    relatedNote:
      "Чохли й скло в межах серії не взаємозамінні — у кожної моделі свій перелік.",
    relatedPillAria: (model: string, count: number) =>
      `Все для ${model}: ${productCount(count)}`,

    // <title> / description (overridden field by field by the model's admin
    // metaTitle / metaDescription, TASK-490).
    metaTitle: (model: string) => `Аксесуари для ${model}`,
    metaDescription: (
      model: string,
      categories: readonly string[],
      count: number,
      siteName: string,
    ) =>
      `Усе для ${model} у ${siteName}: ${categories.join(", ")} — ${productCount(
        count,
      )}, перевірених за моделлю. Швидка доставка по Україні.`,
    // Shown only for the instant before notFound() owns the response.
    metaFallbackTitle: "Аксесуари для пристрою",
  },
} as const;
