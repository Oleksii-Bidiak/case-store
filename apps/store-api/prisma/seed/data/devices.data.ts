/**
 * Admin copy for a model's compatibility landing pages (TASK-490). The storefront
 * renders `metaTitle` verbatim and one model's copy is shared by every category
 * page it appears on, so it is category-neutral and names the store. Lengths stay
 * within `CreateDeviceModelDto` (255 / 500 / 2000), and the title within the
 * ~60-character budget meta-titles.data.spec.ts checks.
 */
export interface DeviceSeo {
  metaTitle: string;
  metaDescription: string;
  description: string;
}

// brand → ordered list of { name, series, releaseYear, seo? } models.
export const devices: Array<{
  brand: string;
  sortOrder: number;
  models: Array<{ name: string; series: string; releaseYear: number; seo?: DeviceSeo }>;
}> = [
  {
    brand: 'Apple',
    sortOrder: 1,
    models: [
      // iPhone 16 series
      { name: 'iPhone 16 Pro Max', series: 'iPhone 16', releaseYear: 2024 },
      { name: 'iPhone 16 Pro', series: 'iPhone 16', releaseYear: 2024 },
      { name: 'iPhone 16 Plus', series: 'iPhone 16', releaseYear: 2024 },
      { name: 'iPhone 16', series: 'iPhone 16', releaseYear: 2024 },
      // iPhone 15 series
      { name: 'iPhone 15 Pro Max', series: 'iPhone 15', releaseYear: 2023 },
      {
        name: 'iPhone 15 Pro',
        series: 'iPhone 15',
        releaseYear: 2023,
        seo: {
          metaTitle: 'Аксесуари для iPhone 15 Pro — CaseStore',
          metaDescription:
            'Чохли, захисне скло, зарядки й кабелі, перевірені на сумісність з iPhone 15 Pro. Доставка Новою Поштою по всій Україні, оплата при отриманні.',
          description:
            'Усе, що точно пасує до iPhone 15 Pro: чохли під його блок камер, скло під виріз Dynamic Island і зарядки з USB-C. Кожна позиція на цій сторінці перевірена на сумісність саме з цією моделлю.',
        },
      },
      { name: 'iPhone 15 Plus', series: 'iPhone 15', releaseYear: 2023 },
      { name: 'iPhone 15', series: 'iPhone 15', releaseYear: 2023 },
      // iPhone 14 series
      { name: 'iPhone 14 Pro Max', series: 'iPhone 14', releaseYear: 2022 },
      { name: 'iPhone 14 Pro', series: 'iPhone 14', releaseYear: 2022 },
      { name: 'iPhone 14 Plus', series: 'iPhone 14', releaseYear: 2022 },
      { name: 'iPhone 14', series: 'iPhone 14', releaseYear: 2022 },
      // iPhone 13 series
      { name: 'iPhone 13 Pro Max', series: 'iPhone 13', releaseYear: 2021 },
      { name: 'iPhone 13 Pro', series: 'iPhone 13', releaseYear: 2021 },
      { name: 'iPhone 13', series: 'iPhone 13', releaseYear: 2021 },
      { name: 'iPhone 13 mini', series: 'iPhone 13', releaseYear: 2021 },
      // iPhone 12 series
      { name: 'iPhone 12 Pro Max', series: 'iPhone 12', releaseYear: 2020 },
      { name: 'iPhone 12 Pro', series: 'iPhone 12', releaseYear: 2020 },
      { name: 'iPhone 12', series: 'iPhone 12', releaseYear: 2020 },
      { name: 'iPhone 12 mini', series: 'iPhone 12', releaseYear: 2020 },
      // iPad
      { name: 'iPad Pro 13" (M4)', series: 'iPad Pro', releaseYear: 2024 },
      { name: 'iPad Pro 11" (M4)', series: 'iPad Pro', releaseYear: 2024 },
      { name: 'iPad Air 13" (M2)', series: 'iPad Air', releaseYear: 2024 },
      {
        name: 'iPad Air 11" (M2)',
        series: 'iPad Air',
        releaseYear: 2024,
        seo: {
          metaTitle: 'Аксесуари для iPad Air 11" (M2) — CaseStore',
          metaDescription:
            'Зарядки, кабелі USB-C та адаптери для iPad Air 11" (M2). Лише позиції, перевірені на сумісність. Доставка по Україні за 1–2 дні.',
          description:
            'iPad Air 11" (M2) заряджається через USB-C, тож йому підходять сучасні зарядки з Power Delivery і хаби для роботи з монітором. Тут зібрано лише те, що ми перевірили з цією моделлю.',
        },
      },
      { name: 'iPad 10th gen', series: 'iPad', releaseYear: 2022 },
      // Apple Watch (case sizes)
      { name: 'Apple Watch Series 10 46mm', series: 'Apple Watch', releaseYear: 2024 },
      {
        name: 'Apple Watch Series 10 42mm',
        series: 'Apple Watch',
        releaseYear: 2024,
        seo: {
          metaTitle: 'Аксесуари для Apple Watch Series 10 42 мм — CaseStore',
          metaDescription:
            'Ремінці та зарядки для Apple Watch Series 10 з корпусом 42 мм. Підбираємо за розміром корпусу, щоб ремінець сів без зазорів.',
          description:
            'Ремінці для корпусу 42 мм не підходять до 46 мм і навпаки, тому тут лише сумісні з Apple Watch Series 10 42 мм. Заряджайте годинник разом із телефоном на док-станції 3 в 1.',
        },
      },
      { name: 'Apple Watch Ultra 2 49mm', series: 'Apple Watch', releaseYear: 2023 },
    ],
  },
  {
    brand: 'Samsung',
    sortOrder: 2,
    models: [
      { name: 'Galaxy S24 Ultra', series: 'Galaxy S24', releaseYear: 2024 },
      { name: 'Galaxy S24+', series: 'Galaxy S24', releaseYear: 2024 },
      {
        name: 'Galaxy S24',
        series: 'Galaxy S24',
        releaseYear: 2024,
        seo: {
          metaTitle: 'Аксесуари для Samsung Galaxy S24 — CaseStore',
          metaDescription:
            'Чохли, скло й зарядки для Samsung Galaxy S24, перевірені на сумісність. Доставка Новою Поштою по Україні, оплата при отриманні.',
          description:
            'Galaxy S24 компактніший за S24+ і Ultra, тож чохли та скло від старших моделей на нього не сядуть. На цій сторінці лише аксесуари, що пасують саме до Galaxy S24.',
        },
      },
      { name: 'Galaxy S23 Ultra', series: 'Galaxy S23', releaseYear: 2023 },
      { name: 'Galaxy S23', series: 'Galaxy S23', releaseYear: 2023 },
      { name: 'Galaxy A55', series: 'Galaxy A', releaseYear: 2024 },
      { name: 'Galaxy A35', series: 'Galaxy A', releaseYear: 2024 },
    ],
  },
  {
    brand: 'Xiaomi',
    sortOrder: 3,
    models: [
      { name: 'Xiaomi 14 Ultra', series: 'Xiaomi 14', releaseYear: 2024 },
      { name: 'Xiaomi 14', series: 'Xiaomi 14', releaseYear: 2024 },
      { name: 'Xiaomi 13', series: 'Xiaomi 13', releaseYear: 2023 },
      { name: 'Redmi Note 13 Pro', series: 'Redmi Note 13', releaseYear: 2024 },
      { name: 'Redmi Note 13', series: 'Redmi Note 13', releaseYear: 2024 },
    ],
  },
];
