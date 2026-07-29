import type { CatalogueEntry } from '../../types';

/** Карти пам'яті та флешки — 6 catalogue entries / 13 positions. */
export const storage: CatalogueEntry[] = [
  {
    name: "Карта пам'яті SanDisk Extreme microSDXC",
    slug: 'memory-sandisk-extreme-microsd',
    description:
      'Клас V30 витягує запис 4K без пропущених кадрів — саме те, чого вимагають екшн-камери й дрони. У комплекті йде адаптер на повнорозмірний SD, тож карту одразу видно ноутбуку.',
    price: 599,
    compareAtPrice: 749,
    sku: 'MEM-SDK-EXT',
    categorySlug: 'microsd-cards',
    brandSlug: 'sandisk',
    specs: {
      'speed-class': 'V30',
      'read-speed': 190,
      interface: 'microSDXC',
    },
    variants: [
      {
        name: '64 ГБ',
        slugPart: '64gb',
        sku: 'MEM-SDK-EXT-64',
        price: 599,
        stock: 60,
        attributes: { "Об'єм": '64 ГБ' },
      },
      {
        name: '128 ГБ',
        slugPart: '128gb',
        sku: 'MEM-SDK-EXT-128',
        price: 899,
        stock: 45,
        attributes: { "Об'єм": '128 ГБ' },
      },
      {
        name: '256 ГБ',
        slugPart: '256gb',
        sku: 'MEM-SDK-EXT-256',
        price: 1499,
        stock: 28,
        attributes: { "Об'єм": '256 ГБ' },
      },
      {
        name: '512 ГБ',
        slugPart: '512gb',
        sku: 'MEM-SDK-EXT-512',
        price: 2499,
        stock: 14,
        attributes: { "Об'єм": '512 ГБ' },
      },
    ],
  },
  {
    name: "Карта пам'яті Samsung EVO Plus microSDXC",
    slug: 'memory-samsung-evo-plus-microsd',
    description:
      'Робоча карта на щодень: фото, музика, ігри на консолі — усе відкривається без затримок. Переживає воду, магніти й рентген в аеропорту, що виробник перевіряє окремими тестами.',
    price: 449,
    sku: 'MEM-SAM-EVO',
    categorySlug: 'microsd-cards',
    brandSlug: 'samsung',
    specs: {
      'speed-class': 'U3',
      'read-speed': 160,
      interface: 'microSDXC',
    },
    variants: [
      {
        name: '128 ГБ',
        slugPart: '128gb',
        sku: 'MEM-SAM-EVO-128',
        price: 449,
        stock: 52,
        attributes: { "Об'єм": '128 ГБ' },
      },
      {
        name: '256 ГБ',
        slugPart: '256gb',
        sku: 'MEM-SAM-EVO-256',
        price: 799,
        stock: 30,
        attributes: { "Об'єм": '256 ГБ' },
      },
    ],
  },
  {
    name: "Карта пам'яті Hoco microSDXC 128 ГБ",
    slug: 'memory-hoco-microsd-128',
    description:
      "Найдешевший спосіб розширити пам'ять реєстратора чи старого планшета. Клас 10 достатній для запису Full HD — від неї не варто чекати 4K, і в цьому вся чесність цінника.",
    price: 299,
    sku: 'MEM-HOC-128',
    categorySlug: 'microsd-cards',
    brandSlug: 'hoco',
    specs: {
      capacity: '128 ГБ',
      'speed-class': 'Class 10',
      'read-speed': 80,
      interface: 'microSDXC',
    },
    variants: [
      { name: "Карта пам'яті Hoco microSDXC 128 ГБ", price: 299, stock: 0, attributes: {} },
    ],
  },
  {
    name: 'USB-флешка SanDisk Ultra USB 3.2',
    slug: 'usb-sandisk-ultra',
    description:
      "Висувний роз'єм без ковпачка, який неможливо загубити. Швидкість читання 130 МБ/с означає, що фільм переписується швидше, ніж встигає закипіти чайник.",
    price: 349,
    sku: 'USB-SDK-ULT',
    categorySlug: 'usb-drives',
    brandSlug: 'sandisk',
    specs: {
      'speed-class': 'USB 3.2',
      'read-speed': 130,
      interface: 'USB-A 3.2',
    },
    variants: [
      {
        name: '64 ГБ',
        slugPart: '64gb',
        sku: 'USB-SDK-ULT-64',
        price: 349,
        stock: 48,
        attributes: { "Об'єм": '64 ГБ' },
      },
      {
        name: '128 ГБ',
        slugPart: '128gb',
        sku: 'USB-SDK-ULT-128',
        price: 549,
        stock: 33,
        attributes: { "Об'єм": '128 ГБ' },
      },
      {
        name: '256 ГБ',
        slugPart: '256gb',
        sku: 'USB-SDK-ULT-256',
        price: 899,
        stock: 19,
        attributes: { "Об'єм": '256 ГБ' },
      },
    ],
  },
  {
    name: 'USB-флешка UGREEN USB-A + USB-C',
    slug: 'usb-ugreen-dual',
    description:
      "Два роз'єми на одному корпусі: файли з телефона перекидаються на ноутбук без перехідників. Металевий корпус із отвором під шнурок — флешка живе на в'язці ключів.",
    price: 799,
    sku: 'USB-UGR-DUAL',
    categorySlug: 'usb-drives',
    brandSlug: 'ugreen',
    specs: {
      'speed-class': 'USB 3.2',
      'read-speed': 150,
      interface: 'USB-A + USB-C',
    },
    views: ['загальний вигляд', "обидва роз'єми"],
    variants: [
      {
        name: '128 ГБ',
        slugPart: '128gb',
        sku: 'USB-UGR-DUAL-128',
        price: 799,
        stock: 22,
        attributes: { "Об'єм": '128 ГБ' },
      },
      {
        name: '256 ГБ',
        slugPart: '256gb',
        sku: 'USB-UGR-DUAL-256',
        price: 1199,
        stock: 2,
        attributes: { "Об'єм": '256 ГБ' },
      },
    ],
  },
  {
    name: 'USB-флешка Xiaomi 512 ГБ USB 3.2',
    slug: 'usb-xiaomi-512',
    description:
      'Півтерабайта в корпусі завбільшки із запальничку — переносний архів для фото й проєктів. Алюмінієвий корпус помітно гріється під довгим записом, і це нормально для таких швидкостей.',
    price: 1299,
    sku: 'USB-XIA-512',
    categorySlug: 'usb-drives',
    brandSlug: 'xiaomi',
    specs: {
      capacity: '512 ГБ',
      'speed-class': 'USB 3.2',
      'read-speed': 400,
      interface: 'USB-C 3.2',
    },
    variants: [{ name: 'USB-флешка Xiaomi 512 ГБ USB 3.2', price: 1299, stock: 9, attributes: {} }],
  },
];
