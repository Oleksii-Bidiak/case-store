// brand → ordered list of { name, series, releaseYear } models.
export const devices: Array<{
  brand: string;
  sortOrder: number;
  models: Array<{ name: string; series: string; releaseYear: number }>;
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
      { name: 'iPhone 15 Pro', series: 'iPhone 15', releaseYear: 2023 },
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
      { name: 'iPad Air 11" (M2)', series: 'iPad Air', releaseYear: 2024 },
      { name: 'iPad 10th gen', series: 'iPad', releaseYear: 2022 },
      // Apple Watch (case sizes)
      { name: 'Apple Watch Series 10 46mm', series: 'Apple Watch', releaseYear: 2024 },
      { name: 'Apple Watch Series 10 42mm', series: 'Apple Watch', releaseYear: 2024 },
      { name: 'Apple Watch Ultra 2 49mm', series: 'Apple Watch', releaseYear: 2023 },
    ],
  },
  {
    brand: 'Samsung',
    sortOrder: 2,
    models: [
      { name: 'Galaxy S24 Ultra', series: 'Galaxy S24', releaseYear: 2024 },
      { name: 'Galaxy S24+', series: 'Galaxy S24', releaseYear: 2024 },
      { name: 'Galaxy S24', series: 'Galaxy S24', releaseYear: 2024 },
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
