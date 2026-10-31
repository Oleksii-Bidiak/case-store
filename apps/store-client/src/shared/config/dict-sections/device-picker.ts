// `dict.devicePicker` — copy for K1 V-пікер (TASK-2074, 2070, 1952), SД3.
// Kept in its own module so the SД3 clusters can add copy in parallel without
// all of them editing dictionary.ts at once. Same rules as dictionary.ts:
// every user-facing string lives here, interpolated strings are functions.

import { pluralUk } from "../plural";

export const devicePickerDict = {
  // Shared plural — «1 товар», «3 товари», «128 товарів».
  productCount: (n: number) =>
    `${n} ${pluralUk(n, "товар", "товари", "товарів")}`,
  // Joins meta parts: «Мама · Apple · 118 товарів».
  metaSeparator: " · ",

  // ── TASK-2070: the picker dialog / bottom sheet ──
  dialog: {
    close: "Закрити",
    titleEmpty: "Для якого пристрою шукаєте?",
    titleSaved: (n: number) => `Ваші пристрої · ${n}`,
    ledeEmpty:
      "Покажемо, що до нього підходить, — у каталозі, на сторінках товарів і в пошуку.",
    ledeSaved:
      "Активний пристрій визначає, що підходить, у каталозі й на сторінках товарів. Перемикайтеся в один дотик.",

    savedGroupAria: "Ваші пристрої",
    activeNow: "Зараз",
    forget: (name: string) => `Забути ${name}`,
    showAll: (n: number) => `Показати всі (${n})`,
    collapse: "Згорнути",
    manage: "Керувати пристроями",
    addAnother: "Додати ще один",

    searchPlaceholder: "Модель, наприклад iPhone 15 Pro",
    searchAria: "Пошук моделі",
    clearSearch: "Очистити пошук",
    corrected: (query: string, name: string) =>
      `Розуміємо й «${query}» — це ${name}`,
    resultsAria: "Знайдені моделі",
    savedBadge: "Ваш",
    emptyTitle: "Такої моделі поки немає в каталозі",
    emptyBodyBefore: "Перевірте назву або ",
    emptyBodyLink: "напишіть нам",
    emptyBodyAfter: " — підкажемо, що до неї підійде.",

    familiesAria: "Сім’ї пристроїв",
    popular: "Популярні",
    families: {
      iphone: "iPhone",
      galaxy: "Galaxy",
      redmi: "Xiaomi і Redmi",
      watch: "Apple Watch",
      ipad: "iPad",
    },
    loading: "Завантажуємо моделі…",
    loadError: "Не вдалося завантажити список моделей.",
    retry: "Спробувати ще раз",

    helpToggle: "Як дізнатися свою модель?",
    help: [
      {
        lead: "iPhone, iPad:",
        body: "Параметри → Загальні → Про пристрій → «Назва моделі».",
      },
      { lead: "Samsung, Xiaomi:", body: "Налаштування → Про телефон." },
      {
        lead: "Apple Watch:",
        body: "на iPhone — застосунок Watch → Загальні → Про пристрій; розмір корпусу (42, 46 або 49 мм) — на задній кришці.",
      },
    ],

    forgetAll: "Забути всі пристрої",
    forgetAllConfirm: (n: number) => `Так, забути всі (${n})`,
    forgetAllCancel: "Скасувати",

    // Screen-reader announcements (role="status").
    forgotten: (name: string) => `${name} забуто`,
    forgottenAll: "Усі пристрої забуто",
  },

  // ── TASK-2074: the device bar under the header row (two tiers) ──
  bar: {
    groupAria: "Мої пристрої",
    myDevices: "Мої пристрої",
    yours: "Ваш:",
    more: (n: number) => `ще ${n}`,
    moreAria: (n: number) => `Усі мої пристрої: ще ${n}`,
    add: "Додати пристрій",
    pick: "Оберіть свій пристрій",
    pickHint: "— покажемо, що підходить",
    activeAria: (name: string, label?: string) =>
      `Активний пристрій: ${name}${label ? ` (${label})` : ""}. Змінити або додати`,
    forgetAria: (name: string) => `Забути пристрій ${name}`,
    showForAria: (name: string, label?: string) =>
      `Показувати для ${name}${label ? ` (${label})` : ""}`,

    // Tier 2 — the active device's categories (≥ 1024).
    categoriesFor: (name: string) => `Для ${name}:`,
    categoriesAria: (name: string) => `Категорії для ${name}`,
    allCategories: (n: number) => `Усі категорії · ${n}`,
    noCategories: "Сумісних товарів поки немає —",
    noCategoriesLink: "увесь каталог",

    // The «Усі категорії» drop panel.
    panelTitle: (name: string, label?: string) =>
      `Усе для ${name}${label ? ` · ${label}` : ""}`,
    openModelPage: (count: string) => `Відкрити сторінку моделі · ${count}`,
  },

  // ── TASK-1952: the homepage first block — picker, or the active device ──
  hero: {
    // State A — no saved device.
    sectionAria: "Підібрати аксесуари",
    title: "Для якого пристрою шукаєте?",
    lede: "Оберіть модель — і каталог покаже лише те, що до неї підходить. Можна зберегти кілька — свої й рідних.",
    searchAria: "Знайти модель пристрою",
    searchPlaceholder: "Модель, наприклад iPhone 15 Pro",
    searchSubmit: "Знайти",
    hint: "Розуміємо й «айфон 15 про», «галаксі с24»",
    suggestionsAria: "Моделі за запитом",
    noMatch: "Такої моделі поки немає в каталозі.",
    noMatchAction: "Переглянути всі моделі",
    popularLabel: "Популярні моделі",
    allModels: "Усі моделі",
    // «Понад 40 моделей» — rounded down to tens; a thin catalogue says the
    // exact number instead of «Понад 0».
    modelsTotal: (n: number) =>
      n >= 10
        ? `Понад ${Math.floor(n / 10) * 10} моделей`
        : `${n} ${pluralUk(n, "модель", "моделі", "моделей")}`,

    // State B — a device is saved: the active device's panel.
    panelAria: (name: string) => `Для вашого ${name}`,
    kicker: "Для вашого пристрою",
    kickerLabel: (label: string) => `Для пристрою · ${label}`,
    fits: (count: string) =>
      `${count} підходить — чохли, скло, зарядки й решта`,
    noneFit:
      "Саме для цієї моделі товарів поки немає — загляньте в каталог або оберіть інший пристрій.",
    cta: (name: string) => `Все для ${name}`,
    catalogCta: "Перейти в каталог",
    categoriesAria: (name: string) => `Категорії для ${name}`,
    alsoYours: "Також у вас:",
    showFor: (name: string, label?: string) =>
      `Показувати для ${name}${label ? ` (${label})` : ""}`,
    otherDevice: "Інший пристрій",
  },
} as const;
