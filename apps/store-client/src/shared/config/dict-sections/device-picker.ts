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
} as const;
