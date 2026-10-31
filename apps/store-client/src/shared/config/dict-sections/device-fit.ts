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

    otherDevice: "Інший пристрій",

    // Several saved devices: one answer per other device (at most 4).
    otherDevicesTitle: "Ваші інші пристрої",
    otherFits: "Підходить",
    otherNoFit: "Не підходить",
  },
} as const;
