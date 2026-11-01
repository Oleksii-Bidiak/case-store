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
    // «Усі 44 →» — the group's compatibility landing. The visible label is
    // just the count (the h2 already names category + model); seeAllContext
    // is screen-reader-only and completes the name to «Усі 44 — чохли для
    // iPhone 15 Pro», keeping the visible text as its prefix (label-in-name).
    // Leading space: name computation may or may not add one between spans.
    seeAll: (count: number) => `Усі ${formatCount(count)}`,
    seeAllContext: (categoryLower: string, model: string) =>
      ` — ${categoryLower} для ${model}`,
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

  // ── TASK-2076: «Мої пристрої» — `/devices` and the account section ──
  manager: {
    metaTitle: "Мої пристрої",
    metaDescription:
      "Ваші збережені пристрої й пристрої рідних: перемикайтеся між ними, щоб бачити аксесуари, які підходять.",
    crumbHome: "Головна",
    title: "Мої пристрої",
    /** «Мої пристрої · 10» — the H1 once the list is read. */
    titleWithCount: (count: number) => `Мої пристрої · ${formatCount(count)}`,
    lede: "Активний пристрій визначає, що підходить, у каталозі, на сторінках товарів і в пошуку. Зберігайте свої пристрої й пристрої рідних — і перемикайтеся в один дотик, коли шукаєте подарунок.",
    add: "Додати пристрій",
    loadingAria: "Завантажуємо ваші пристрої",

    // Settings panel — the defaults of the catalogue filter (TASK-2077).
    settingsAria: "Налаштування каталогу",
    compatOnlyTitle: "У каталозі — лише сумісне з активним пристроєм",
    compatOnlyHint:
      "Перемикач «З урахуванням моїх пристроїв» у фільтрах буде увімкнений за замовчуванням. Вимкніть — і каталог покаже все, зі стрічкою «підходить / не підходить» на картках.",
    scopeAllTitle: "Показувати товари для всіх моїх пристроїв",
    scopeAllHintDisabled: "Доступно, коли увімкнено «лише сумісне».",
    /** `example` — «iPhone 15 Pro, iPhone 13 · Мама», the card's own wording. */
    scopeAllHintOn: (count: number, example: string) =>
      `Каталог показує те, що підходить хоча б до одного з ваших пристроїв (${formatCount(
        count,
      )}); на картці — до яких саме: «Підходить: ${example}».`,
    scopeAllHintOff:
      "Зараз — лише для активного. Увімкніть, щоб бачити товари для всієї родини одразу.",

    // Groups by label; no label → «Мої».
    groupMine: "Мої",
    deviceCount: (n: number) =>
      `${formatCount(n)} ${pluralUk(n, "пристрій", "пристрої", "пристроїв")}`,

    // Device card.
    /** «Apple · 128 товарів підходить». */
    cardMeta: (brand: string, count: number) =>
      `${brand ? `${brand} · ` : ""}${productCount(count)} підходить`,
    /** While the model list loads, or for a model no longer in the catalogue. */
    cardMetaNoCount: (brand: string) => brand,
    /** The name with its label, as the catalogue card names it («iPhone 13 · Мама»). */
    deviceWithLabel: (name: string, label?: string) =>
      label ? `${name} · ${label}` : name,
    active: "Активний",
    showForIt: "Показувати для нього",
    showForItAria: (name: string) => `Показувати для ${name}`,
    allForIt: (name: string) => `Все для ${name}`,
    label: "Підписати",
    relabel: "Змінити підпис",
    labelAria: (name: string) => `Підписати ${name}`,
    relabelAria: (name: string) => `Змінити підпис ${name}`,
    forget: "Забути",
    forgetAria: (name: string) => `Забути ${name}`,
    forgotten: (name: string) => `${name} прибрано з ваших пристроїв`,
    undo: "Повернути",

    // Label editor.
    labelInputAria: "Підпис пристрою",
    labelPlaceholder: "Для кого? Наприклад, Мама",
    labelSave: "Зберегти",
    labelCancel: "Скасувати",
    labelSuggestionsAria: "Підказки підпису",
    labelSuggestionAria: (label: string) => `Підставити «${label}»`,
    /** Offered after the labels already in use; first five shown. */
    labelDefaults: ["Мама", "Тато", "Син", "Донька", "Робочий"],

    // Empty state.
    emptyTitle: "Ще немає збережених пристроїв",
    emptyBody:
      "Додайте свій телефон, годинник чи планшет — і каталог покаже, що до них підходить.",
  },
} as const;
