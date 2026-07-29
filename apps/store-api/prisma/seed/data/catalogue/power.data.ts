import type { CatalogueEntry } from '../../types';

/** Зарядні пристрої — 8 catalogue entries / 12 positions. */
export const chargers: CatalogueEntry[] = [
  {
    name: 'Мережевий зарядний пристрій Anker 20 Вт USB-C',
    slug: 'charger-anker-20w',
    description:
      'Той самий блок, який Apple перестала класти в коробку. Двадцяти ват вистачає, щоб iPhone набрав половину заряду за пів години, а розміром він як сірникова коробка.',
    price: 549,
    compareAtPrice: 699,
    sku: 'CHG-ANK-20W',
    categorySlug: 'wall-chargers',
    brandSlug: 'anker',
    specs: {
      'charger-power': '20 Вт',
      'charger-type': 'Мережева',
      ports: 1,
      technology: 'Power Delivery',
    },
    variants: [
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'CHG-ANK-20W-WH',
        price: 549,
        stock: 80,
        attributes: { Колір: 'Білий' },
      },
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'CHG-ANK-20W-BK',
        price: 549,
        stock: 70,
        attributes: { Колір: 'Чорний' },
      },
    ],
  },
  {
    name: 'Мережевий зарядний пристрій Baseus GaN 65 Вт',
    slug: 'charger-baseus-gan-65w',
    description:
      'Нітрид галію дозволив вкласти 65 Вт у корпус, менший за старий блок на 30 Вт. Два USB-C і один USB-A: ноутбук, телефон і навушники заряджаються з однієї розетки.',
    price: 1299,
    compareAtPrice: 1699,
    sku: 'CHG-BSU-65W',
    categorySlug: 'wall-chargers',
    brandSlug: 'baseus',
    specs: {
      'charger-power': '65 Вт',
      'charger-type': 'Мережева',
      ports: 3,
      technology: 'GaN',
    },
    views: ['загальний вигляд', 'порти зблизька'],
    variants: [
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'CHG-BSU-65W-WH',
        price: 1299,
        stock: 30,
        attributes: { Колір: 'Білий' },
      },
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'CHG-BSU-65W-BK',
        price: 1299,
        stock: 25,
        attributes: { Колір: 'Чорний' },
      },
    ],
  },
  {
    name: 'Мережевий зарядний пристрій UGREEN Nexode 100 Вт',
    slug: 'charger-ugreen-nexode-100w',
    description:
      'Станція на чотири порти, яка замінює всі блоки на робочому столі. Розподіляє потужність між пристроями сама: ноутбук отримає 65 Вт, а решта піде на телефон і годинник.',
    price: 2299,
    sku: 'CHG-UGR-100W',
    categorySlug: 'wall-chargers',
    brandSlug: 'ugreen',
    specs: {
      'charger-power': '100 Вт',
      'charger-type': 'Мережева',
      ports: 4,
      technology: 'GaN',
    },
    variants: [
      {
        name: 'Мережевий зарядний пристрій UGREEN Nexode 100 Вт',
        price: 2299,
        stock: 9,
        attributes: {},
      },
    ],
  },
  {
    name: 'Мережевий зарядний пристрій Hoco 30 Вт',
    slug: 'charger-hoco-30w',
    description:
      'Бюджетний блок із підтримкою Power Delivery та Quick Charge — підійде і до iPhone, і до Android. Складані контакти не дряпають вміст сумки.',
    price: 399,
    sku: 'CHG-HOC-30W',
    categorySlug: 'wall-chargers',
    brandSlug: 'hoco',
    specs: {
      'charger-power': '30 Вт',
      'charger-type': 'Мережева',
      ports: 2,
      technology: 'Quick Charge',
    },
    variants: [
      { name: 'Мережевий зарядний пристрій Hoco 30 Вт', price: 399, stock: 64, attributes: {} },
    ],
  },
  {
    name: 'Автомобільний зарядний пристрій Baseus 30 Вт',
    slug: 'car-charger-baseus-30w',
    description:
      'Сідає в прикурювач майже врівень із панеллю — не чіпляється за одяг і не стирчить. Два порти означають, що пасажир більше не сперечається за зарядку.',
    price: 449,
    sku: 'CHG-BSU-CAR30',
    categorySlug: 'car-chargers',
    brandSlug: 'baseus',
    specs: {
      'charger-power': '30 Вт',
      'charger-type': 'Автомобільна',
      ports: 2,
      technology: 'Power Delivery',
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'CHG-BSU-CAR30-BK',
        price: 449,
        stock: 50,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Сріблястий',
        slugPart: 'silver',
        sku: 'CHG-BSU-CAR30-SL',
        price: 469,
        stock: 35,
        attributes: { Колір: 'Сріблястий' },
      },
    ],
  },
  {
    name: 'Автомобільний зарядний пристрій Hoco 45 Вт з кабелем USB-C',
    slug: 'car-charger-hoco-45w',
    description:
      "У комплекті вже є кабель USB-C, тож у машині не доведеться нічого докуповувати. Сорока п'яти ват вистачає навіть на планшет під час довгої дороги.",
    price: 599,
    sku: 'CHG-HOC-CAR45',
    categorySlug: 'car-chargers',
    brandSlug: 'hoco',
    specs: {
      'charger-power': '45 Вт',
      'charger-type': 'Автомобільна',
      ports: 2,
      technology: 'Power Delivery',
    },
    variants: [
      {
        name: 'Автомобільний зарядний пристрій Hoco 45 Вт з кабелем USB-C',
        price: 599,
        stock: 4,
        attributes: {},
      },
    ],
  },
  {
    name: 'Бездротова зарядка Belkin BoostCharge MagSafe 15 Вт',
    slug: 'wireless-charger-belkin-magsafe',
    description:
      'Магніти ловлять iPhone із першого разу, тож уранці телефон гарантовано заряджений, а не «майже підключений». Тримає повні 15 Вт — офіційна ліцензія MagSafe, а не просто Qi з магнітом.',
    price: 1799,
    compareAtPrice: 2199,
    sku: 'CHG-BLK-MAG15',
    categorySlug: 'wireless-chargers',
    brandSlug: 'belkin',
    specs: {
      'charger-power': '20 Вт',
      'charger-type': 'Бездротова',
      ports: 1,
      technology: 'MagSafe',
    },
    variants: [
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'CHG-BLK-MAG15-WH',
        price: 1799,
        stock: 18,
        attributes: { Колір: 'Білий' },
      },
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'CHG-BLK-MAG15-BK',
        price: 1799,
        stock: 14,
        attributes: { Колір: 'Чорний' },
      },
    ],
  },
  {
    name: 'Бездротова зарядна станція Baseus 3-в-1',
    slug: 'wireless-charger-baseus-3in1',
    description:
      'Одна підставка на телефон, годинник і навушники — на тумбочці лишається один провід замість трьох. Складається в пласку шайбу і їде з вами у відрядження.',
    price: 1499,
    sku: 'CHG-BSU-3IN1',
    categorySlug: 'wireless-chargers',
    brandSlug: 'baseus',
    specs: {
      'charger-power': '20 Вт',
      'charger-type': 'Бездротова',
      ports: 3,
      technology: 'Qi2',
    },
    variants: [
      { name: 'Бездротова зарядна станція Baseus 3-в-1', price: 1499, stock: 0, attributes: {} },
    ],
  },
];

/** Павербанки — 6 catalogue entries / 9 positions. */
export const powerBanks: CatalogueEntry[] = [
  {
    name: 'Павербанк Anker PowerCore 10000 мА·год',
    slug: 'powerbank-anker-10000',
    description:
      'Два з половиною повні заряди для iPhone у корпусі завбільшки з колоду карт. Anker кладе в комплект тканинний чохол — дрібниця, але павербанк не дряпає екран у сумці.',
    price: 1099,
    compareAtPrice: 1399,
    sku: 'PWB-ANK-10K',
    categorySlug: 'compact-power-banks',
    brandSlug: 'anker',
    specs: {
      capacity: '10000 мА·год',
      'output-power': '20 Вт',
      ports: 'USB-C (вхід/вихід), USB-A',
      passthrough: true,
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'PWB-ANK-10K-BK',
        price: 1099,
        stock: 40,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'PWB-ANK-10K-WH',
        price: 1099,
        stock: 28,
        attributes: { Колір: 'Білий' },
      },
    ],
  },
  {
    name: 'Павербанк Hoco 10000 мА·год із вбудованими кабелями',
    slug: 'powerbank-hoco-10000-cables',
    description:
      'Кабелі USB-C і Lightning заховані просто в корпус, тож забути їх удома фізично неможливо. Під час відключень світла це найчастіша причина повернутися саме за такою моделлю.',
    price: 749,
    sku: 'PWB-HOC-10K',
    categorySlug: 'compact-power-banks',
    brandSlug: 'hoco',
    specs: {
      capacity: '10000 мА·год',
      'output-power': '22.5 Вт',
      ports: 'Вбудовані USB-C і Lightning, USB-A',
      passthrough: false,
    },
    views: ['загальний вигляд', 'вбудовані кабелі'],
    variants: [
      {
        name: 'Павербанк Hoco 10000 мА·год із вбудованими кабелями',
        price: 749,
        stock: 55,
        attributes: {},
      },
    ],
  },
  {
    name: 'Павербанк Baseus 5000 мА·год кишеньковий',
    slug: 'powerbank-baseus-5000',
    description:
      'Важить менше за сто грамів і носиться в кишені джинсів разом із телефоном. Один повний заряд — рівно стільки, скільки треба, щоб дожити до вечора.',
    price: 549,
    sku: 'PWB-BSU-5K',
    categorySlug: 'compact-power-banks',
    brandSlug: 'baseus',
    specs: {
      capacity: '5000 мА·год',
      'output-power': '15 Вт',
      ports: 'USB-C (вхід/вихід)',
      passthrough: false,
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'PWB-BSU-5K-BK',
        price: 549,
        stock: 62,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Синій',
        slugPart: 'blue',
        sku: 'PWB-BSU-5K-BL',
        price: 549,
        stock: 44,
        attributes: { Колір: 'Синій' },
      },
    ],
  },
  {
    name: 'Павербанк UGREEN 20000 мА·год 65 Вт',
    slug: 'powerbank-ugreen-20000',
    description:
      'Заряджає ноутбук на 65 Вт — під час блекауту робочий день не зупиняється. Екран показує залишок у відсотках, а не чотири лампочки, за якими нічого не зрозуміло.',
    price: 2299,
    sku: 'PWB-UGR-20K',
    categorySlug: 'high-capacity-power-banks',
    brandSlug: 'ugreen',
    specs: {
      capacity: '20000 мА·год',
      'output-power': '65 Вт',
      ports: '2 × USB-C, USB-A',
      passthrough: true,
    },
    variants: [
      { name: 'Павербанк UGREEN 20000 мА·год 65 Вт', price: 2299, stock: 16, attributes: {} },
    ],
  },
  {
    name: 'Павербанк Anker 26800 мА·год 100 Вт',
    slug: 'powerbank-anker-26800',
    description:
      'Верхня межа того, що ще дозволено брати в ручну поклажу літака. Живить ноутбук, роутер і кілька телефонів — типовий набір домашнього «острівця живлення».',
    price: 3999,
    sku: 'PWB-ANK-26K',
    categorySlug: 'high-capacity-power-banks',
    brandSlug: 'anker',
    specs: {
      capacity: '26800 мА·год',
      'output-power': '100 Вт',
      ports: '2 × USB-C, 2 × USB-A',
      passthrough: true,
    },
    views: ['загальний вигляд', 'порти зблизька', 'екран заряду'],
    variants: [
      { name: 'Павербанк Anker 26800 мА·год 100 Вт', price: 3999, stock: 3, attributes: {} },
    ],
  },
  {
    name: 'MagSafe-павербанк Baseus 10000 мА·год',
    slug: 'powerbank-baseus-magsafe-10000',
    description:
      'Чіпляється до спинки iPhone магнітом і заряджає без жодного кабелю — телефоном можна користуватися на ходу. Відкидна ніжка перетворює його на підставку для перегляду відео.',
    price: 1699,
    compareAtPrice: 1999,
    sku: 'PWB-BSU-MAG10K',
    categorySlug: 'magsafe-power-banks',
    brandSlug: 'baseus',
    specs: {
      capacity: '10000 мА·год',
      'output-power': '20 Вт',
      ports: 'USB-C (вхід/вихід), бездротовий MagSafe 15 Вт',
      passthrough: true,
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'PWB-BSU-MAG10K-BK',
        price: 1699,
        stock: 22,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'PWB-BSU-MAG10K-WH',
        price: 1699,
        stock: 0,
        attributes: { Колір: 'Білий' },
      },
    ],
  },
];
