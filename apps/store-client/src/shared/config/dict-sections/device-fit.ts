// `dict.deviceFit` — copy for K2 V-контекст (TASK-1953), SД3.
// Kept in its own module so the SД3 clusters can add copy in parallel without
// all of them editing dictionary.ts at once. Same rules as dictionary.ts:
// every user-facing string lives here, interpolated strings are functions.

import { pluralUk } from "../plural";

export const deviceFitDict = {
  // ── Card / list-row mark (catalog, search, home & PDP rails, wishlist) ──
  // Verdict first, so a truncated pill still says the answer.
  fits: (device: string) => `Підходить до ${device}`,
  notFor: (device: string) => `Не для ${device}`,
  // Mode B — the catalogue filter «для всіх моїх» (Catalog mockup §2.3): the
  // saved devices the product fits, each with its label («iPhone 13 · Мама»).
  fitsAny: (devices: readonly string[]) => `Підходить: ${devices.join(", ")}`,
  notForAny: "Не для ваших пристроїв",

  // ── Out of stock: «Повідомити про надходження» (TASK-1066, behind
  // FEATURE_STUBS until the subscription exists) ──
  notify: {
    short: "Повідомити",
    long: "Повідомити про надходження",
    stub: "Сповіщення про надходження зʼявиться незабаром.",
  },

  // ── PDP model chips (Product mockup §6.6) ──
  modelChips: {
    // The tag on a chip of one of the shopper's saved devices without a label.
    mine: "ваш",
  },

  // ── PDP «Сумісність» tab (Product mockup §6.8) ──
  tab: {
    title: "Сумісність",
    fitsHeading: "Цей варіант підходить до",
    note: "Сумісність перевірена за розміром і вирізом камери. На інші моделі, навіть схожі розміром, цей варіант не підійде.",
    variantsHeading: "Є варіанти для",
  },

  // ── PDP rails (Product mockup §6.9) ──
  rail: {
    kickerMine: "Для вашого пристрою",
    kickerLabelled: (label: string) => `Для пристрою · ${label}`,
    kickerNone: "Часто беруть разом",
    titleMine: (device: string) => `Ще для ${device}`,
    titleNone: "До цього товару беруть",
    allFor: (device: string) => `Все для ${device}`,
    seeAll: "Дивитись усі",
    categoryLink: "Усі в категорії",
  },

  // ── PDP compatibility row ──
  row: {
    aria: "Сумісність",
    // Model list: «iPhone 15, iPhone 15 Pro, iPhone 15 Plus та ще 2 моделі».
    modelsMore: (names: string, rest: number) =>
      rest > 0
        ? `${names} та ще ${rest} ${pluralUk(rest, "модель", "моделі", "моделей")}`
        : names,

    // No saved device yet (also the neutral frame before hydration).
    askTitle: (models: string) => `Цей товар — для ${models}`,
    askSub: "Оберіть свій пристрій — і ми одразу скажемо, чи підійде.",
    pickDevice: "Обрати пристрій",

    // The active device fits.
    fitsTitle: (device: string) => `Підходить до вашого ${device}`,
    fitsTitleLabelled: (device: string, label: string) =>
      `Підходить до ${device} · ${label}`,
    fitsSub: "Перевірено за моделлю: розмір, кнопки й виріз камери збігаються.",

    // The active device does not fit.
    noFitTitle: (device: string) => `Не підходить до ${device}`,
    noFitSub: (models: string, device: string) =>
      `Цей товар сумісний лише з: ${models}. Подивіться, що є саме для ${device}.`,
    allForDevice: (device: string) => `Все для ${device}`,

    // Not this variant, but the group has one for the active device.
    variantTitle: (model: string, device: string) =>
      `Цей варіант — для ${model}, не для ${device}`,
    // «ціна та сама» only when the sibling's price really is the same.
    variantSub: (device: string, samePrice: boolean) =>
      samePrice
        ? `Той самий товар є і для ${device} — за тією ж ціною.`
        : `Той самий товар є і для ${device}.`,
    pickVariant: (device: string) => `Обрати варіант для ${device}`,
    otherVariant: "Варіант для нього",
    otherVariantAria: (device: string) => `Обрати варіант для ${device}`,

    otherDevice: "Інший пристрій",

    // Several saved devices: one answer per other device (at most 4).
    otherDevicesTitle: "Ваші інші пристрої",
    otherFits: "Підходить",
    otherNoFit: "Не підходить",
  },
} as const;
