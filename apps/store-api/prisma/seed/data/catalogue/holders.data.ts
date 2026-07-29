import type { CatalogueEntry } from '../../types';

/** Тримачі та підставки — 7 catalogue entries / 12 positions. */
export const holders: CatalogueEntry[] = [
  {
    name: 'Автотримач Baseus магнітний на дефлектор',
    slug: 'holder-baseus-magnetic-vent',
    description:
      'Шість неодимових магнітів тримають навіть великий телефон у чохлі — на ямах нічого не зривається. Кріпиться на решітку дефлектора, тож телефон обдувається і не перегрівається влітку.',
    price: 449,
    compareAtPrice: 599,
    sku: 'HLD-BSU-VENT',
    categorySlug: 'car-holders',
    brandSlug: 'baseus',
    specs: {
      mount: 'Дефлектор',
      fixation: 'Магніт',
      'holder-material': 'Алюміній',
      rotation: 'Поворот на 360°, нахил у двох площинах',
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'HLD-BSU-VENT-BK',
        price: 449,
        stock: 45,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Сріблястий',
        slugPart: 'silver',
        sku: 'HLD-BSU-VENT-SL',
        price: 469,
        stock: 32,
        attributes: { Колір: 'Сріблястий' },
      },
    ],
  },
  {
    name: 'Автотримач Hoco із затискачем на лобове скло',
    slug: 'holder-hoco-clamp-windshield',
    description:
      'Телескопічна штанга виносить телефон ближче до водія — навігацію видно, не відриваючи очей від дороги. Присоска на гелевій основі тримається на склі й на пластику панелі.',
    price: 349,
    sku: 'HLD-HOC-WS',
    categorySlug: 'car-holders',
    brandSlug: 'hoco',
    specs: {
      mount: 'Лобове скло',
      fixation: 'Присоска',
      'holder-material': 'Пластик',
      rotation: 'Поворот на 360°, штанга 12–20 см',
    },
    variants: [
      {
        name: 'Автотримач Hoco із затискачем на лобове скло',
        price: 349,
        stock: 38,
        attributes: {},
      },
    ],
  },
  {
    name: 'Автотримач Belkin MagSafe на панель',
    slug: 'holder-belkin-magsafe-dash',
    description:
      'Офіційний MagSafe: магніт сильніший за універсальні аналоги, iPhone стає на місце з характерним клацанням. Клейова основа 3M тримає на панелі роками і знімається без слідів.',
    price: 1299,
    sku: 'HLD-BLK-DASH',
    categorySlug: 'car-holders',
    brandSlug: 'belkin',
    specs: {
      mount: 'Панель',
      fixation: 'MagSafe',
      'holder-material': 'Пластик',
      rotation: 'Нахил у діапазоні 30°',
    },
    variants: [
      { name: 'Автотримач Belkin MagSafe на панель', price: 1299, stock: 6, attributes: {} },
    ],
  },
  {
    name: 'Настільна підставка UGREEN для телефона',
    slug: 'stand-ugreen-desk',
    description:
      'Суцільний алюміній із силіконовими накладками — телефон не ковзає і не дряпається. Кут нахилу регулюється так, що Face ID спрацьовує, поки телефон стоїть на столі.',
    price: 549,
    compareAtPrice: 699,
    sku: 'STN-UGR-DESK',
    categorySlug: 'desk-stands',
    brandSlug: 'ugreen',
    specs: {
      mount: 'Стіл',
      fixation: 'Затискач',
      'holder-material': 'Алюміній',
      rotation: 'Регульований кут нахилу 15–75°',
    },
    variants: [
      {
        name: 'Сріблястий',
        slugPart: 'silver',
        sku: 'STN-UGR-DESK-SL',
        price: 549,
        stock: 28,
        attributes: { Колір: 'Сріблястий' },
      },
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'STN-UGR-DESK-BK',
        price: 549,
        stock: 20,
        attributes: { Колір: 'Чорний' },
      },
    ],
  },
  {
    name: 'Складана настільна підставка Baseus',
    slug: 'stand-baseus-foldable',
    description:
      'Складається в пластину завтовшки з олівець і возиться в кишені ноутбучної сумки. Розкладається у три положення — від майже горизонтального для набору тексту до вертикального для відеодзвінків.',
    price: 399,
    sku: 'STN-BSU-FOLD',
    categorySlug: 'desk-stands',
    brandSlug: 'baseus',
    specs: {
      mount: 'Стіл',
      fixation: 'Затискач',
      'holder-material': 'Алюміній',
      rotation: 'Три фіксовані положення',
    },
    variants: [
      { name: 'Складана настільна підставка Baseus', price: 399, stock: 1, attributes: {} },
    ],
  },
  {
    name: 'Магнітне кільце-тримач MagSafe',
    slug: 'grip-magsafe-ring',
    description:
      'Кільце тримається на магнітах, тож його можна зняти, коли телефон лягає на бездротову зарядку. Складається врівень зі спинкою — у кишені нічого не випинається.',
    price: 449,
    sku: 'GRP-MAG-RING',
    categorySlug: 'phone-grips',
    brandSlug: 'spigen',
    specs: {
      mount: 'Корпус телефона',
      fixation: 'MagSafe',
      'holder-material': 'Алюміній',
      rotation: 'Кільце обертається на 360°, відкидається на 180°',
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'GRP-MAG-RING-BK',
        price: 449,
        stock: 34,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Сріблястий',
        slugPart: 'silver',
        sku: 'GRP-MAG-RING-SL',
        price: 449,
        stock: 25,
        attributes: { Колір: 'Сріблястий' },
      },
      {
        name: 'Синій',
        slugPart: 'blue',
        sku: 'GRP-MAG-RING-BL',
        price: 449,
        stock: 12,
        attributes: { Колір: 'Синій' },
      },
    ],
  },
  {
    name: 'Попсокет-тримач Remax',
    slug: 'grip-remax-popsocket',
    description:
      'Приклеюється до чохла і рятує телефон від падінь, коли тягнешся пальцем до верхнього краю екрана. У розкладеному вигляді працює як підставка для перегляду відео.',
    price: 199,
    sku: 'GRP-RMX-POP',
    categorySlug: 'phone-grips',
    brandSlug: 'remax',
    specs: {
      mount: 'Корпус телефона',
      fixation: 'Затискач',
      'holder-material': 'Пластик',
      rotation: 'Складається у три положення',
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'GRP-RMX-POP-BK',
        price: 199,
        stock: 70,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'GRP-RMX-POP-WH',
        price: 199,
        stock: 0,
        attributes: { Колір: 'Білий' },
      },
    ],
  },
];
