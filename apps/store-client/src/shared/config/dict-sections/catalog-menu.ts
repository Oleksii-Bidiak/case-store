// `dict.catalogMenu` — copy for the «Каталог» mega menu (lg+) and the
// step-by-step catalog in the menu sheet (TASK-2072, SД3b V-мегаменю).
// Kept in its own module so the SД3 clusters can add copy in parallel without
// all of them editing dictionary.ts at once. Same rules as dictionary.ts:
// every user-facing string lives here, interpolated strings are functions.
//
// The trigger («Каталог» / «Каталог категорій») and the two footer exits
// («Усі категорії» / «Усі товари») stay in `dict.header` — they predate this
// module and are shared with the rest of the header.

/** Thousands with a space, as everywhere in uk-UA («1 348»). */
const count = (n: number) => n.toLocaleString("uk-UA");

export const catalogMenuDict = {
  // ── Mega menu (CatalogMenu mockup, variant 2c with tiles) ──
  mega: {
    /** `<nav>` around the level-1 column. */
    rootsAria: "Категорії",
    /**
     * Pane heading link → the active root. The mockup reads «Усі 412 →»; the
     * category tree carries no product counts yet (TASK-2138), so without a
     * number it is «Усі →» — the same string minus the missing datum.
     */
    allIn: (n?: number) => (n == null ? "Усі →" : `Усі ${count(n)} →`),
    /** Accessible name of that link: the visible «Усі» + where it leads. */
    allInAria: (category: string) => `Усі в категорії «${category}»`,
    /** Tail of a tile's level-3 list when it has more than four links. */
    more: (n: number) => `Ще ${n} →`,
    moreAria: (n: number, category: string) =>
      `Ще ${n} у категорії «${category}»`,
  },

  // ── «Ваш пристрій» column (xl+) ──
  device: {
    kicker: "Ваш пристрій",
    allFor: (name: string) => `Все для ${name}`,
    /** Accessible name of the column's compatible-categories list. */
    categoriesAria: (name: string) => `Категорії для ${name}`,
    pickKicker: "Для якого пристрою?",
    pickText:
      "Оберіть модель — і меню та каталог покажуть лише те, що до неї підходить.",
    popularAria: "Популярні моделі",
    allModels: "Усі моделі",
  },

  // ── Step-by-step catalog in the menu sheet (CatalogDrill mockup) ──
  drill: {
    allFor: (name: string) => `Все для ${name}`,
    /** Under the device row: the other saved devices and «add», one button. */
    otherDevices: (n: number) => `Інші пристрої (${n}) і додати`,
    addAnother: "Додати ще пристрій",
    /** Back button: its visible text is the parent's name («Каталог» at level 2). */
    backAria: (label: string) => `Назад: ${label}`,
    allProductsIn: (name: string) => `Усі товари «${name}»`,
    /** Ancestors line above the current level, from level 3 on. */
    trailSeparator: " › ",
  },
} as const;
