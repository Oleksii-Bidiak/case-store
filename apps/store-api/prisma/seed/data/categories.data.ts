/**
 * The catalogue taxonomy (TASK-366): 11 Ukrainian root categories with their
 * subcategories, authored as a tree and flattened for the seeder.
 *
 * SLUGS STAY LATIN AND STABLE. Fifteen of them (`cases`, `iphone-cases`,
 * `chargers`, `cables`, `screen-protectors`, `smartphones`, `iphone`, …) predate
 * this rewrite: `seedCarousels` looks up `slug: 'cases'` by hand, and stable
 * slugs keep dev bookmarks and the manual-QA notes valid. Display names are free
 * to change — only the slug is a contract.
 */

interface CategoryNode {
  name: string;
  slug: string;
  description: string;
  metaTitle?: string;
  metaDescription?: string;
  children?: Omit<CategoryNode, 'children'>[];
}

export const categoryTree: CategoryNode[] = [
  {
    name: 'Смартфони',
    slug: 'smartphones',
    description:
      'Смартфони Apple, Samsung і Xiaomi з офіційною гарантією — від доступних моделей до флагманів.',
    metaTitle: 'Смартфони — купити в Україні',
    metaDescription:
      'Смартфони Apple, Samsung та Xiaomi: актуальні моделі, чесні залишки, доставка Новою Поштою.',
    children: [
      {
        name: 'iPhone',
        slug: 'iphone',
        description: 'Смартфони Apple iPhone — від 13-ї серії до найновіших Pro.',
      },
      {
        name: 'Samsung Galaxy',
        slug: 'samsung-phones',
        description: 'Смартфони Samsung Galaxy серій S та A.',
      },
      {
        name: 'Xiaomi та Redmi',
        slug: 'xiaomi-phones',
        description: 'Смартфони Xiaomi і Redmi — розумний баланс ціни та начинки.',
      },
    ],
  },
  {
    name: 'Навушники',
    slug: 'headphones',
    description:
      'Бездротові вкладиші, накладні навушники з шумозаглушенням і перевірена класика з дротом.',
    metaTitle: 'Навушники — бездротові та дротові',
    metaDescription:
      'TWS-вкладиші, накладні навушники з активним шумозаглушенням і дротові моделі. Гарантія та швидка доставка.',
    children: [
      {
        name: 'Бездротові вкладиші (TWS)',
        slug: 'tws-earbuds',
        description: 'Повністю бездротові навушники з кейсом для заряджання.',
      },
      {
        name: 'Накладні та повнорозмірні',
        slug: 'over-ear-headphones',
        description: 'Навушники з великими чашками — довга автономність і глибокий бас.',
      },
      {
        name: 'Дротові навушники',
        slug: 'wired-headphones',
        description: "Навушники з роз'ємом 3.5 мм або USB-C — без затримки й без заряджання.",
      },
    ],
  },
  {
    name: 'Смарт-годинники та браслети',
    slug: 'smartwatches',
    description:
      'Годинники й фітнес-браслети для тренувань, сну та сповіщень, а також ремінці до них.',
    metaTitle: 'Смарт-годинники та фітнес-браслети',
    metaDescription:
      'Смарт-годинники Apple Watch і Galaxy Watch, фітнес-браслети Xiaomi та змінні ремінці.',
    children: [
      {
        name: 'Смарт-годинники',
        slug: 'smart-watches',
        description: 'Годинники з великим екраном, GPS і повноцінними застосунками.',
      },
      {
        name: 'Фітнес-браслети',
        slug: 'fitness-bands',
        description: 'Легкі браслети з довгою автономністю — крокомір, пульс і сон.',
      },
      {
        name: 'Ремінці',
        slug: 'watch-bands',
        description: 'Змінні ремінці зі силікону, нейлону та шкіри під різні розміри корпусів.',
      },
    ],
  },
  {
    name: 'Портативні колонки',
    slug: 'speakers',
    description: 'Bluetooth-колонки для дому, поїздок і вечірок — від кишенькових до вечіркових.',
    metaTitle: 'Портативні Bluetooth-колонки',
    metaDescription:
      'Портативні колонки JBL, Sony та Xiaomi: захист від води, довга автономність, чесний звук.',
    children: [
      {
        name: 'Компактні колонки',
        slug: 'compact-speakers',
        description: 'Колонки, які вміщаються в долоню або в кишеню рюкзака.',
      },
      {
        name: 'Вечіркові колонки',
        slug: 'party-speakers',
        description: 'Потужні колонки з підсвіткою для великої компанії.',
      },
    ],
  },
  {
    name: 'Павербанки',
    slug: 'power-banks',
    description:
      'Зовнішні акумулятори на кожен день і на випадок відключень — від кишенькових до 26 800 мА·год.',
    metaTitle: 'Павербанки — зовнішні акумулятори',
    metaDescription:
      'Павербанки Anker, Baseus та Hoco: швидка зарядка Power Delivery, MagSafe, ємність до 26 800 мА·год.',
    children: [
      {
        name: 'Компактні павербанки',
        slug: 'compact-power-banks',
        description: 'До 10 000 мА·год — заряд про запас, який не важчає в кишені.',
      },
      {
        name: 'Ємні павербанки',
        slug: 'high-capacity-power-banks',
        description: 'Від 20 000 мА·год — кілька повних зарядів телефона або живлення ноутбука.',
      },
      {
        name: 'MagSafe-павербанки',
        slug: 'magsafe-power-banks',
        description: 'Магнітні акумулятори, що чіпляються до iPhone без кабелю.',
      },
    ],
  },
  {
    name: 'Чохли',
    slug: 'cases',
    description: 'Чохли для смартфонів — від тонких силіконових до броньованих із підставкою.',
    metaTitle: 'Чохли для смартфонів',
    metaDescription:
      'Чохли для iPhone, Samsung Galaxy та Xiaomi: силікон, прозорий TPU, шкіра, посилений захист кутів.',
    children: [
      {
        name: 'Чохли для iPhone',
        slug: 'iphone-cases',
        description: 'Чохли під усі актуальні моделі iPhone, зокрема з магнітом MagSafe.',
      },
      {
        name: 'Чохли для Samsung',
        slug: 'samsung-cases',
        description: 'Чохли для Galaxy S та Galaxy A з точними вирізами під камери.',
      },
      {
        name: 'Чохли для Xiaomi',
        slug: 'xiaomi-cases',
        description: 'Чохли для Xiaomi та Redmi — легкі, з бортиком навколо екрана.',
      },
    ],
  },
  {
    name: 'Захисне скло та плівки',
    slug: 'screen-protectors',
    description: 'Захист екрана й камери: гартоване скло, гідрогель і накладки на модуль камери.',
    metaTitle: 'Захисне скло та плівки для смартфонів',
    metaDescription:
      'Гартоване скло 9H, гідрогелеві плівки та захист камери з рамкою для точного наклеювання.',
    children: [
      {
        name: 'Захисне скло',
        slug: 'tempered-glass',
        description: 'Гартоване скло твердістю 9H з олеофобним покриттям.',
      },
      {
        name: 'Гідрогелеві плівки',
        slug: 'hydrogel-films',
        description: 'Плівки, що самовідновлюються й лягають на вигнуті краї екрана.',
      },
      {
        name: 'Захист камери',
        slug: 'camera-protectors',
        description: "Скляні накладки на модуль камери — рятують об'єктиви від подряпин.",
      },
    ],
  },
  {
    name: 'Кабелі та перехідники',
    slug: 'cables',
    description: 'Кабелі для заряджання й передавання даних, а також перехідники та USB-хаби.',
    metaTitle: 'Кабелі та перехідники',
    metaDescription:
      'Кабелі USB-C, Lightning і micro-USB з обплетенням, перехідники та хаби. Підтримка Power Delivery.',
    children: [
      {
        name: 'Кабелі Lightning',
        slug: 'lightning-cables',
        description: 'Кабелі Lightning із сертифікацією MFi для iPhone до 14-ї серії.',
      },
      {
        name: 'Кабелі USB-C',
        slug: 'usb-c-cables',
        description: 'Кабелі USB-C на 60–240 Вт для телефонів, планшетів і ноутбуків.',
      },
      {
        name: 'Кабелі micro-USB',
        slug: 'micro-usb-cables',
        description: 'Кабелі micro-USB для навушників, колонок і старших пристроїв.',
      },
      {
        name: 'Перехідники та хаби',
        slug: 'adapters-hubs',
        description: 'Перехідники на HDMI та 3.5 мм і багатопортові USB-C хаби.',
      },
    ],
  },
  {
    name: 'Зарядні пристрої',
    slug: 'chargers',
    description: 'Мережеві, автомобільні та бездротові зарядки — від 20 Вт до 100 Вт.',
    metaTitle: 'Зарядні пристрої для телефонів',
    metaDescription:
      'Мережеві блоки GaN, автомобільні зарядки та бездротові станції MagSafe. Швидка зарядка PD і QC.',
    children: [
      {
        name: 'Мережеві зарядки',
        slug: 'wall-chargers',
        description: 'Блоки живлення в розетку — компактні GaN і багатопортові станції.',
      },
      {
        name: 'Автомобільні зарядки',
        slug: 'car-chargers',
        description: 'Зарядки в прикурювач для швидкого поповнення в дорозі.',
      },
      {
        name: 'Бездротові зарядки',
        slug: 'wireless-chargers',
        description: 'Килимки й стійки Qi та MagSafe — покласти телефон і забути про кабель.',
      },
    ],
  },
  {
    name: 'Тримачі та підставки',
    slug: 'holders',
    description: 'Автотримачі, настільні підставки й попсокети — щоб телефон завжди був під рукою.',
    metaTitle: 'Тримачі та підставки для телефона',
    metaDescription:
      'Автомобільні тримачі на дефлектор і скло, настільні підставки та магнітні кільця MagSafe.',
    children: [
      {
        name: 'Автотримачі',
        slug: 'car-holders',
        description: 'Кріплення на дефлектор, лобове скло чи панель — з магнітом або затискачем.',
      },
      {
        name: 'Настільні підставки',
        slug: 'desk-stands',
        description: 'Підставки для столу з регульованим кутом нахилу.',
      },
      {
        name: 'Кільця та попсокети',
        slug: 'phone-grips',
        description: 'Тримачі-кільця та попсокети, які рятують телефон від падінь.',
      },
    ],
  },
  {
    name: "Карти пам'яті та флешки",
    slug: 'memory-cards',
    description:
      'Карти microSD для камер і консолей та USB-флешки для щоденного перенесення файлів.',
    metaTitle: "Карти пам'яті microSD та USB-флешки",
    metaDescription:
      "Карти пам'яті SanDisk і Samsung класу U3 та USB-флешки з роз'ємами USB-A і USB-C.",
    children: [
      {
        name: 'Карти microSD',
        slug: 'microsd-cards',
        description: 'Карти microSD від 64 ГБ до 512 ГБ — для смартфонів, екшн-камер і консолей.',
      },
      {
        name: 'USB-флешки',
        slug: 'usb-drives',
        description: "Флешки USB 3.2 з класичним роз'ємом і подвійні USB-A + USB-C.",
      },
    ],
  },
];

/** Every category slug → the slug of the ROOT it hangs under (roots map to themselves). */
const ROOT_BY_SLUG = new Map<string, string>(
  categoryTree.flatMap((root) => [
    [root.slug, root.slug] as [string, string],
    ...(root.children ?? []).map((child) => [child.slug, root.slug] as [string, string]),
  ]),
);

/**
 * The root a category belongs to. Structured-spec definitions are declared on
 * roots and inherited down the subtree, so every consumer that needs to find a
 * product's definitions starts here.
 */
export function rootCategorySlug(slug: string): string {
  const root = ROOT_BY_SLUG.get(slug);
  if (!root) {
    throw new Error(`Seed: category slug "${slug}" is not part of the catalogue tree`);
  }
  return root;
}

/** Root categories, flattened and numbered in tree order. */
export const categoriesData = categoryTree.map((node, index) => ({
  name: node.name,
  slug: node.slug,
  description: node.description,
  metaTitle: node.metaTitle ?? null,
  metaDescription: node.metaDescription ?? null,
  sortOrder: index + 1,
}));

/**
 * Subcategories, resolved against the already-upserted roots (they carry a real
 * `parentId`, so they cannot be a static literal).
 */
export function buildSubcategories(categories: Record<string, { id: string }>) {
  return categoryTree.flatMap((root) =>
    (root.children ?? []).map((child, index) => ({
      name: child.name,
      slug: child.slug,
      description: child.description,
      metaTitle: child.metaTitle ?? null,
      metaDescription: child.metaDescription ?? null,
      parentId: categories[root.slug].id,
      sortOrder: index + 1,
    })),
  );
}
