export const categoriesData = [
  // Top-level categories
  { name: 'Cases', slug: 'cases', description: 'Phone cases and covers', sortOrder: 1 },
  {
    name: 'Chargers',
    slug: 'chargers',
    description: 'Charging solutions for your devices',
    sortOrder: 2,
  },
  { name: 'Cables', slug: 'cables', description: 'Data and charging cables', sortOrder: 3 },
  {
    name: 'Screen Protectors',
    slug: 'screen-protectors',
    description: 'Screen protection for smartphones',
    sortOrder: 4,
  },
  // Root category for phones themselves (UA), parent of the iPhone subcategory.
  {
    name: 'Смартфони',
    slug: 'smartphones',
    description: 'Смартфони та мобільні телефони провідних брендів',
    sortOrder: 5,
  },
];

/**
 * Subcategories, resolved against the already-upserted top-level categories
 * (they carry a real `parentId`, so they cannot be a static literal).
 */
export function buildSubcategories(categories: Record<string, { id: string }>) {
  // Subcategories for Cases
  const casesSubcategories = [
    { name: 'iPhone Cases', slug: 'iphone-cases', parentId: categories['cases'].id, sortOrder: 1 },
    {
      name: 'Samsung Cases',
      slug: 'samsung-cases',
      parentId: categories['cases'].id,
      sortOrder: 2,
    },
    { name: 'Xiaomi Cases', slug: 'xiaomi-cases', parentId: categories['cases'].id, sortOrder: 3 },
  ];

  // Subcategories for Chargers
  const chargersSubcategories = [
    {
      name: 'Wall Chargers',
      slug: 'wall-chargers',
      parentId: categories['chargers'].id,
      sortOrder: 1,
    },
    {
      name: 'Car Chargers',
      slug: 'car-chargers',
      parentId: categories['chargers'].id,
      sortOrder: 2,
    },
    {
      name: 'Wireless Chargers',
      slug: 'wireless-chargers',
      parentId: categories['chargers'].id,
      sortOrder: 3,
    },
  ];

  // Subcategories for Cables
  const cablesSubcategories = [
    {
      name: 'Lightning Cables',
      slug: 'lightning-cables',
      parentId: categories['cables'].id,
      sortOrder: 1,
    },
    { name: 'USB-C Cables', slug: 'usb-c-cables', parentId: categories['cables'].id, sortOrder: 2 },
    {
      name: 'Micro-USB Cables',
      slug: 'micro-usb-cables',
      parentId: categories['cables'].id,
      sortOrder: 3,
    },
  ];

  // Subcategory for Смартфони (UA)
  const smartphonesSubcategories = [
    {
      name: 'iPhone',
      slug: 'iphone',
      description: 'Смартфони Apple iPhone',
      parentId: categories['smartphones'].id,
      sortOrder: 1,
    },
  ];

  const allSubcategories = [
    ...casesSubcategories,
    ...chargersSubcategories,
    ...cablesSubcategories,
    ...smartphonesSubcategories,
  ];

  return allSubcategories;
}
