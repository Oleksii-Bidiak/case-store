import type { CatalogueEntry } from '../../types';

/** Навушники — 9 catalogue entries / 15 positions. */
export const headphones: CatalogueEntry[] = [
  {
    name: 'Навушники Apple AirPods Pro 2',
    slug: 'headphones-apple-airpods-pro-2',
    description:
      'Шумозаглушення, яке справді вимикає метро, і «прозорий режим», що пропускає оголошення на пероні. Керуються дотиком до ніжки: гучність підбирається пальцем, без телефона в руках.',
    price: 9999,
    compareAtPrice: 11499,
    sku: 'HP-APL-APP2',
    categorySlug: 'tws-earbuds',
    brandSlug: 'apple',
    metaTitle: 'Купити Apple AirPods Pro 2 — ціна в Україні',
    metaDescription:
      'Apple AirPods Pro 2: активне шумозаглушення, прозорий режим, до 30 годин із кейсом. Офіційна гарантія.',
    specs: {
      'headphone-type': 'Вкладиші TWS',
      connection: 'Bluetooth',
      playtime: 30,
      anc: true,
    },
    views: ['загальний вигляд', 'кейс для заряджання'],
    variants: [{ name: 'Навушники Apple AirPods Pro 2', price: 9999, stock: 15, attributes: {} }],
  },
  {
    name: 'Навушники Apple AirPods 4',
    slug: 'headphones-apple-airpods-4',
    description:
      'Відкрита посадка без силіконових вкладок — вуха не втомлюються за цілий робочий день. Перемикаються між iPhone, iPad і Mac самі, щойно ви вмикаєте відтворення.',
    price: 6999,
    sku: 'HP-APL-AP4',
    categorySlug: 'tws-earbuds',
    brandSlug: 'apple',
    specs: {
      'headphone-type': 'Вкладиші TWS',
      connection: 'Bluetooth',
      playtime: 30,
      anc: false,
    },
    variants: [{ name: 'Навушники Apple AirPods 4', price: 6999, stock: 20, attributes: {} }],
  },
  {
    name: 'Навушники Samsung Galaxy Buds3',
    slug: 'headphones-samsung-galaxy-buds3',
    description:
      'Ніжка з підсвіткою і сенсорна панель, яка реагує на щипок, а не на постукування — випадкових натискань помітно менше. У парі з Galaxy вмикають переклад розмови просто в навушниках.',
    price: 5499,
    compareAtPrice: 6499,
    sku: 'HP-SAM-BUDS3',
    categorySlug: 'tws-earbuds',
    brandSlug: 'samsung',
    specs: {
      'headphone-type': 'Вкладиші TWS',
      connection: 'Bluetooth',
      playtime: 24,
      anc: true,
    },
    variants: [
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'HP-SAM-BUDS3-WH',
        price: 5499,
        stock: 24,
        attributes: { Колір: 'Білий' },
      },
      {
        name: 'Сріблястий',
        slugPart: 'silver',
        sku: 'HP-SAM-BUDS3-SL',
        price: 5499,
        stock: 17,
        attributes: { Колір: 'Сріблястий' },
      },
    ],
  },
  {
    name: 'Навушники Xiaomi Redmi Buds 5',
    slug: 'headphones-xiaomi-redmi-buds-5',
    description:
      'Найдешевший вхід у світ активного шумозаглушення: тиша в маршрутці за ціну однієї вечері. Тримають десять годин без кейса — робочий тиждень із однією зарядкою.',
    price: 1299,
    sku: 'HP-XIA-RB5',
    categorySlug: 'tws-earbuds',
    brandSlug: 'xiaomi',
    specs: {
      'headphone-type': 'Вкладиші TWS',
      connection: 'Bluetooth',
      playtime: 38,
      anc: true,
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'HP-XIA-RB5-BK',
        price: 1299,
        stock: 46,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'HP-XIA-RB5-WH',
        price: 1299,
        stock: 38,
        attributes: { Колір: 'Білий' },
      },
    ],
  },
  {
    name: 'Навушники Hoco EW11 TWS',
    slug: 'headphones-hoco-ew11',
    description:
      'Проста бездротова пара для спорту й дороги, яку не шкода загубити. Кейс заряджається через USB-C, а не через micro-USB, як більшість моделей у цій ціні.',
    price: 599,
    sku: 'HP-HOC-EW11',
    categorySlug: 'tws-earbuds',
    brandSlug: 'hoco',
    specs: {
      'headphone-type': 'Вкладиші TWS',
      connection: 'Bluetooth',
      playtime: 18,
      anc: false,
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'HP-HOC-EW11-BK',
        price: 599,
        stock: 80,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'HP-HOC-EW11-WH',
        price: 599,
        stock: 65,
        attributes: { Колір: 'Білий' },
      },
    ],
  },
  {
    name: 'Навушники Sony WH-1000XM5',
    slug: 'headphones-sony-wh1000xm5',
    description:
      'Еталон шумозаглушення серед повнорозмірних моделей: вісім мікрофонів прибирають гул літака майже повністю. Тридцять годин роботи означають переліт через океан і назад без розетки.',
    price: 14999,
    compareAtPrice: 17999,
    sku: 'HP-SNY-XM5',
    categorySlug: 'over-ear-headphones',
    brandSlug: 'sony',
    metaTitle: 'Купити Sony WH-1000XM5 — ціна в Україні',
    metaDescription:
      'Sony WH-1000XM5: провідне шумозаглушення, 30 годин автономності, швидке заряджання. Офіційна гарантія.',
    specs: {
      'headphone-type': 'Повнорозмірні',
      connection: 'Bluetooth',
      playtime: 30,
      anc: true,
    },
    views: ['загальний вигляд', 'складені навушники', 'амбушури зблизька'],
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'HP-SNY-XM5-BK',
        price: 14999,
        stock: 8,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Сріблястий',
        slugPart: 'silver',
        sku: 'HP-SNY-XM5-SL',
        price: 14999,
        stock: 5,
        attributes: { Колір: 'Сріблястий' },
      },
    ],
  },
  {
    name: 'Навушники JBL Tune 720BT',
    slug: 'headphones-jbl-tune-720bt',
    description:
      'Фірмовий бас JBL і сімдесят шість годин роботи — заряджати доводиться раз на місяць. Складаються в пласку конструкцію і кладуться в рюкзак поруч із ноутбуком.',
    price: 2999,
    sku: 'HP-JBL-720BT',
    categorySlug: 'over-ear-headphones',
    brandSlug: 'jbl',
    specs: {
      'headphone-type': 'Накладні',
      connection: 'Bluetooth',
      playtime: 76,
      anc: false,
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'HP-JBL-720BT-BK',
        price: 2999,
        stock: 26,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Синій',
        slugPart: 'blue',
        sku: 'HP-JBL-720BT-BL',
        price: 2999,
        stock: 19,
        attributes: { Колір: 'Синій' },
      },
    ],
  },
  {
    name: 'Дротові навушники Apple EarPods з USB-C',
    slug: 'headphones-apple-earpods-usbc',
    description:
      'Нуль затримки й нуль заряджання — саме те, що потрібно для дзвінків і монтажу. Пульт на дроті керує гучністю та відповідає на виклики без телефона в руці.',
    price: 999,
    sku: 'HP-APL-EPUSBC',
    categorySlug: 'wired-headphones',
    brandSlug: 'apple',
    specs: {
      'headphone-type': 'Внутрішньоканальні дротові',
      connection: 'USB-C',
      anc: false,
    },
    variants: [
      { name: 'Дротові навушники Apple EarPods з USB-C', price: 999, stock: 34, attributes: {} },
    ],
  },
  {
    name: "Дротові навушники Hoco M1 з роз'ємом 3.5 мм",
    slug: 'headphones-hoco-m1-jack',
    description:
      'Класична «затичка» для старого телефона, планшета чи ноутбука. Плаский кабель не заплутується в кишені, а мікрофон достатньо чутливий для робочих дзвінків.',
    price: 249,
    sku: 'HP-HOC-M1',
    categorySlug: 'wired-headphones',
    brandSlug: 'hoco',
    specs: {
      'headphone-type': 'Внутрішньоканальні дротові',
      connection: '3.5 мм',
      anc: false,
    },
    variants: [
      {
        name: 'Білий',
        slugPart: 'white',
        sku: 'HP-HOC-M1-WH',
        price: 249,
        stock: 95,
        attributes: { Колір: 'Білий' },
      },
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'HP-HOC-M1-BK',
        price: 249,
        stock: 0,
        attributes: { Колір: 'Чорний' },
      },
    ],
  },
];

/** Портативні колонки — 5 catalogue entries / 8 positions. */
export const speakers: CatalogueEntry[] = [
  {
    name: 'Портативна колонка JBL Go 4',
    slug: 'speaker-jbl-go-4',
    description:
      'Вміщається в долоню, важить менше за смартфон і чіпляється карабіном до рюкзака. Захист IP67 означає, що її можна взяти на пляж і не берегти від бризок.',
    price: 1799,
    compareAtPrice: 2099,
    sku: 'SPK-JBL-GO4',
    categorySlug: 'compact-speakers',
    brandSlug: 'jbl',
    specs: {
      power: '5 Вт',
      'water-protection': 'IP67',
      playtime: 7,
      bluetooth: '5.3',
    },
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'SPK-JBL-GO4-BK',
        price: 1799,
        stock: 30,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Синій',
        slugPart: 'blue',
        sku: 'SPK-JBL-GO4-BL',
        price: 1799,
        stock: 22,
        attributes: { Колір: 'Синій' },
      },
      {
        name: 'Червоний',
        slugPart: 'red',
        sku: 'SPK-JBL-GO4-RD',
        price: 1799,
        stock: 14,
        attributes: { Колір: 'Червоний' },
      },
    ],
  },
  {
    name: 'Портативна колонка JBL Flip 6',
    slug: 'speaker-jbl-flip-6',
    description:
      'Двосмугова акустика з окремим твітером — голос у подкастах звучить розбірливо, а не «з бочки». Дванадцять годин роботи витягують цілий день на дачі.',
    price: 4499,
    sku: 'SPK-JBL-FLIP6',
    categorySlug: 'compact-speakers',
    brandSlug: 'jbl',
    specs: {
      power: '30 Вт',
      'water-protection': 'IP67',
      playtime: 12,
      bluetooth: '5.1',
    },
    views: ['загальний вигляд', 'вигляд збоку'],
    variants: [
      {
        name: 'Чорний',
        slugPart: 'black',
        sku: 'SPK-JBL-FLIP6-BK',
        price: 4499,
        stock: 16,
        attributes: { Колір: 'Чорний' },
      },
      {
        name: 'Блакитний',
        slugPart: 'blue',
        sku: 'SPK-JBL-FLIP6-BL',
        price: 4499,
        stock: 11,
        attributes: { Колір: 'Блакитний' },
      },
    ],
  },
  {
    name: 'Портативна колонка Sony SRS-XB100',
    slug: 'speaker-sony-srs-xb100',
    description:
      'Циліндр, який звучить рівномірно на всі боки — зручно ставити посеред столу. Шістнадцять годин автономності й ремінець, щоб повісити на гілку чи на ручку сумки.',
    price: 2199,
    sku: 'SPK-SNY-XB100',
    categorySlug: 'compact-speakers',
    brandSlug: 'sony',
    specs: {
      power: '10 Вт',
      'water-protection': 'IP67',
      playtime: 16,
      bluetooth: '5.3',
    },
    variants: [
      { name: 'Портативна колонка Sony SRS-XB100', price: 2199, stock: 2, attributes: {} },
    ],
  },
  {
    name: 'Портативна колонка JBL PartyBox Encore Essential',
    slug: 'speaker-jbl-partybox-encore',
    description:
      'Сто ват і світлова панель, синхронізована з музикою — двір чути через квартал. У комплекті вхід для мікрофона, тож колонка одразу готова до караоке.',
    price: 12999,
    compareAtPrice: 14999,
    sku: 'SPK-JBL-PBOX',
    categorySlug: 'party-speakers',
    brandSlug: 'jbl',
    specs: {
      power: '80 Вт',
      'water-protection': 'IPX4',
      playtime: 6,
      bluetooth: '5.1',
    },
    views: ['загальний вигляд', 'підсвітка', 'панель керування'],
    variants: [
      {
        name: 'Портативна колонка JBL PartyBox Encore Essential',
        price: 12999,
        stock: 4,
        attributes: {},
      },
    ],
  },
  {
    name: 'Портативна колонка Xiaomi Sound Move',
    slug: 'speaker-xiaomi-sound-move',
    description:
      'Сорок ват у корпусі, який ще можна нести однією рукою — компроміс між кишеньковою і вечірковою. Дві колонки паруються в стереопару однією кнопкою.',
    price: 3999,
    sku: 'SPK-XIA-MOVE',
    categorySlug: 'party-speakers',
    brandSlug: 'xiaomi',
    specs: {
      power: '40 Вт',
      'water-protection': 'IPX5',
      playtime: 12,
      bluetooth: '5.4',
    },
    variants: [
      { name: 'Портативна колонка Xiaomi Sound Move', price: 3999, stock: 0, attributes: {} },
    ],
  },
];
