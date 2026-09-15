import { readColorAxis } from '../../../src/common/color-axis';
import { cataloguePositions } from './catalogue';
import { rootCategorySlug } from './categories.data';

/**
 * Structured-spec templates (TASK-191), declared on the ROOT categories and
 * inherited down each subtree at read time — so one declaration on «Чохли»
 * covers `iphone-cases`, `samsung-cases` and `xiaomi-cases`.
 *
 * **`key` stays latin, `label` is Ukrainian, and that asymmetry is deliberate.**
 * `key` is a URL parameter (`?specs=key:value`, see `product-list-query.dto.ts`)
 * and half of the `(categoryId, key)` unique index; Cyrillic there would mean
 * percent-encoded catalogue URLs. Only `label` is ever rendered. Group AXES are
 * the opposite (Ukrainian) because an axis has no key/label pair — its name IS
 * the label, and `product-sibling-navigator.tsx` prints it raw on the PDP.
 *
 * The leading definitions of every root are `isFilterable` SELECTs: the
 * storefront surfaces at most `SpecFacets.MAX_FACETS` facet controls in
 * `sortOrder` (= declaration) order, and a SELECT keeps the control reading
 * like a human wrote it («20 Вт») instead of a bare number or `true`/`false`.
 * Since TASK-487 the FIRST of them is {@link COLOR_DEFINITION} wherever the
 * catalogue has colours at all.
 *
 * Every value used by `data/catalogue/**` must appear in the matching `options`
 * list — the admin spec editor renders SELECTs as a closed dropdown. Colour is
 * the exception that proves the rule: its options are DERIVED from the same
 * data rather than restated (see `optionsFromColorAxis`).
 */
export interface AttributeDefinitionSeed {
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
  unit?: string;
  options?: string[];
  isFilterable?: boolean;
  /**
   * Fill `options` from the VARIANT AXIS values actually present in
   * `data/catalogue/**` for this root category, instead of listing them here
   * (TASK-487). Used by the colour definition and nothing else.
   *
   * Colour is the one spec whose value set is authored position-by-position
   * rather than entry-by-entry — 178 positions across 8 roots. A hand-written
   * option list for it would be a second copy of data that already exists, and
   * the copies drift the first time someone adds a «Пісочний» iPhone case: the
   * admin spec editor renders SELECT as a CLOSED dropdown, so the new colour
   * would become unpickable while the catalogue still shows it. Derived, it
   * cannot drift. See {@link colorOptionsByRoot}.
   */
  optionsFromColorAxis?: boolean;
}

/**
 * The colour facet (TASK-487, owner decision B-10: «колір — найсильніший фасет
 * в аксесуарах»).
 *
 * Declared FIRST in every root that carries it, so it takes `sortOrder: 0` and
 * leads the sidebar: the storefront renders facets in `sortOrder` and stops at
 * `SpecFacets.MAX_FACETS`, and a facet nobody scrolls to is a facet nobody uses.
 *
 * It is the same object in every root on purpose — colour is ONE facet that
 * happens to be declared per category tree (definitions are per-category by
 * design), not eight unrelated ones, and `key: 'color'` is what makes
 * `?specs=color:Чорний` mean the same thing in «Чохли» and in «Навушники».
 * `options` is derived per root; see {@link optionsFromColorAxis}.
 */
export const COLOR_DEFINITION: AttributeDefinitionSeed = {
  key: 'color',
  label: 'Колір',
  type: 'SELECT',
  isFilterable: true,
  optionsFromColorAxis: true,
};

export const definitionsByRootCategory: Record<string, AttributeDefinitionSeed[]> = {
  smartphones: [
    COLOR_DEFINITION,
    {
      key: 'memory',
      label: "Пам'ять",
      type: 'SELECT',
      options: ['64 ГБ', '128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
      isFilterable: true,
    },
    {
      key: 'os',
      label: 'Операційна система',
      type: 'SELECT',
      options: ['iOS', 'Android'],
      isFilterable: true,
    },
    { key: 'screen', label: 'Екран', type: 'TEXT' },
    { key: 'camera', label: 'Основна камера', type: 'TEXT' },
    { key: 'battery', label: 'Акумулятор', type: 'NUMBER', unit: 'мА·год' },
  ],

  headphones: [
    COLOR_DEFINITION,
    {
      key: 'headphone-type',
      label: 'Тип',
      type: 'SELECT',
      options: ['Вкладиші TWS', 'Накладні', 'Повнорозмірні', 'Внутрішньоканальні дротові'],
      isFilterable: true,
    },
    {
      key: 'connection',
      label: "Спосіб під'єднання",
      type: 'SELECT',
      options: ['Bluetooth', '3.5 мм', 'USB-C'],
      isFilterable: true,
    },
    { key: 'playtime', label: 'Час автономної роботи', type: 'NUMBER', unit: 'год' },
    { key: 'anc', label: 'Активне шумозаглушення', type: 'BOOLEAN' },
  ],

  smartwatches: [
    COLOR_DEFINITION,
    {
      key: 'case-size',
      label: 'Розмір корпусу',
      type: 'SELECT',
      options: ['38–41 мм', '42–45 мм', '46–49 мм', 'Універсальний'],
      isFilterable: true,
    },
    {
      key: 'water-protection',
      label: 'Захист від води',
      type: 'SELECT',
      options: ['IP67', 'IP68', '5 ATM', '10 ATM', 'Немає'],
      isFilterable: true,
    },
    // Not filterable, and a SELECT anyway: `SpecFacets` renders at most two
    // facets, so a third filterable definition would never reach the shopper —
    // but the closed option list still keeps the admin spec editor a dropdown
    // instead of free text, which is what stops «Силікон» / «силікон» drifting
    // apart across entries.
    {
      key: 'band-material',
      label: 'Матеріал ремінця',
      type: 'SELECT',
      options: ['Силікон', 'Нейлон', 'Метал', 'Шкіра'],
    },
    { key: 'display', label: 'Дисплей', type: 'TEXT' },
    { key: 'battery-life', label: 'Час роботи від заряду', type: 'NUMBER', unit: 'днів' },
  ],

  speakers: [
    COLOR_DEFINITION,
    {
      key: 'power',
      label: 'Потужність',
      type: 'SELECT',
      options: ['5 Вт', '10 Вт', '20 Вт', '30 Вт', '40 Вт', '80 Вт'],
      isFilterable: true,
    },
    {
      key: 'water-protection',
      label: 'Вологозахист',
      type: 'SELECT',
      options: ['IPX4', 'IPX5', 'IPX7', 'IP67', 'Немає'],
      isFilterable: true,
    },
    { key: 'playtime', label: 'Час роботи від заряду', type: 'NUMBER', unit: 'год' },
    { key: 'bluetooth', label: 'Версія Bluetooth', type: 'TEXT' },
  ],

  'power-banks': [
    COLOR_DEFINITION,
    {
      key: 'capacity',
      label: 'Ємність',
      type: 'SELECT',
      options: ['5000 мА·год', '10000 мА·год', '20000 мА·год', '26800 мА·год'],
      isFilterable: true,
    },
    {
      key: 'output-power',
      label: 'Максимальна потужність',
      type: 'SELECT',
      options: ['15 Вт', '20 Вт', '22.5 Вт', '30 Вт', '65 Вт', '100 Вт'],
      isFilterable: true,
    },
    { key: 'ports', label: "Роз'єми", type: 'TEXT' },
    { key: 'passthrough', label: 'Наскрізна зарядка', type: 'BOOLEAN' },
  ],

  cases: [
    COLOR_DEFINITION,
    {
      key: 'material',
      label: 'Матеріал',
      type: 'SELECT',
      options: ['Силікон', 'TPU', 'Полікарбонат', 'Екошкіра', 'Силікон + полікарбонат'],
      isFilterable: true,
    },
    {
      key: 'case-type',
      label: 'Тип чохла',
      type: 'SELECT',
      options: ['Накладка', 'Прозорий', 'Броньований', 'Книжка', 'З підставкою'],
      isFilterable: true,
    },
    { key: 'magsafe', label: 'Підтримка MagSafe', type: 'BOOLEAN' },
    { key: 'protection', label: 'Захист', type: 'TEXT' },
  ],

  'screen-protectors': [
    {
      key: 'protector-type',
      label: 'Тип захисту',
      type: 'SELECT',
      options: ['Гартоване скло', 'Гідрогелева плівка', 'Скло на камеру'],
      isFilterable: true,
    },
    {
      key: 'coverage',
      label: 'Зона покриття',
      type: 'SELECT',
      options: ['Увесь екран (Full Glue)', 'Пряма частина екрана', 'Модуль камери'],
      isFilterable: true,
    },
    { key: 'hardness', label: 'Твердість', type: 'TEXT' },
    { key: 'pack-size', label: 'Кількість у комплекті', type: 'NUMBER', unit: 'шт' },
  ],

  cables: [
    {
      key: 'connector-out',
      label: "Роз'єм пристрою",
      type: 'SELECT',
      options: ['USB-C', 'Lightning', 'micro-USB', 'HDMI', '3.5 мм'],
      isFilterable: true,
    },
    {
      key: 'cable-length',
      label: 'Довжина',
      type: 'SELECT',
      options: ['0.25 м', '1 м', '1.5 м', '2 м', '3 м'],
      isFilterable: true,
    },
    {
      key: 'connector-in',
      label: "Роз'єм джерела",
      type: 'SELECT',
      options: ['USB-A', 'USB-C'],
    },
    { key: 'power-delivery', label: 'Максимальна потужність', type: 'NUMBER', unit: 'Вт' },
  ],

  chargers: [
    COLOR_DEFINITION,
    {
      key: 'charger-power',
      label: 'Потужність',
      type: 'SELECT',
      options: ['20 Вт', '30 Вт', '45 Вт', '65 Вт', '100 Вт'],
      isFilterable: true,
    },
    {
      key: 'charger-type',
      label: 'Тип',
      type: 'SELECT',
      options: ['Мережева', 'Автомобільна', 'Бездротова'],
      isFilterable: true,
    },
    { key: 'ports', label: 'Кількість портів', type: 'NUMBER', unit: 'шт' },
    {
      key: 'technology',
      label: 'Технологія',
      type: 'SELECT',
      options: ['GaN', 'Power Delivery', 'Quick Charge', 'MagSafe', 'Qi2'],
    },
  ],

  holders: [
    COLOR_DEFINITION,
    {
      key: 'mount',
      label: 'Місце кріплення',
      type: 'SELECT',
      options: ['Дефлектор', 'Лобове скло', 'Панель', 'Стіл', 'Корпус телефона'],
      isFilterable: true,
    },
    {
      key: 'fixation',
      label: 'Спосіб фіксації',
      type: 'SELECT',
      options: ['Магніт', 'Затискач', 'Присоска', 'MagSafe'],
      isFilterable: true,
    },
    {
      key: 'holder-material',
      label: 'Матеріал',
      type: 'SELECT',
      options: ['Алюміній', 'Пластик', 'Силікон'],
    },
    { key: 'rotation', label: 'Регулювання', type: 'TEXT' },
  ],

  'memory-cards': [
    {
      key: 'capacity',
      label: "Об'єм",
      type: 'SELECT',
      options: ['64 ГБ', '128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
      isFilterable: true,
    },
    {
      key: 'speed-class',
      label: 'Клас швидкості',
      type: 'SELECT',
      options: ['Class 10', 'U1', 'U3', 'V30', 'USB 3.2'],
      isFilterable: true,
    },
    { key: 'read-speed', label: 'Швидкість читання', type: 'NUMBER', unit: 'МБ/с' },
    {
      key: 'interface',
      label: 'Інтерфейс',
      type: 'SELECT',
      options: ['microSDXC', 'USB-A 3.2', 'USB-C 3.2', 'USB-A + USB-C'],
    },
  ],
};

/**
 * The variant axis that also fills a structured spec. A phone position's memory
 * comes from its own «Пам'ять» axis value, not from the shared entry specs —
 * otherwise every position of the group would report the same storage.
 */
export const AXIS_BACKED_SPECS: { axis: string; key: string }[] = [
  { axis: "Пам'ять", key: 'memory' },
  { axis: "Об'єм", key: 'capacity' },
  { axis: 'Довжина', key: 'cable-length' },
];

/**
 * The colour axis → `color` spec bridge (TASK-487).
 *
 * Colour is axis-backed exactly like «Пам'ять» above, but it is NOT listed in
 * {@link AXIS_BACKED_SPECS}: those entries match one literal axis NAME, and the
 * colour axis has three accepted spellings (`color` / `colour` / «Колір») that
 * `src/common/color-axis.ts` owns for the whole server. Matching it by literal
 * would re-create the exact copy-paste that once made colour dots vanish
 * (TASK-364). The seeder therefore calls {@link readColorAxis} instead.
 *
 * @returns colour value of a position, or null when it has no colour axis.
 */
export function colorOfPosition(variantAttributes: unknown): string | null {
  return readColorAxis(variantAttributes)?.value ?? null;
}

/**
 * Distinct colour values per ROOT category, derived from the catalogue itself —
 * the option list of {@link COLOR_DEFINITION} in each root that declares it.
 *
 * Sorted with the Ukrainian collator so «Білий» precedes «Чорний» in the admin
 * dropdown, rather than by UTF-16 code unit.
 */
export function colorOptionsByRoot(): Map<string, string[]> {
  const byRoot = new Map<string, Set<string>>();
  for (const position of cataloguePositions()) {
    const color = colorOfPosition(position.variant.attributes);
    if (color === null) continue;
    const root = rootCategorySlug(position.entry.categorySlug);
    const bucket = byRoot.get(root) ?? new Set<string>();
    bucket.add(color);
    byRoot.set(root, bucket);
  }
  return new Map(
    [...byRoot.entries()].map(([root, values]) => [
      root,
      [...values].sort((a, b) => a.localeCompare(b, 'uk')),
    ]),
  );
}

/**
 * Root categories whose declaration includes the colour facet — i.e. where a
 * shopper will be offered colour swatches.
 *
 * Colour is cross-cutting but NOT universal: cables, screen protectors and
 * memory cards carry no colour axis in `data/catalogue/**`, and declaring the
 * facet there would publish a filter control with nothing in it. The matching
 * unit test asserts this list against the data in BOTH directions, so a root
 * that gains its first coloured position fails the build instead of quietly
 * shipping a colourless catalogue.
 */
export const colorFacetRoots = (): string[] =>
  Object.entries(definitionsByRootCategory)
    .filter(([, defs]) => defs.some((def) => def.key === COLOR_DEFINITION.key))
    .map(([root]) => root);
