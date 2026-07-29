import type { CatalogueEntry } from '../../types';

/**
 * Захисне скло та плівки — 8 catalogue entries / 14 positions.
 *
 * Pack sizes ride the «Комплект» axis rather than the `pack-size` spec: the spec
 * is a NUMBER with the unit «шт», so an axis value of «2 шт» would render as
 * «2 шт шт» on the PDP. Entries with one fixed pack size still carry the spec.
 */
export const protection: CatalogueEntry[] = [
  {
    name: 'Захисне скло 9H для iPhone 15 з рамкою для наклеювання',
    slug: 'glass-9h-iphone-15',
    description:
      'У комплекті пластикова рамка-позиціонер: скло лягає рівно з першого разу, без бульбашок і зсувів. Олеофобне покриття тримає відбитки пальців на відстані, а палець ковзає так само, як по «голому» екрану.',
    price: 349,
    compareAtPrice: 449,
    sku: 'SP-GL-IP15',
    categorySlug: 'tempered-glass',
    brandSlug: 'spigen',
    specs: {
      'protector-type': 'Гартоване скло',
      coverage: 'Увесь екран (Full Glue)',
      hardness: '9H, товщина 0.33 мм',
    },
    views: ['загальний вигляд', 'рамка для наклеювання'],
    variants: [
      {
        name: '1 шт',
        slugPart: '1pcs',
        sku: 'SP-GL-IP15-1',
        price: 349,
        stock: 60,
        attributes: { Комплект: '1 шт' },
      },
      {
        name: '2 шт',
        slugPart: '2pcs',
        sku: 'SP-GL-IP15-2',
        price: 549,
        stock: 35,
        attributes: { Комплект: '2 шт' },
      },
    ],
  },
  {
    name: 'Захисне скло Baseus 9H для iPhone 15 Pro',
    slug: 'glass-9h-iphone-15-pro',
    description:
      'Скло з чорною рамкою по краю, що ховає перехід між захистом і корпусом. Клей нанесений на всю площу, тож краї не відходять і під ними не збирається пил.',
    price: 299,
    sku: 'SP-GL-IP15P',
    categorySlug: 'tempered-glass',
    brandSlug: 'baseus',
    specs: {
      'protector-type': 'Гартоване скло',
      coverage: 'Увесь екран (Full Glue)',
      hardness: '9H, товщина 0.3 мм',
    },
    variants: [
      {
        name: '1 шт',
        slugPart: '1pcs',
        sku: 'SP-GL-IP15P-1',
        price: 299,
        stock: 55,
        attributes: { Комплект: '1 шт' },
      },
      {
        name: '2 шт',
        slugPart: '2pcs',
        sku: 'SP-GL-IP15P-2',
        price: 479,
        stock: 40,
        attributes: { Комплект: '2 шт' },
      },
    ],
  },
  {
    name: 'Захисне скло Spigen для Samsung Galaxy S24',
    slug: 'glass-9h-galaxy-s24',
    description:
      'Два скла в коробці — одне наклеюєте зараз, друге лишається про запас. Вирізи під сканер відбитка під екраном зроблені так, що розблокування працює без перенавчання пальця.',
    price: 329,
    sku: 'SP-GL-SGS24',
    categorySlug: 'tempered-glass',
    brandSlug: 'spigen',
    specs: {
      'protector-type': 'Гартоване скло',
      coverage: 'Увесь екран (Full Glue)',
      hardness: '9H, товщина 0.33 мм',
      'pack-size': 2,
    },
    variants: [
      { name: 'Захисне скло Spigen для Samsung Galaxy S24', price: 329, stock: 48, attributes: {} },
    ],
  },
  {
    name: 'Захисне скло Hoco для Redmi Note 13 Pro',
    slug: 'glass-9h-redmi-note-13-pro',
    description:
      'Найпростіший спосіб закрити великий екран Redmi за ціну кави. Твердість 9H витримує ключі й монети в кишені; за потреби скло знімається без слідів клею.',
    price: 199,
    sku: 'SP-GL-RN13P',
    categorySlug: 'tempered-glass',
    brandSlug: 'hoco',
    specs: {
      'protector-type': 'Гартоване скло',
      coverage: 'Увесь екран (Full Glue)',
      hardness: '9H, товщина 0.3 мм',
    },
    variants: [
      {
        name: '1 шт',
        slugPart: '1pcs',
        sku: 'SP-GL-RN13P-1',
        price: 199,
        stock: 70,
        attributes: { Комплект: '1 шт' },
      },
      {
        name: '2 шт',
        slugPart: '2pcs',
        sku: 'SP-GL-RN13P-2',
        price: 319,
        stock: 45,
        attributes: { Комплект: '2 шт' },
      },
      {
        name: '3 шт',
        slugPart: '3pcs',
        sku: 'SP-GL-RN13P-3',
        price: 429,
        stock: 20,
        attributes: { Комплект: '3 шт' },
      },
    ],
  },
  {
    name: 'Гідрогелева плівка для iPhone 15 Pro Max',
    slug: 'hydrogel-iphone-15-pro-max',
    description:
      'Плівка тягнеться і лягає на самі краї екрана, куди жорстке скло не дістає. Дрібні подряпини затягуються самі за добу — матеріал відновлює структуру.',
    price: 249,
    sku: 'SP-HG-IP15PM',
    categorySlug: 'hydrogel-films',
    brandSlug: 'remax',
    specs: {
      'protector-type': 'Гідрогелева плівка',
      coverage: 'Увесь екран (Full Glue)',
      hardness: 'Самовідновлення подряпин, товщина 0.15 мм',
    },
    variants: [
      {
        name: '1 шт',
        slugPart: '1pcs',
        sku: 'SP-HG-IP15PM-1',
        price: 249,
        stock: 33,
        attributes: { Комплект: '1 шт' },
      },
      {
        name: '2 шт',
        slugPart: '2pcs',
        sku: 'SP-HG-IP15PM-2',
        price: 399,
        stock: 25,
        attributes: { Комплект: '2 шт' },
      },
    ],
  },
  {
    name: 'Гідрогелева плівка для Galaxy S24 Ultra',
    slug: 'hydrogel-galaxy-s24-ultra',
    description:
      "Матовий варіант для тих, кого дратують відблиски на великому екрані. Стилус S Pen ковзає по плівці м'якше, ніж по склу, і не цокає.",
    price: 269,
    sku: 'SP-HG-SGS24U',
    categorySlug: 'hydrogel-films',
    brandSlug: 'remax',
    specs: {
      'protector-type': 'Гідрогелева плівка',
      coverage: 'Увесь екран (Full Glue)',
      hardness: 'Матове антивідблискове покриття',
      'pack-size': 1,
    },
    variants: [
      { name: 'Гідрогелева плівка для Galaxy S24 Ultra', price: 269, stock: 3, attributes: {} },
    ],
  },
  {
    name: 'Захисне скло на камеру iPhone 15 Pro',
    slug: 'camera-glass-iphone-15-pro',
    description:
      "Три окремі кільця на кожен об'єктив замість суцільної пластини — спалах не засвічує кадр. Скло не заважає макрозйомці та автофокусу.",
    price: 199,
    sku: 'SP-CAM-IP15P',
    categorySlug: 'camera-protectors',
    brandSlug: 'nillkin',
    specs: {
      'protector-type': 'Скло на камеру',
      coverage: 'Модуль камери',
      hardness: "9H, окремі кільця на кожен об'єктив",
    },
    variants: [
      {
        name: '1 шт',
        slugPart: '1pcs',
        sku: 'SP-CAM-IP15P-1',
        price: 199,
        stock: 42,
        attributes: { Комплект: '1 шт' },
      },
      {
        name: '2 шт',
        slugPart: '2pcs',
        sku: 'SP-CAM-IP15P-2',
        price: 329,
        stock: 0,
        attributes: { Комплект: '2 шт' },
      },
    ],
  },
  {
    name: 'Захисне скло на камеру Galaxy S24',
    slug: 'camera-glass-galaxy-s24',
    description:
      "Суцільна пластина, яка закриває всі три об'єктиви одразу і сідає в штатний бортик корпусу. Виручає тих, хто кладе телефон камерою на стіл.",
    price: 179,
    sku: 'SP-CAM-SGS24',
    categorySlug: 'camera-protectors',
    brandSlug: 'hoco',
    specs: {
      'protector-type': 'Скло на камеру',
      coverage: 'Модуль камери',
      hardness: '9H, суцільна пластина',
      'pack-size': 2,
    },
    variants: [{ name: 'Захисне скло на камеру Galaxy S24', price: 179, stock: 0, attributes: {} }],
  },
];
