import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import argon2 from 'argon2';
import { sanitizeRichText } from '../src/common/sanitize';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive a stable, UUID-shaped id from a seed string (sha1-based). Lets the seed
 * upsert ProductGroup rows idempotently even though groups have no natural
 * unique key (TASK-142).
 */
function deterministicUuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Deterministic string hash — keeps seeded review counts and ratings stable
 * across runs so the seed is idempotent and reproducible.
 */
function hashStr(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

interface SeededUser {
  id: string;
  email: string;
}

async function seedUsers(prisma: PrismaClient) {
  // Admin 1 credentials are configurable via env (ADMIN_SEED_EMAIL /
  // ADMIN_SEED_PASSWORD) and fall back to the dev defaults below. The upsert is
  // idempotent and re-asserts the ADMIN role + name on every run. To promote an
  // already-registered user instead of seeding a new one, run:
  //   UPDATE users SET role='ADMIN' WHERE email='<email>';
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@store.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'Admin123!';
  const adminPasswordHash = await argon2.hash(adminPassword);
  const managerPasswordHash = await argon2.hash('Manager123!');
  const customerPasswordHash = await argon2.hash('Customer123!');

  // ── Admin 1 (primary, env-overridable) ──
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', isActive: true, firstName: 'Олександр', lastName: 'Коваленко' },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      firstName: 'Олександр',
      lastName: 'Коваленко',
      role: 'ADMIN',
      isActive: true,
    },
  });

  // ── Admin 2 (manager, fixed credentials) ──
  const admin2 = await prisma.user.upsert({
    where: { email: 'manager@store.com' },
    update: { role: 'ADMIN', isActive: true, firstName: 'Ірина', lastName: 'Мельник' },
    create: {
      email: 'manager@store.com',
      passwordHash: managerPasswordHash,
      firstName: 'Ірина',
      lastName: 'Мельник',
      phone: '+380671110099',
      role: 'ADMIN',
      isActive: true,
    },
  });

  // ── Customers ── customer@store.com is the long-standing demo login (kept as
  // John Doe for backwards-compat with existing fixtures); the rest carry UA
  // names + +380 phones and back the seeded orders / addresses.
  const customersData: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
  }[] = [
    { email: 'customer@store.com', firstName: 'John', lastName: 'Doe', phone: '+380991234567' },
    {
      email: 'oksana@example.com',
      firstName: 'Оксана',
      lastName: 'Шевченко',
      phone: '+380671112233',
    },
    {
      email: 'taras@example.com',
      firstName: 'Тарас',
      lastName: 'Бондаренко',
      phone: '+380672223344',
    },
    { email: 'mariia@example.com', firstName: 'Марія', lastName: 'Коваль', phone: '+380673334455' },
    {
      email: 'dmytro@example.com',
      firstName: 'Дмитро',
      lastName: 'Ткаченко',
      phone: '+380674445566',
    },
    {
      email: 'nataliia@example.com',
      firstName: 'Наталія',
      lastName: 'Кравченко',
      phone: '+380675556677',
    },
  ];

  const customers: SeededUser[] = [];
  for (const c of customersData) {
    const record = await prisma.user.upsert({
      where: { email: c.email },
      update: { firstName: c.firstName, lastName: c.lastName, phone: c.phone },
      create: {
        email: c.email,
        passwordHash: customerPasswordHash,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        role: 'CUSTOMER',
        isActive: true,
      },
    });
    customers.push({ id: record.id, email: record.email });
  }

  // customers[0] is the demo John Doe account (owns the fixed seed-address-1).
  const customer = customers[0];

  console.log(
    `  ✓ Users: 2 admins (${admin.email}, ${admin2.email}), ${customers.length} customers`,
  );
  return { admin, admin2, admins: [admin, admin2], customer, customers };
}

/**
 * Seed the product-manufacturer brands (TASK-189) shown in the storefront brand
 * strip / catalog filter. Distinct from the compatible-device brands seeded by
 * `seedDevices` (a Spigen case fits an Apple phone — two separate concepts).
 * Idempotent — upsert on the unique `slug`. Returns a slug → { id } map so
 * `seedProducts` can tag positions with their manufacturer.
 */
async function seedBrands(prisma: PrismaClient) {
  const brandsData = [
    { name: 'Apple', slug: 'apple' },
    { name: 'Samsung', slug: 'samsung' },
    { name: 'Xiaomi', slug: 'xiaomi' },
    { name: 'Baseus', slug: 'baseus' },
    { name: 'Anker', slug: 'anker' },
    { name: 'Spigen', slug: 'spigen' },
  ];

  const brands: Record<string, { id: string }> = {};
  for (const b of brandsData) {
    const record = await prisma.brand.upsert({
      where: { slug: b.slug },
      update: { name: b.name, isActive: true },
      create: { name: b.name, slug: b.slug, isActive: true },
    });
    brands[b.slug] = record;
  }

  console.log(`  ✓ Brands: ${brandsData.length} upserted`);
  return brands;
}

async function seedCategories(prisma: PrismaClient) {
  const categoriesData = [
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

  const categories: Record<string, { id: string }> = {};

  for (const cat of categoriesData) {
    const record = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    categories[cat.slug] = record;
  }

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

  for (const sub of allSubcategories) {
    const record = await prisma.category.upsert({
      where: { slug: sub.slug },
      update: {},
      create: sub,
    });
    categories[sub.slug] = record;
  }

  console.log(`  ✓ Categories: ${Object.keys(categories).length} created`);
  return categories;
}

interface VariantSeed {
  name: string;
  sku?: string;
  price: number;
  stock: number;
  attributes: Record<string, string>;
}

interface ImageSeed {
  url: string;
  alt: string;
  sortOrder: number;
}

interface ProductSeed {
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  categoryId: string;
  /** Manufacturer brand slug (TASK-189) — resolved to `brandId` via the map. */
  brandSlug?: string;
  metaTitle?: string;
  metaDescription?: string;
  variants: VariantSeed[];
  images: ImageSeed[];
}

async function seedProducts(
  prisma: PrismaClient,
  categories: Record<string, { id: string }>,
  brands: Record<string, { id: string }>,
) {
  const productsData: ProductSeed[] = [
    // ── iPhone Cases ──
    {
      name: 'Silicone Case for iPhone 15',
      slug: slugify('Silicone Case for iPhone 15'),
      description:
        'Premium silicone case with soft-touch finish. Fits iPhone 15 perfectly with precise cutouts for camera and buttons.',
      price: 12.99,
      compareAtPrice: 19.99,
      sku: 'CASE-IP15-SIL',
      categoryId: categories['iphone-cases'].id,
      brandSlug: 'spigen',
      variants: [
        {
          name: 'Black',
          sku: 'CASE-IP15-SIL-BK',
          price: 12.99,
          stock: 50,
          attributes: { color: 'Black' },
        },
        {
          name: 'White',
          sku: 'CASE-IP15-SIL-WH',
          price: 12.99,
          stock: 35,
          attributes: { color: 'White' },
        },
        {
          name: 'Blue',
          sku: 'CASE-IP15-SIL-BL',
          price: 12.99,
          stock: 25,
          attributes: { color: 'Blue' },
        },
        {
          name: 'Red',
          sku: 'CASE-IP15-SIL-RD',
          price: 14.99,
          stock: 15,
          attributes: { color: 'Red' },
        },
      ],
      images: [
        {
          url: '/images/products/case-iphone15-1.jpg',
          alt: 'Silicone Case for iPhone 15 - Front',
          sortOrder: 0,
        },
        {
          url: '/images/products/case-iphone15-2.jpg',
          alt: 'Silicone Case for iPhone 15 - Side',
          sortOrder: 1,
        },
      ],
    },
    {
      name: 'Clear MagSafe Case for iPhone 15 Pro',
      slug: slugify('Clear MagSafe Case for iPhone 15 Pro'),
      description:
        'Crystal clear case with built-in MagSafe magnet ring. Shows off your iPhone while providing military-grade drop protection.',
      price: 24.99,
      compareAtPrice: 34.99,
      sku: 'CASE-IP15P-MAG',
      categoryId: categories['iphone-cases'].id,
      brandSlug: 'spigen',
      variants: [
        {
          name: 'Clear',
          sku: 'CASE-IP15P-MAG-CL',
          price: 24.99,
          stock: 40,
          attributes: { color: 'Clear' },
        },
        {
          name: 'Frosted Black',
          sku: 'CASE-IP15P-MAG-FB',
          price: 26.99,
          stock: 20,
          attributes: { color: 'Frosted Black' },
        },
      ],
      images: [
        {
          url: '/images/products/case-magsafe-1.jpg',
          alt: 'Clear MagSafe Case - Front',
          sortOrder: 0,
        },
        {
          url: '/images/products/case-magsafe-2.jpg',
          alt: 'Clear MagSafe Case - Back',
          sortOrder: 1,
        },
        {
          url: '/images/products/case-magsafe-3.jpg',
          alt: 'Clear MagSafe Case - MagSafe Ring',
          sortOrder: 2,
        },
      ],
    },
    // ── Samsung Cases ──
    {
      name: 'Armor Case for Samsung Galaxy S24',
      slug: slugify('Armor Case for Samsung Galaxy S24'),
      description:
        'Rugged dual-layer armor case with kickstand. Designed for maximum protection against drops and impacts.',
      price: 18.99,
      compareAtPrice: 29.99,
      sku: 'CASE-SGS24-ARM',
      categoryId: categories['samsung-cases'].id,
      brandSlug: 'spigen',
      variants: [
        {
          name: 'Black',
          sku: 'CASE-SGS24-ARM-BK',
          price: 18.99,
          stock: 45,
          attributes: { color: 'Black' },
        },
        {
          name: 'Navy Blue',
          sku: 'CASE-SGS24-ARM-NB',
          price: 18.99,
          stock: 30,
          attributes: { color: 'Navy Blue' },
        },
      ],
      images: [
        {
          url: '/images/products/case-samsung-armor-1.jpg',
          alt: 'Armor Case Samsung Galaxy S24',
          sortOrder: 0,
        },
        {
          url: '/images/products/case-samsung-armor-2.jpg',
          alt: 'Armor Case Samsung Galaxy S24 - Kickstand',
          sortOrder: 1,
        },
      ],
    },
    // ── Xiaomi Cases ──
    {
      name: 'TPU Case for Xiaomi 14',
      slug: slugify('TPU Case for Xiaomi 14'),
      description:
        'Flexible TPU case with matte finish. Lightweight and slim design that preserves the phone profile.',
      price: 8.99,
      sku: 'CASE-XI14-TPU',
      categoryId: categories['xiaomi-cases'].id,
      brandSlug: 'baseus',
      variants: [
        {
          name: 'Black',
          sku: 'CASE-XI14-TPU-BK',
          price: 8.99,
          stock: 60,
          attributes: { color: 'Black' },
        },
        {
          name: 'Transparent',
          sku: 'CASE-XI14-TPU-TR',
          price: 7.99,
          stock: 55,
          attributes: { color: 'Transparent' },
        },
      ],
      images: [
        { url: '/images/products/case-xiaomi-tpu-1.jpg', alt: 'TPU Case Xiaomi 14', sortOrder: 0 },
      ],
    },
    // ── Wall Chargers ──
    {
      name: '20W USB-C Wall Charger',
      slug: slugify('20W USB-C Wall Charger'),
      description:
        'Compact 20W PD fast charger with USB-C port. Perfect for iPhone and Android fast charging.',
      price: 15.99,
      compareAtPrice: 22.99,
      sku: 'CHG-WALL-20W',
      categoryId: categories['wall-chargers'].id,
      brandSlug: 'anker',
      variants: [
        {
          name: 'White',
          sku: 'CHG-WALL-20W-WH',
          price: 15.99,
          stock: 80,
          attributes: { color: 'White' },
        },
        {
          name: 'Black',
          sku: 'CHG-WALL-20W-BK',
          price: 15.99,
          stock: 70,
          attributes: { color: 'Black' },
        },
      ],
      images: [
        {
          url: '/images/products/charger-wall-20w-1.jpg',
          alt: '20W USB-C Wall Charger',
          sortOrder: 0,
        },
        {
          url: '/images/products/charger-wall-20w-2.jpg',
          alt: '20W USB-C Wall Charger - USB-C Port',
          sortOrder: 1,
        },
      ],
    },
    {
      name: '65W GaN Wall Charger',
      slug: slugify('65W GaN Wall Charger'),
      description:
        'Gallium Nitride 65W charger with 2 USB-C and 1 USB-A ports. Charges laptop, phone, and tablet simultaneously.',
      price: 39.99,
      compareAtPrice: 54.99,
      sku: 'CHG-WALL-65W',
      categoryId: categories['wall-chargers'].id,
      brandSlug: 'anker',
      variants: [
        {
          name: 'White',
          sku: 'CHG-WALL-65W-WH',
          price: 39.99,
          stock: 30,
          attributes: { color: 'White' },
        },
        {
          name: 'Black',
          sku: 'CHG-WALL-65W-BK',
          price: 39.99,
          stock: 25,
          attributes: { color: 'Black' },
        },
      ],
      images: [
        {
          url: '/images/products/charger-gan-65w-1.jpg',
          alt: '65W GaN Wall Charger',
          sortOrder: 0,
        },
      ],
    },
    // ── Car Chargers ──
    {
      name: '30W Dual USB Car Charger',
      slug: slugify('30W Dual USB Car Charger'),
      description:
        'Compact car charger with USB-C PD and USB-A ports. Fast charges two devices simultaneously on the road.',
      price: 12.99,
      sku: 'CHG-CAR-30W',
      categoryId: categories['car-chargers'].id,
      brandSlug: 'baseus',
      variants: [
        {
          name: 'Black',
          sku: 'CHG-CAR-30W-BK',
          price: 12.99,
          stock: 50,
          attributes: { color: 'Black' },
        },
        {
          name: 'Silver',
          sku: 'CHG-CAR-30W-SL',
          price: 13.99,
          stock: 35,
          attributes: { color: 'Silver' },
        },
      ],
      images: [
        {
          url: '/images/products/charger-car-30w-1.jpg',
          alt: '30W Dual USB Car Charger',
          sortOrder: 0,
        },
      ],
    },
    // ── Wireless Chargers ──
    {
      name: '15W Qi Wireless Charging Pad',
      slug: slugify('15W Qi Wireless Charging Pad'),
      description:
        'Slim Qi-certified wireless charging pad. Supports up to 15W fast wireless charging for compatible devices.',
      price: 19.99,
      compareAtPrice: 27.99,
      sku: 'CHG-WRLS-15W',
      categoryId: categories['wireless-chargers'].id,
      brandSlug: 'baseus',
      variants: [
        {
          name: 'Black',
          sku: 'CHG-WRLS-15W-BK',
          price: 19.99,
          stock: 40,
          attributes: { color: 'Black' },
        },
        {
          name: 'White',
          sku: 'CHG-WRLS-15W-WH',
          price: 19.99,
          stock: 40,
          attributes: { color: 'White' },
        },
      ],
      images: [
        {
          url: '/images/products/charger-wireless-15w-1.jpg',
          alt: '15W Qi Wireless Charging Pad',
          sortOrder: 0,
        },
        {
          url: '/images/products/charger-wireless-15w-2.jpg',
          alt: '15W Qi Wireless Charging Pad - Top View',
          sortOrder: 1,
        },
        {
          url: '/images/products/charger-wireless-15w-3.jpg',
          alt: '15W Qi Wireless Charging Pad - In Use',
          sortOrder: 2,
        },
      ],
    },
    // ── Lightning Cables ──
    {
      name: 'Lightning to USB-C Cable',
      slug: slugify('Lightning to USB-C Cable'),
      description:
        'MFi-certified Lightning to USB-C cable. Supports fast charging and data transfer up to 480Mbps.',
      price: 9.99,
      compareAtPrice: 14.99,
      sku: 'CAB-LTG-USBC',
      categoryId: categories['lightning-cables'].id,
      brandSlug: 'anker',
      variants: [
        {
          name: '1m / White',
          sku: 'CAB-LTG-USBC-1W',
          price: 9.99,
          stock: 100,
          attributes: { length: '1m', color: 'White' },
        },
        {
          name: '2m / White',
          sku: 'CAB-LTG-USBC-2W',
          price: 12.99,
          stock: 75,
          attributes: { length: '2m', color: 'White' },
        },
        {
          name: '3m / Black',
          sku: 'CAB-LTG-USBC-3B',
          price: 15.99,
          stock: 40,
          attributes: { length: '3m', color: 'Black' },
        },
      ],
      images: [
        {
          url: '/images/products/cable-lightning-1.jpg',
          alt: 'Lightning to USB-C Cable',
          sortOrder: 0,
        },
      ],
    },
    // ── USB-C Cables ──
    {
      name: 'USB-C to USB-C Cable',
      slug: slugify('USB-C to USB-C Cable'),
      description:
        'Braided USB-C to USB-C cable with 100W PD and 10Gbps data transfer. Durable nylon braiding for long life.',
      price: 11.99,
      compareAtPrice: 16.99,
      sku: 'CAB-USBC-USBC',
      categoryId: categories['usb-c-cables'].id,
      brandSlug: 'anker',
      variants: [
        {
          name: '1m / Black',
          sku: 'CAB-USBC-USBC-1B',
          price: 11.99,
          stock: 90,
          attributes: { length: '1m', color: 'Black' },
        },
        {
          name: '2m / Black',
          sku: 'CAB-USBC-USBC-2B',
          price: 14.99,
          stock: 65,
          attributes: { length: '2m', color: 'Black' },
        },
        {
          name: '3m / Gray',
          sku: 'CAB-USBC-USBC-3G',
          price: 17.99,
          stock: 35,
          attributes: { length: '3m', color: 'Gray' },
        },
      ],
      images: [
        { url: '/images/products/cable-usbc-1.jpg', alt: 'USB-C to USB-C Cable', sortOrder: 0 },
      ],
    },
    // ── Micro-USB Cables ──
    {
      name: 'Micro-USB Cable',
      slug: slugify('Micro-USB Cable'),
      description:
        'Standard Micro-USB to USB-A cable for charging and data sync. Compatible with older Android devices and accessories.',
      price: 5.99,
      sku: 'CAB-MUSB',
      categoryId: categories['micro-usb-cables'].id,
      variants: [
        {
          name: '1m / Black',
          sku: 'CAB-MUSB-1B',
          price: 5.99,
          stock: 120,
          attributes: { length: '1m', color: 'Black' },
        },
        {
          name: '2m / White',
          sku: 'CAB-MUSB-2W',
          price: 7.99,
          stock: 80,
          attributes: { length: '2m', color: 'White' },
        },
      ],
      images: [
        { url: '/images/products/cable-microusb-1.jpg', alt: 'Micro-USB Cable', sortOrder: 0 },
      ],
    },
    // ── Screen Protectors ──
    {
      name: 'Tempered Glass Screen Protector for iPhone 15',
      slug: slugify('Tempered Glass Screen Protector for iPhone 15'),
      description:
        '9H hardness tempered glass with oleophobic coating. Full coverage edge-to-edge protection with easy install frame.',
      price: 8.99,
      compareAtPrice: 12.99,
      sku: 'SP-IP15-TG',
      categoryId: categories['screen-protectors'].id,
      variants: [
        {
          name: 'Single Pack',
          sku: 'SP-IP15-TG-1',
          price: 8.99,
          stock: 100,
          attributes: { pack: '1' },
        },
        {
          name: 'Double Pack',
          sku: 'SP-IP15-TG-2',
          price: 13.99,
          stock: 60,
          attributes: { pack: '2' },
        },
      ],
      images: [
        {
          url: '/images/products/sp-iphone15-1.jpg',
          alt: 'Tempered Glass iPhone 15',
          sortOrder: 0,
        },
        {
          url: '/images/products/sp-iphone15-2.jpg',
          alt: 'Tempered Glass iPhone 15 - Install Frame',
          sortOrder: 1,
        },
      ],
    },
    {
      name: 'PET Film Screen Protector for Samsung Galaxy S24',
      slug: slugify('PET Film Screen Protector for Samsung Galaxy S24'),
      description:
        'Ultra-thin PET film protector with self-healing properties. Maintains touch sensitivity and display clarity.',
      price: 5.99,
      sku: 'SP-SGS24-PET',
      categoryId: categories['screen-protectors'].id,
      variants: [
        {
          name: 'Single Pack',
          sku: 'SP-SGS24-PET-1',
          price: 5.99,
          stock: 80,
          attributes: { pack: '1' },
        },
        {
          name: 'Triple Pack',
          sku: 'SP-SGS24-PET-3',
          price: 11.99,
          stock: 45,
          attributes: { pack: '3' },
        },
      ],
      images: [
        { url: '/images/products/sp-samsung-s24-1.jpg', alt: 'PET Film Samsung S24', sortOrder: 0 },
        {
          url: '/images/products/sp-samsung-s24-2.jpg',
          alt: 'PET Film Samsung S24 - Applied',
          sortOrder: 1,
        },
      ],
    },
    // ── iPhones (Brand = Apple, category = iPhone) ──
    // Multi-axis group: storage × color (variant-as-position, TASK-142). UA
    // content; realistic ₴ prices. Cyrillic variant names slugify to the same
    // token, so the position slug falls back to the (latin) SKU — see the
    // uniqueness pre-pass below.
    {
      name: 'Apple iPhone 15 Pro',
      slug: slugify('Apple iPhone 15 Pro'),
      description:
        'Флагман Apple з корпусом із титану, чипом A17 Pro та потрійною камерою 48 Мп. Дисплей Super Retina XDR ProMotion 120 Гц, роз’єм USB-C, кнопка «Дія».',
      price: 42999,
      compareAtPrice: 47999,
      sku: 'IP15PRO',
      categoryId: categories['iphone'].id,
      brandSlug: 'apple',
      metaTitle: 'Купити Apple iPhone 15 Pro — ціна в Україні | MobileStore',
      metaDescription:
        'Apple iPhone 15 Pro у титановому корпусі: A17 Pro, камера 48 Мп, USB-C. Офіційна гарантія, доставка Новою Поштою.',
      variants: [
        {
          name: '128 ГБ / Натуральний титан',
          sku: 'IP15PRO-128-NT',
          price: 42999,
          stock: 12,
          attributes: { storage: '128 ГБ', color: 'Натуральний титан' },
        },
        {
          name: '128 ГБ / Блакитний титан',
          sku: 'IP15PRO-128-BT',
          price: 42999,
          stock: 8,
          attributes: { storage: '128 ГБ', color: 'Блакитний титан' },
        },
        {
          name: '256 ГБ / Натуральний титан',
          sku: 'IP15PRO-256-NT',
          price: 46999,
          stock: 6,
          attributes: { storage: '256 ГБ', color: 'Натуральний титан' },
        },
        {
          name: '256 ГБ / Блакитний титан',
          sku: 'IP15PRO-256-BT',
          price: 46999,
          stock: 5,
          attributes: { storage: '256 ГБ', color: 'Блакитний титан' },
        },
        {
          name: '512 ГБ / Натуральний титан',
          sku: 'IP15PRO-512-NT',
          price: 52999,
          stock: 3,
          attributes: { storage: '512 ГБ', color: 'Натуральний титан' },
        },
        {
          name: '512 ГБ / Блакитний титан',
          sku: 'IP15PRO-512-BT',
          price: 52999,
          stock: 2,
          attributes: { storage: '512 ГБ', color: 'Блакитний титан' },
        },
      ],
      images: [
        { url: 'placeholder', alt: 'Apple iPhone 15 Pro — вигляд спереду', sortOrder: 0 },
        { url: 'placeholder', alt: 'Apple iPhone 15 Pro — вигляд ззаду', sortOrder: 1 },
      ],
    },
    {
      name: 'Apple iPhone 14',
      slug: slugify('Apple iPhone 14'),
      description:
        'Надійний смартфон Apple з чипом A15 Bionic, подвійною камерою 12 Мп та дисплеєм Super Retina XDR 6.1". Аварійний виклик через супутник.',
      price: 29999,
      compareAtPrice: 33999,
      sku: 'IP14-128',
      categoryId: categories['iphone'].id,
      brandSlug: 'apple',
      metaTitle: 'Купити Apple iPhone 14 — ціна в Україні | MobileStore',
      metaDescription:
        'Apple iPhone 14: чип A15 Bionic, камера 12 Мп, дисплей 6.1". Офіційна гарантія, оплата у гривні.',
      variants: [
        {
          name: 'Apple iPhone 14',
          sku: 'IP14-128',
          price: 29999,
          stock: 10,
          attributes: {},
        },
      ],
      images: [
        { url: 'placeholder', alt: 'Apple iPhone 14 — вигляд спереду', sortOrder: 0 },
        { url: 'placeholder', alt: 'Apple iPhone 14 — вигляд ззаду', sortOrder: 1 },
      ],
    },
    {
      name: 'Apple iPhone 13',
      slug: slugify('Apple iPhone 13'),
      description:
        'Популярний iPhone 13 з чипом A15 Bionic, подвійною камерою та яскравим OLED-дисплеєм. Чудовий баланс ціни та можливостей.',
      price: 24999,
      compareAtPrice: 27999,
      sku: 'IP13-128',
      categoryId: categories['iphone'].id,
      brandSlug: 'apple',
      metaTitle: 'Купити Apple iPhone 13 — ціна в Україні | MobileStore',
      metaDescription:
        'Apple iPhone 13: A15 Bionic, подвійна камера 12 Мп, OLED 6.1". Офіційна гарантія, доставка по Україні.',
      variants: [
        {
          name: 'Apple iPhone 13',
          sku: 'IP13-128',
          price: 24999,
          stock: 7,
          attributes: {},
        },
      ],
      images: [
        { url: 'placeholder', alt: 'Apple iPhone 13 — вигляд спереду', sortOrder: 0 },
        { url: 'placeholder', alt: 'Apple iPhone 13 — вигляд ззаду', sortOrder: 1 },
      ],
    },
    // ── Standalone positions (no group — single buyable unit, TASK-142) ──
    {
      name: 'Universal Phone Holder for Car Dashboard',
      slug: slugify('Universal Phone Holder for Car Dashboard'),
      description:
        'Adjustable dashboard mount with a strong suction cup and 360° rotation. Fits phones 4.7"–7".',
      price: 16.99,
      compareAtPrice: 24.99,
      sku: 'ACC-CAR-HOLDER',
      categoryId: categories['car-chargers'].id,
      variants: [
        {
          name: 'Universal Phone Holder for Car Dashboard',
          sku: 'ACC-CAR-HOLDER',
          price: 16.99,
          stock: 40,
          attributes: {},
        },
      ],
      images: [
        {
          url: '/images/products/acc-car-holder-1.jpg',
          alt: 'Car Dashboard Phone Holder',
          sortOrder: 0,
        },
        {
          url: '/images/products/acc-car-holder-2.jpg',
          alt: 'Car Dashboard Phone Holder - Mounted',
          sortOrder: 1,
        },
      ],
    },
    {
      name: 'Braided USB-C to USB-C Cable 2m',
      slug: slugify('Braided USB-C to USB-C Cable 2m'),
      description:
        'Durable nylon-braided 100W USB-C cable, 2 metres. Currently sold out — restock incoming.',
      price: 11.99,
      sku: 'CABLE-USBC-2M',
      categoryId: categories['usb-c-cables'].id,
      variants: [
        {
          name: 'Braided USB-C to USB-C Cable 2m',
          sku: 'CABLE-USBC-2M',
          price: 11.99,
          stock: 0,
          attributes: {},
        },
      ],
      images: [
        {
          url: '/images/products/cable-usbc-2m-1.jpg',
          alt: 'Braided USB-C Cable 2m',
          sortOrder: 0,
        },
      ],
    },
  ];

  let groupCount = 0;
  let positionCount = 0;
  let imageCount = 0;

  for (const p of productsData) {
    // A catalog entry with more than one variant becomes a ProductGroup whose
    // members are first-class Product positions; a single-variant entry is a
    // standalone position with no group (TASK-142).
    const isGroup = p.variants.length > 1;

    let groupId: string | null = null;
    if (isGroup) {
      groupId = deterministicUuid(p.slug);

      // Axis names are the distinct attribute keys across the variants, in
      // first-seen order (e.g. ["color"] or ["pack"]).
      const axisNames: string[] = [];
      for (const v of p.variants) {
        for (const key of Object.keys(v.attributes ?? {})) {
          if (!axisNames.includes(key)) axisNames.push(key);
        }
      }

      await prisma.productGroup.upsert({
        where: { id: groupId },
        update: { name: p.name, isActive: true },
        create: { id: groupId, name: p.name, isActive: true },
      });

      // Replace axes wholesale so re-seeding stays idempotent.
      await prisma.productGroupAxis.deleteMany({ where: { groupId } });
      if (axisNames.length > 0) {
        await prisma.productGroupAxis.createMany({
          data: axisNames.map((name, index) => ({ groupId: groupId!, name, sortOrder: index })),
        });
      }
      groupCount++;
    }

    const brandId = p.brandSlug ? (brands[p.brandSlug]?.id ?? null) : null;

    // Per-entry position slug parts. Normally derived from the variant name
    // (e.g. "Black" → "black"). If those parts are ambiguous — empty or
    // duplicated, which happens when Cyrillic variant names slugify to the same
    // latin token (e.g. "128 ГБ / …" → "128") — fall back to the unique, latin
    // SKU for ALL variants of the entry so position slugs never collide. Entries
    // with latin variant names keep their existing name-based slugs unchanged.
    const nameParts = p.variants.map((v) => slugify(v.name));
    const nameAmbiguous = nameParts.some((s, idx) => !s || nameParts.indexOf(s) !== idx);
    const slugParts = nameAmbiguous
      ? p.variants.map((v, idx) => slugify(v.sku ?? String(idx)))
      : nameParts;

    // Create one position per variant. Group members carry the variant name and
    // attributes; a standalone position takes the entry name and empty attributes.
    for (let i = 0; i < p.variants.length; i++) {
      const v = p.variants[i];
      const positionSlug = isGroup ? `${p.slug}-${slugParts[i]}` : p.slug;
      const positionName = isGroup ? `${p.name} — ${v.name}` : p.name;
      const positionSku = v.sku ?? p.sku;
      const attributes = isGroup ? (v.attributes ?? {}) : {};

      const positionData = {
        name: positionName,
        slug: positionSlug,
        description: p.description,
        price: v.price,
        compareAtPrice: p.compareAtPrice ?? null,
        sku: positionSku,
        stock: v.stock,
        categoryId: p.categoryId,
        groupId,
        brandId,
        metaTitle: p.metaTitle ?? null,
        metaDescription: p.metaDescription ?? null,
        attributes,
        positionOrder: i,
        isActive: true,
      };

      const position = await prisma.product.upsert({
        where: { slug: positionSlug },
        update: positionData,
        create: positionData,
      });
      positionCount++;

      // Clone the entry's images onto each position (shared gallery). Delete
      // existing first for idempotency. Dev seed uses deterministic
      // picsum.photos URLs (stable per position slug) so the storefront looks
      // populated without real uploads; the first image is the primary (cover).
      await prisma.productImage.deleteMany({ where: { productId: position.id } });
      for (const img of p.images) {
        await prisma.productImage.create({
          data: {
            productId: position.id,
            url: `https://picsum.photos/seed/${positionSlug}-${img.sortOrder}/800/800`,
            alt: img.alt,
            sortOrder: img.sortOrder,
            isPrimary: img.sortOrder === 0,
          },
        });
        imageCount++;
      }
    }
  }

  console.log(
    `  ✓ Products: ${groupCount} groups, ${positionCount} positions, ${imageCount} images`,
  );
}

/**
 * Seed approved product reviews so the storefront can render real star
 * ratings. Creates a pool of reviewer accounts and assigns each product a
 * deterministic, high-skewed set of ratings (believable 4.x averages with
 * some variance). Idempotent via the (userId, productId) unique constraint.
 */
async function seedReviews(prisma: PrismaClient) {
  const reviewerPasswordHash = await argon2.hash('Reviewer123!');
  const reviewers: { id: string }[] = [];
  for (let i = 1; i <= 20; i++) {
    const reviewer = await prisma.user.upsert({
      where: { email: `reviewer${i}@store.com` },
      update: {},
      create: {
        email: `reviewer${i}@store.com`,
        passwordHash: reviewerPasswordHash,
        firstName: 'Reviewer',
        lastName: String(i),
        role: 'CUSTOMER',
        isActive: true,
      },
    });
    reviewers.push(reviewer);
  }

  const products = await prisma.product.findMany({ select: { id: true, slug: true } });

  let reviewCount = 0;
  for (const product of products) {
    // 5..16 reviews per product, stable per slug.
    const count = 5 + (hashStr(product.slug) % (reviewers.length - 4));
    for (let i = 0; i < count; i++) {
      const reviewer = reviewers[i];
      // Ratings skew positive (mostly 4–5) with occasional lower scores.
      const r = hashStr(`${product.slug}:${i}`) % 100;
      const rating = r < 55 ? 5 : r < 80 ? 4 : r < 93 ? 3 : r < 98 ? 2 : 1;
      await prisma.review.upsert({
        where: { userId_productId: { userId: reviewer.id, productId: product.id } },
        update: { rating, isActive: true },
        create: {
          userId: reviewer.id,
          productId: product.id,
          rating,
          isActive: true,
        },
      });
      reviewCount++;
    }
  }

  // ── Pending (isActive: false) reviews for the admin moderation queue ──
  // Use DEDICATED reviewer accounts (separate from reviewer1..20 above) so the
  // (userId, productId) pairs never collide with the approved loop, which would
  // otherwise flip an approved review back to pending. UA comments so the
  // moderation screen shows realistic content.
  const pendingReviewers: { id: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const reviewer = await prisma.user.upsert({
      where: { email: `pending-reviewer${i}@store.com` },
      update: {},
      create: {
        email: `pending-reviewer${i}@store.com`,
        passwordHash: reviewerPasswordHash,
        firstName: 'Модерація',
        lastName: String(i),
        role: 'CUSTOMER',
        isActive: true,
      },
    });
    pendingReviewers.push(reviewer);
  }

  const pendingComments = [
    'Чудовий товар, прийшов швидко. Рекомендую!',
    'Все сподобалось, якість на висоті.',
    'Товар відповідає опису, дякую магазину.',
    'Нормально, але очікував трохи кращого пакування.',
    'Користуюсь тиждень — поки все влаштовує.',
    'Ціна виправдана, буду замовляти ще.',
  ];

  let pendingCount = 0;
  // Attach pending reviews to the first few products so the queue is populated.
  const pendingTargets = products.slice(0, pendingComments.length);
  for (let i = 0; i < pendingTargets.length; i++) {
    const product = pendingTargets[i];
    const reviewer = pendingReviewers[i % pendingReviewers.length];
    const rating = 3 + (hashStr(`pending:${product.slug}`) % 3); // 3..5
    await prisma.review.upsert({
      where: { userId_productId: { userId: reviewer.id, productId: product.id } },
      update: { rating, comment: pendingComments[i], isActive: false },
      create: {
        userId: reviewer.id,
        productId: product.id,
        rating,
        comment: pendingComments[i],
        isActive: false,
      },
    });
    pendingCount++;
  }

  console.log(
    `  ✓ Reviews: ${reviewCount} approved + ${pendingCount} pending across ${products.length} products`,
  );
}

async function seedAddresses(prisma: PrismaClient, customers: SeededUser[]) {
  // customers[0] is the demo John Doe account — keep the fixed `seed-address-1`
  // id it has always owned (documented in the seed guide) for backwards-compat.
  const john = customers[0];
  let addressCount = 0;

  await prisma.address.upsert({
    where: { id: 'seed-address-1' },
    update: {},
    create: {
      id: 'seed-address-1',
      userId: john.id,
      type: 'SHIPPING',
      firstName: 'John',
      lastName: 'Doe',
      address1: 'Вул. Хрещатик 22',
      city: 'Київ',
      state: 'Київська область',
      postalCode: '01001',
      country: 'UA',
      phone: '+380991234567',
      isDefault: true,
    },
  });
  addressCount++;

  // 1–2 UA addresses per new customer (deterministic ids — never `seed-address-1`).
  const addressPlans: Record<
    string,
    {
      firstName: string;
      lastName: string;
      phone: string;
      city: string;
      state: string;
      postalCode: string;
      address1: string;
      withBilling: boolean;
    }
  > = {
    'oksana@example.com': {
      firstName: 'Оксана',
      lastName: 'Шевченко',
      phone: '+380671112233',
      city: 'Львів',
      state: 'Львівська область',
      postalCode: '79000',
      address1: 'вул. Личаківська 45, кв. 12',
      withBilling: true,
    },
    'taras@example.com': {
      firstName: 'Тарас',
      lastName: 'Бондаренко',
      phone: '+380672223344',
      city: 'Одеса',
      state: 'Одеська область',
      postalCode: '65000',
      address1: 'вул. Дерибасівська 10, кв. 5',
      withBilling: false,
    },
    'mariia@example.com': {
      firstName: 'Марія',
      lastName: 'Коваль',
      phone: '+380673334455',
      city: 'Харків',
      state: 'Харківська область',
      postalCode: '61000',
      address1: 'просп. Науки 14, кв. 88',
      withBilling: true,
    },
    'dmytro@example.com': {
      firstName: 'Дмитро',
      lastName: 'Ткаченко',
      phone: '+380674445566',
      city: 'Дніпро',
      state: 'Дніпропетровська область',
      postalCode: '49000',
      address1: 'просп. Дмитра Яворницького 60, кв. 21',
      withBilling: false,
    },
    'nataliia@example.com': {
      firstName: 'Наталія',
      lastName: 'Кравченко',
      phone: '+380675556677',
      city: 'Київ',
      state: 'Київська область',
      postalCode: '02000',
      address1: 'вул. Володимирська 5, кв. 3',
      withBilling: false,
    },
  };

  for (const customer of customers) {
    const plan = addressPlans[customer.email];
    if (!plan) continue;

    await prisma.address.upsert({
      where: { id: deterministicUuid(`address-${customer.email}-1`) },
      update: {},
      create: {
        id: deterministicUuid(`address-${customer.email}-1`),
        userId: customer.id,
        type: 'SHIPPING',
        firstName: plan.firstName,
        lastName: plan.lastName,
        address1: plan.address1,
        city: plan.city,
        state: plan.state,
        postalCode: plan.postalCode,
        country: 'UA',
        phone: plan.phone,
        isDefault: true,
      },
    });
    addressCount++;

    if (plan.withBilling) {
      await prisma.address.upsert({
        where: { id: deterministicUuid(`address-${customer.email}-2`) },
        update: {},
        create: {
          id: deterministicUuid(`address-${customer.email}-2`),
          userId: customer.id,
          type: 'BILLING',
          firstName: plan.firstName,
          lastName: plan.lastName,
          address1: plan.address1,
          city: plan.city,
          state: plan.state,
          postalCode: plan.postalCode,
          country: 'UA',
          phone: plan.phone,
          isDefault: false,
        },
      });
      addressCount++;
    }
  }

  console.log(`  ✓ Addresses: ${addressCount} across ${customers.length} customers`);
}

/**
 * Seed the singleton site-contact settings row (TASK-154).
 * Uses the same well-known fixed ID as `SiteContactRepository.SINGLETON_ID`.
 * Idempotent: the upsert never duplicates the row.
 */
async function seedSiteContactSettings(prisma: PrismaClient) {
  const SINGLETON_ID = '00000000-0000-0000-0000-000000000001';

  await prisma.siteContactSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: {
      id: SINGLETON_ID,
      email: 'support@mobilestore.ua',
      phone: '+380 44 000 0000',
      workingHours: 'Пн–Нд: 9:00 – 20:00',
      viberLink: null,
      telegramLink: null,
      instagramLink: null,
    },
  });

  console.log('  ✓ SiteContactSettings: singleton row upserted');
}

/**
 * Seed the singleton SEO-settings row (TASK-239) with sensible zero-config
 * defaults so an untouched install already has decent SEO. Uses the same
 * well-known fixed ID as `SeoSettingsRepository.SINGLETON_ID`.
 *
 * Defaults per plan 116 §TASK-239:
 *   - defaultMetaTitle: null — let the content-derived fallback build titles
 *   - defaultMetaDescription: a generic store one-liner
 *   - titleTemplate: null — use the code default (`%s | ${SITE_NAME}`)
 *   - googleSiteVerification / bingSiteVerification: null — search-console
 *     verification not configured out of the box (plan 146)
 *   - noindexSite: false — assume production once this ships
 *   - additionalSameAsLinks: [] — none configured out of the box
 *
 * Idempotent: `update: {}` preserves any admin edits on re-seed.
 */
async function seedSeoSettings(prisma: PrismaClient) {
  const SINGLETON_ID = '00000000-0000-0000-0000-000000000002';

  await prisma.seoSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: {
      id: SINGLETON_ID,
      defaultMetaTitle: null,
      defaultMetaDescription:
        'Мультибрендовий інтернет-магазин аксесуарів для смартфонів та Apple-техніки в Україні. Доставка Новою Поштою, оплата у гривні.',
      titleTemplate: null,
      defaultOgImage: null,
      googleSiteVerification: null,
      bingSiteVerification: null,
      noindexSite: false,
      llmsTxtSummary: null,
      additionalSameAsLinks: [],
    },
  });

  console.log('  ✓ SeoSettings: singleton row upserted');
}

/**
 * Seed the global FAQ list (TASK-242, plan 116 Decision 3) with the 6 Q&A pairs
 * migrated verbatim from the storefront's former static `INFO_FAQS`
 * (`store-client/src/widgets/info-support/model/info-content.ts`) so the admin
 * sees real content on first load instead of an empty list. Fixed UUIDs make the
 * upsert idempotent; `update: {}` preserves any admin edits on re-seed.
 */
async function seedFaqItems(prisma: PrismaClient) {
  const faqs = [
    {
      id: 'fa900000-0000-4000-8000-000000000001',
      question: 'Скільки коштує доставка?',
      answer:
        'Доставка Новою Поштою — за тарифами перевізника, безкоштовно при замовленні від 1 000 ₴. Курʼєр по місту — 90 ₴, самовивіз із магазину — безкоштовно.',
    },
    {
      id: 'fa900000-0000-4000-8000-000000000002',
      question: 'Як швидко відправляєте замовлення?',
      answer:
        'Товари в наявності відправляємо день у день, якщо замовлення оформлене до 18:00. В інших випадках — наступного робочого дня.',
    },
    {
      id: 'fa900000-0000-4000-8000-000000000003',
      question: 'Чи можна повернути товар?',
      answer:
        'Так, протягом 14 днів ви можете повернути товар належної якості в повній комплектації. Гроші повертаємо протягом 3–7 банківських днів.',
    },
    {
      id: 'fa900000-0000-4000-8000-000000000004',
      question: 'Яка гарантія на техніку?',
      answer:
        'Уся техніка має офіційну гарантію виробника від 12 до 24 місяців. Гарантійний талон додається до замовлення.',
    },
    {
      id: 'fa900000-0000-4000-8000-000000000005',
      question: 'Чи перевіряєте товар перед відправкою?',
      answer:
        'Так, кожен пристрій проходить передпродажну перевірку комплектації та зовнішнього стану.',
    },
    {
      id: 'fa900000-0000-4000-8000-000000000006',
      question: 'Як скористатися бонусами?',
      answer:
        'Бонуси нараховуються за кожну покупку та зберігаються в кабінеті. Ними можна оплатити до 30% суми наступного замовлення.',
    },
  ];

  for (const [index, faq] of faqs.entries()) {
    await prisma.faqItem.upsert({
      where: { id: faq.id },
      update: {},
      create: {
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        sortOrder: index,
        isActive: true,
      },
    });
  }

  console.log(`  ✓ Seeded ${faqs.length} FAQ items`);
}

/**
 * Seed the blog: 5 categories + the 12 posts that were previously hardcoded in
 * the storefront (`store-client/src/widgets/blog/model/posts.ts`). Every post is
 * seeded PUBLISHED with the ISO publish date from that file, and shares the demo
 * article body (moved server-side from the storefront). Idempotent — upsert by
 * slug for both categories and posts (TASK-170).
 */
async function seedBlog(prisma: PrismaClient) {
  const categoriesData = [
    { slug: 'reviews', name: 'Огляди', sortOrder: 1 },
    { slug: 'guides', name: 'Гайди', sortOrder: 2 },
    { slug: 'news', name: 'Новини', sortOrder: 3 },
    { slug: 'tips', name: 'Поради', sortOrder: 4 },
    { slug: 'compare', name: 'Порівняння', sortOrder: 5 },
  ];

  const categoryIds: Record<string, string> = {};
  for (const cat of categoriesData) {
    const record = await prisma.blogCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, sortOrder: cat.sortOrder },
      create: cat,
    });
    categoryIds[cat.slug] = record.id;
  }

  // Shared demo article body — moved server-side from the storefront mockup.
  // Only allow-listed tags (sanitized below). h2 headings drive the storefront
  // table of contents (ids are derived client-side from the heading text).
  const demoBody = sanitizeRichText(`
    <p>Кожної осені виробники ставлять власників попередньої моделі перед тим
    самим питанням: оновлюватись чи ні. Розкладемо все по поличках — без
    маркетингу й зайвого шуму.</p>
    <h2>Дизайн і матеріали</h2>
    <p>Зовні пристрій майже не змінився: та сама рамка, ті самі габарити.
    Головна зовнішня новинка — оновлене керування та матовіше скло ззаду.</p>
    <ul>
      <li>Нова тактильна кнопка з підтримкою жестів</li>
      <li>Оновлена система охолодження — менше тротлінгу в іграх</li>
      <li>Ті самі кольори корпусу, але приємніший на дотик матеріал</li>
    </ul>
    <h2>Камери</h2>
    <p>Основний сенсор підріс, але найбільша різниця — в обробці. Нічний режим
    витягує більше деталей у тінях, а портрети тепер можна перефокусовувати вже
    після зйомки.</p>
    <blockquote>«Якщо камера — головна причина покупки, апгрейд відчутний.
    У решті сценаріїв різниця косметична.»</blockquote>
    <h2>Продуктивність і батарея</h2>
    <p>Чип швидший, але в щоденних задачах ви цього не помітите. Різниця
    розкривається в іграх та важкому монтажі. Автономність підросла приблизно на
    годину активного екрана.</p>
    <h2>Підсумок</h2>
    <p>Це впевнене, але еволюційне оновлення. Якщо ваш поточний пристрій працює
    добре, поспішати нема куди. Якщо ж ви на старшій моделі або багато
    фотографуєте — новинка того варта.</p>
  `);

  const postsData: {
    slug: string;
    cat: string;
    title: string;
    excerpt: string;
    author: string;
    readingMinutes: number;
    publishedAt: string;
    featured?: boolean;
  }[] = [
    {
      slug: 'iphone16-vs-15',
      cat: 'compare',
      title: 'iPhone 16 проти iPhone 15: чи варто оновлюватись',
      excerpt:
        'Розібрали камери, продуктивність A18 та автономність — кому справді потрібен апгрейд, а кому вистачить попередньої моделі.',
      author: 'Олег Пилипенко',
      readingMinutes: 8,
      publishedAt: '2026-06-28',
      featured: true,
    },
    {
      slug: 'choose-headphones',
      cat: 'guides',
      title: 'Як обрати бездротові навушники у 2026 році',
      excerpt:
        'ANC, кодеки, час роботи й затримка звуку — простий чек-лист, за яким ви не помилитесь із вибором.',
      author: 'Ірина Ткач',
      readingMinutes: 6,
      publishedAt: '2026-06-25',
    },
    {
      slug: 'powerbank-guide',
      cat: 'guides',
      title: 'Скільки mAh потрібно саме вам: гайд по павербанках',
      excerpt:
        'Рахуємо реальну ємність, розбираємось із швидкою зарядкою та GaN — і не переплачуємо за зайві грами.',
      author: 'Ірина Ткач',
      readingMinutes: 5,
      publishedAt: '2026-06-22',
    },
    {
      slug: 'galaxy-s26-review',
      cat: 'reviews',
      title: 'Огляд Samsung Galaxy S26 Ultra: два тижні з флагманом',
      excerpt:
        'Екран, камери на 200 Мп, S Pen і батарея — що вражає, а до чого доведеться звикати.',
      author: 'Олег Пилипенко',
      readingMinutes: 11,
      publishedAt: '2026-06-20',
      featured: true,
    },
    {
      slug: 'macbook-air-m3',
      cat: 'reviews',
      title: 'MacBook Air M3 для роботи й навчання: чесний досвід',
      excerpt:
        'Чи вистачить 8 ГБ памʼяті, як щодо нагріву без кулера та скільки живе батарея в реальних задачах.',
      author: 'Марія Литвин',
      readingMinutes: 9,
      publishedAt: '2026-06-17',
    },
    {
      slug: 'trade-in-how',
      cat: 'tips',
      title: 'Trade-in: як вигідно обміняти старий смартфон',
      excerpt:
        'Готуємо пристрій до оцінки, дивимось, що впливає на ціну, і не втрачаємо на дрібницях.',
      author: 'Андрій Мороз',
      readingMinutes: 4,
      publishedAt: '2026-06-14',
    },
    {
      slug: 'smart-home-start',
      cat: 'guides',
      title: 'Розумний дім з нуля: з чого почати без зайвих витрат',
      excerpt:
        'Лампи, розетки, датчики та хаб — базовий набір, який реально економить час і гроші.',
      author: 'Марія Литвин',
      readingMinutes: 7,
      publishedAt: '2026-06-11',
    },
    {
      slug: 'new-arrivals-june',
      cat: 'news',
      title: 'Новинки червня: що завезли до MobileStore цього місяця',
      excerpt: 'Свіжі флагмани, аудіо та аксесуари — коротко про найцікавіші релізи та ціни.',
      author: 'Редакція MobileStore',
      readingMinutes: 3,
      publishedAt: '2026-06-08',
    },
    {
      slug: 'protect-screen',
      cat: 'tips',
      title: 'Захисне скло чи плівка: що краще для вашого екрана',
      excerpt:
        'Порівнюємо типи захисту, розвіюємо міфи про олеофобне покриття та вчимось клеїти без пузирів.',
      author: 'Андрій Мороз',
      readingMinutes: 5,
      publishedAt: '2026-06-05',
    },
    {
      slug: 'gaming-laptop-2026',
      cat: 'compare',
      title: 'Ігрові ноутбуки 2026: як не переплатити за зайве',
      excerpt:
        'RTX проти інтегрованої графіки, частота екрана й охолодження — на що дивитись перед покупкою.',
      author: 'Олег Пилипенко',
      readingMinutes: 10,
      publishedAt: '2026-06-02',
    },
    {
      slug: 'battery-health',
      cat: 'tips',
      title: '5 звичок, що збережуть батарею смартфона надовго',
      excerpt:
        'Прості правила зарядки й налаштувань, які реально сповільнюють деградацію акумулятора.',
      author: 'Ірина Ткач',
      readingMinutes: 4,
      publishedAt: '2026-05-30',
    },
    {
      slug: 'tv-buying-guide',
      cat: 'guides',
      title: 'OLED, QLED чи Mini-LED: обираємо телевізор під кімнату',
      excerpt:
        'Розбираємось у типах матриць, яскравості та частоті — і підбираємо діагональ під відстань перегляду.',
      author: 'Марія Литвин',
      readingMinutes: 8,
      publishedAt: '2026-05-27',
    },
  ];

  for (const post of postsData) {
    const publishedAt = new Date(`${post.publishedAt}T09:00:00.000Z`);
    const data = {
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: demoBody,
      authorName: post.author,
      readingMinutes: post.readingMinutes,
      featured: post.featured ?? false,
      categoryId: categoryIds[post.cat],
      status: 'PUBLISHED' as const,
      publishedAt,
      scheduledAt: null,
    };
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: data,
      create: data,
    });
  }

  console.log(`  ✓ Blog: ${categoriesData.length} categories, ${postsData.length} posts upserted`);
}

/**
 * Seed a couple of published homepage banners per placement (TASK-186).
 * Idempotent via a deterministic id keyed on placement + slot. The storefront
 * renders its hardcoded fallback when a placement has none, so this seed is a
 * convenience for local development, not a requirement.
 */
async function seedBanners(prisma: PrismaClient) {
  const banners = [
    {
      placement: 'HERO_SLIDE' as const,
      slot: 'hero-1',
      title: 'Аксесуари для вашого iPhone',
      subtitle: 'Чохли, захисне скло та зарядки — усе в одному місці',
      imageUrl: '/images/banners/hero-accessories.jpg',
      ctaLabel: 'До каталогу',
      ctaHref: '/catalog',
      theme: 'accent',
      sortOrder: 0,
    },
    {
      placement: 'HERO_SLIDE' as const,
      slot: 'hero-2',
      title: 'Нова колекція навушників',
      subtitle: 'Занурся у звук без компромісів',
      imageUrl: '/images/banners/hero-audio.jpg',
      ctaLabel: 'Обрати',
      ctaHref: '/catalog?category=audio',
      theme: 'default',
      sortOrder: 1,
    },
    {
      placement: 'PROMO_TILE' as const,
      slot: 'promo-tile-1',
      title: 'Захисне скло',
      subtitle: '-30% на другий комплект',
      imageUrl: '/images/banners/promo-glass.jpg',
      ctaLabel: 'Купити',
      ctaHref: '/catalog?category=protection',
      theme: 'accent',
      sortOrder: 0,
    },
    {
      placement: 'PROMO_TILE' as const,
      slot: 'promo-tile-2',
      title: 'Power banks',
      subtitle: 'Заряд на весь день',
      imageUrl: '/images/banners/promo-power.jpg',
      ctaLabel: 'Дивитись',
      ctaHref: '/catalog?category=power',
      theme: 'default',
      sortOrder: 1,
    },
    {
      placement: 'PROMO_BANNER' as const,
      slot: 'promo-banner-1',
      title: 'Безкоштовна доставка від 1000 грн',
      subtitle: 'Новою поштою по всій Україні',
      imageUrl: '/images/banners/promo-shipping.jpg',
      ctaLabel: 'Замовити',
      ctaHref: '/catalog',
      theme: 'accent',
      sortOrder: 0,
    },
    {
      placement: 'ANNOUNCEMENT_BAR' as const,
      slot: 'announcement-1',
      title: 'Літній розпродаж уже почався — знижки до -50%',
      subtitle: null,
      imageUrl: null,
      ctaLabel: 'Детальніше',
      ctaHref: '/catalog?sale=true',
      theme: 'accent',
      sortOrder: 0,
    },
  ];

  const now = new Date();

  for (const b of banners) {
    const id = deterministicUuid(`banner:${b.placement}:${b.slot}`);
    const data = {
      placement: b.placement,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      ctaLabel: b.ctaLabel,
      ctaHref: b.ctaHref,
      theme: b.theme,
      sortOrder: b.sortOrder,
      status: 'PUBLISHED' as const,
      publishedAt: now,
      scheduledAt: null,
    };

    await prisma.banner.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  console.log(`  ✓ Banners: ${banners.length} published banners upserted`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Seed the device-compatibility taxonomy (TASK-190): a representative slice of
 * device brands + models grouped by `series` for the storefront ModelPicker
 * cascade. Idempotent — brands and models upsert on their unique `slug`, safe to
 * re-run. Compat assignment (Product ↔ DeviceModel) is intentionally NOT seeded
 * here — admins tag products via the admin UI / a separate backfill.
 */
async function seedDevices(prisma: PrismaClient) {
  // brand → ordered list of { name, series, releaseYear } models.
  const devices: Array<{
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

  let brandCount = 0;
  let modelCount = 0;
  for (const { brand, sortOrder, models } of devices) {
    const brandSlug = slugify(brand);
    const brandRecord = await prisma.deviceBrand.upsert({
      where: { slug: brandSlug },
      update: { name: brand, sortOrder, isActive: true },
      create: { name: brand, slug: brandSlug, sortOrder, isActive: true },
    });
    brandCount++;

    for (const model of models) {
      // Expand '+' to ' plus ' before slugifying so e.g. "Galaxy S24+" does not
      // collide with "Galaxy S24" (both would otherwise slug to "galaxy-s24").
      const modelSlug = slugify(model.name.replace(/\+/g, ' plus '));
      await prisma.deviceModel.upsert({
        where: { slug: modelSlug },
        update: {
          name: model.name,
          series: model.series,
          releaseYear: model.releaseYear,
          deviceBrandId: brandRecord.id,
          isActive: true,
        },
        create: {
          name: model.name,
          slug: modelSlug,
          series: model.series,
          releaseYear: model.releaseYear,
          deviceBrandId: brandRecord.id,
          isActive: true,
        },
      });
      modelCount++;
    }
  }

  console.log(`  ✓ Seeded ${brandCount} device brands, ${modelCount} device models`);
}

/**
 * Seed structured-spec templates (TASK-191) on the Смартфони root category and
 * fill their values on the seeded iPhone products. Definitions are inherited
 * down the subtree at read time (iPhone → its ancestor Смартфони), so declaring
 * them once on the root covers every phone subcategory. Idempotent — definitions
 * upsert on the `(categoryId, key)` unique; values on `(productId, definitionId)`.
 */
async function seedAttributeDefinitions(
  prisma: PrismaClient,
  categories: Record<string, { id: string }>,
) {
  const smartphonesCategoryId = categories['smartphones'].id;

  const definitionsData: {
    key: string;
    label: string;
    type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
    unit?: string;
    options?: string[];
    isFilterable: boolean;
  }[] = [
    { key: 'screen', label: 'Екран', type: 'TEXT', isFilterable: false },
    {
      key: 'memory',
      label: "Пам'ять",
      type: 'SELECT',
      options: ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
      isFilterable: true,
    },
    { key: 'camera', label: 'Камера', type: 'TEXT', isFilterable: false },
    { key: 'battery', label: 'Акумулятор', type: 'NUMBER', unit: 'мА·год', isFilterable: false },
  ];

  const definitionIds: Record<string, string> = {};
  for (let i = 0; i < definitionsData.length; i++) {
    const d = definitionsData[i];
    const record = await prisma.attributeDefinition.upsert({
      where: { categoryId_key: { categoryId: smartphonesCategoryId, key: d.key } },
      update: {
        label: d.label,
        type: d.type,
        unit: d.unit ?? null,
        options: d.options ?? undefined,
        isFilterable: d.isFilterable,
        sortOrder: i,
      },
      create: {
        categoryId: smartphonesCategoryId,
        key: d.key,
        label: d.label,
        type: d.type,
        unit: d.unit ?? null,
        options: d.options ?? undefined,
        isFilterable: d.isFilterable,
        sortOrder: i,
      },
    });
    definitionIds[d.key] = record.id;
  }

  // Per-model fixed specs (screen/camera/battery); memory comes from the
  // position's own `storage` variant axis (or a default for standalone models).
  const modelSpecs = (slug: string): { screen: string; camera: string; battery: number } | null => {
    if (slug.startsWith('apple-iphone-15-pro')) {
      return {
        screen: '6.1" OLED Super Retina XDR ProMotion 120 Гц',
        camera: 'Потрійна 48 Мп + 12 Мп + 12 Мп',
        battery: 3274,
      };
    }
    if (slug.startsWith('apple-iphone-14')) {
      return {
        screen: '6.1" OLED Super Retina XDR',
        camera: 'Подвійна 12 Мп + 12 Мп',
        battery: 3279,
      };
    }
    if (slug.startsWith('apple-iphone-13')) {
      return {
        screen: '6.1" OLED Super Retina XDR',
        camera: 'Подвійна 12 Мп + 12 Мп',
        battery: 3240,
      };
    }
    return null;
  };

  const iphoneProducts = await prisma.product.findMany({
    where: { category: { slug: 'iphone' } },
    select: { id: true, slug: true, attributes: true },
  });

  let valueCount = 0;
  const upsertValue = async (
    productId: string,
    definitionId: string,
    value: string,
    valueNumber: number | null,
  ) => {
    await prisma.productAttributeValue.upsert({
      where: { productId_definitionId: { productId, definitionId } },
      update: { value, valueNumber },
      create: { productId, definitionId, value, valueNumber },
    });
    valueCount++;
  };

  for (const product of iphoneProducts) {
    const specs = modelSpecs(product.slug);
    if (!specs) continue;

    const attrs = (product.attributes ?? {}) as Record<string, unknown>;
    const memory = typeof attrs.storage === 'string' ? attrs.storage : '128 ГБ';

    await upsertValue(product.id, definitionIds['screen'], specs.screen, null);
    await upsertValue(product.id, definitionIds['memory'], memory, null);
    await upsertValue(product.id, definitionIds['camera'], specs.camera, null);
    await upsertValue(product.id, definitionIds['battery'], String(specs.battery), specs.battery);
  }

  console.log(
    `  ✓ Attribute definitions: ${definitionsData.length} on Смартфони, ${valueCount} values on iPhones`,
  );
}

/**
 * Seed a few Product ↔ DeviceModel compatibility links (TASK-190) so the
 * storefront compat picker and PDP "fits your device" surface have real data.
 * Links accessories (cases / chargers / protectors) to seeded Apple device
 * models. Idempotent — the composite `(productId, deviceModelId)` primary key
 * makes re-assigning the same pair a no-op upsert.
 */
async function seedDeviceCompat(prisma: PrismaClient) {
  // Base entry slug (matches all colour/pack positions of a group) → device
  // model slugs (as produced by seedDevices' slugify).
  const compatPlan: { productSlugPrefix: string; deviceSlugs: string[] }[] = [
    {
      productSlugPrefix: slugify('Silicone Case for iPhone 15'),
      deviceSlugs: ['iphone-15', 'iphone-15-plus'],
    },
    {
      productSlugPrefix: slugify('Clear MagSafe Case for iPhone 15 Pro'),
      deviceSlugs: ['iphone-15-pro', 'iphone-15-pro-max'],
    },
    {
      productSlugPrefix: slugify('Tempered Glass Screen Protector for iPhone 15'),
      deviceSlugs: ['iphone-15', 'iphone-15-plus'],
    },
    {
      productSlugPrefix: slugify('15W Qi Wireless Charging Pad'),
      deviceSlugs: ['iphone-15', 'iphone-15-pro', 'iphone-14', 'iphone-13'],
    },
    {
      productSlugPrefix: slugify('20W USB-C Wall Charger'),
      deviceSlugs: ['iphone-15', 'iphone-15-pro', 'iphone-14'],
    },
  ];

  const allDeviceSlugs = Array.from(new Set(compatPlan.flatMap((c) => c.deviceSlugs)));
  const deviceModels = await prisma.deviceModel.findMany({
    where: { slug: { in: allDeviceSlugs } },
    select: { id: true, slug: true },
  });
  const deviceBySlug = new Map(deviceModels.map((m) => [m.slug, m.id]));

  const allProducts = await prisma.product.findMany({ select: { id: true, slug: true } });

  let linkCount = 0;
  for (const plan of compatPlan) {
    const positions = allProducts.filter((p) => p.slug.startsWith(plan.productSlugPrefix));
    for (const position of positions) {
      for (const deviceSlug of plan.deviceSlugs) {
        const deviceModelId = deviceBySlug.get(deviceSlug);
        if (!deviceModelId) continue;
        await prisma.productDeviceCompat.upsert({
          where: {
            productId_deviceModelId: { productId: position.id, deviceModelId },
          },
          update: {},
          create: { productId: position.id, deviceModelId },
        });
        linkCount++;
      }
    }
  }

  console.log(`  ✓ Device compat: ${linkCount} product ↔ device links`);
}

/**
 * Seed promo codes / coupons (TASK-079). Codes are stored UPPERCASE and matched
 * case-insensitively by the discount service. Covers percent + fixed types, an
 * active set, one expired, and one deactivated code so the admin list and the
 * checkout apply-code flow both have realistic data. Idempotent — upsert on the
 * unique `code`; `redeemedCount` is NOT overwritten on update (seedOrders owns it).
 */
async function seedDiscounts(prisma: PrismaClient) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const discountsData: {
    code: string;
    type: 'PERCENT' | 'FIXED';
    value: number;
    minSpend?: number;
    maxRedemptions?: number;
    perUserLimit?: number;
    startsAt?: Date;
    expiresAt?: Date;
    isActive: boolean;
  }[] = [
    { code: 'WELCOME10', type: 'PERCENT', value: 10, perUserLimit: 1, isActive: true },
    { code: 'SUMMER500', type: 'FIXED', value: 500, minSpend: 3000, isActive: true },
    {
      code: 'VIP20',
      type: 'PERCENT',
      value: 20,
      maxRedemptions: 100,
      perUserLimit: 1,
      isActive: true,
    },
    {
      code: 'EXPIRED15',
      type: 'PERCENT',
      value: 15,
      startsAt: new Date(now - 60 * day),
      expiresAt: new Date(now - 5 * day),
      isActive: true,
    },
    { code: 'OLDPROMO', type: 'FIXED', value: 200, isActive: false },
  ];

  for (const d of discountsData) {
    await prisma.discount.upsert({
      where: { code: d.code },
      update: {
        type: d.type,
        value: d.value,
        minSpend: d.minSpend ?? null,
        maxRedemptions: d.maxRedemptions ?? null,
        perUserLimit: d.perUserLimit ?? null,
        startsAt: d.startsAt ?? null,
        expiresAt: d.expiresAt ?? null,
        isActive: d.isActive,
      },
      create: {
        code: d.code,
        type: d.type,
        value: d.value,
        minSpend: d.minSpend ?? null,
        maxRedemptions: d.maxRedemptions ?? null,
        perUserLimit: d.perUserLimit ?? null,
        startsAt: d.startsAt ?? null,
        expiresAt: d.expiresAt ?? null,
        isActive: d.isActive,
      },
    });
  }

  console.log(`  ✓ Discounts: ${discountsData.length} upserted`);
}

/**
 * Seed a spread of orders (TASK-020/028/251) covering EVERY OrderStatus and
 * EVERY PaymentStatus, with 1–4 line items each (price captured at purchase),
 * computed money fields, UA shipping addresses, a couple of discount redemptions,
 * and a realistic append-only OrderStatusHistory trail per order. Deterministic
 * ids keyed on the order key make the whole thing idempotent; the item list and
 * history trail are deleted + recreated wholesale each run.
 */
async function seedOrders(prisma: PrismaClient, admins: { id: string }[], customers: SeededUser[]) {
  const money = (n: number) => Math.round(n * 100) / 100;
  const customerByEmail = new Map(customers.map((c) => [c.email, c]));

  // Recipient names for the shipping-address JSON.
  const userRecords = await prisma.user.findMany({
    where: { id: { in: customers.map((c) => c.id) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameById = new Map(
    userRecords.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]),
  );

  // sku → { id, price } for every seeded product position.
  const products = await prisma.product.findMany({ select: { id: true, sku: true, price: true } });
  const bySku = new Map(
    products
      .filter((p): p is { id: string; sku: string; price: (typeof p)['price'] } => p.sku !== null)
      .map((p) => [p.sku, { id: p.id, price: Number(p.price) }]),
  );

  // code → { id } for discounts used by the orders below.
  const discounts = await prisma.discount.findMany({ select: { id: true, code: true } });
  const discountByCode = new Map(discounts.map((d) => [d.code, d.id]));

  type OrderStatus =
    | 'PENDING'
    | 'CONFIRMED'
    | 'PROCESSING'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'REFUNDED';
  type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

  interface OrderSpec {
    key: string;
    email: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    statusFlow: OrderStatus[];
    paymentFlow: PaymentStatus[];
    items: { sku: string; quantity: number }[];
    discountCode?: string;
    notes?: string;
    daysAgo: number;
    city: string;
    warehouse: string;
    selfCancel?: boolean;
  }

  const orderSpecs: OrderSpec[] = [
    {
      key: 'john-1',
      email: 'customer@store.com',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      statusFlow: ['PENDING'],
      paymentFlow: ['PENDING'],
      items: [{ sku: 'IP14-128', quantity: 1 }],
      notes: 'Оплата при отриманні у відділенні.',
      daysAgo: 1,
      city: 'Київ',
      warehouse: 'Відділення №12',
    },
    {
      key: 'oksana-1',
      email: 'oksana@example.com',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      statusFlow: ['PENDING', 'CONFIRMED'],
      paymentFlow: ['PENDING', 'PAID'],
      items: [
        { sku: 'CASE-IP15-SIL-BK', quantity: 2 },
        { sku: 'SP-IP15-TG-1', quantity: 1 },
      ],
      daysAgo: 2,
      city: 'Львів',
      warehouse: 'Відділення №5',
    },
    {
      key: 'taras-1',
      email: 'taras@example.com',
      status: 'PROCESSING',
      paymentStatus: 'PAID',
      statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING'],
      paymentFlow: ['PENDING', 'PAID'],
      items: [
        { sku: 'CHG-WALL-20W-WH', quantity: 1 },
        { sku: 'CAB-USBC-USBC-1B', quantity: 2 },
      ],
      notes: 'Прохання зателефонувати перед відправкою.',
      daysAgo: 3,
      city: 'Одеса',
      warehouse: 'Відділення №21',
    },
    {
      key: 'mariia-1',
      email: 'mariia@example.com',
      status: 'SHIPPED',
      paymentStatus: 'PAID',
      statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'],
      paymentFlow: ['PENDING', 'PAID'],
      items: [{ sku: 'IP15PRO-128-NT', quantity: 1 }],
      discountCode: 'WELCOME10',
      daysAgo: 4,
      city: 'Харків',
      warehouse: 'Відділення №88',
    },
    {
      key: 'dmytro-1',
      email: 'dmytro@example.com',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
      paymentFlow: ['PENDING', 'PAID'],
      items: [
        { sku: 'IP15PRO-256-BT', quantity: 1 },
        { sku: 'CHG-WRLS-15W-BK', quantity: 1 },
      ],
      discountCode: 'SUMMER500',
      daysAgo: 10,
      city: 'Дніпро',
      warehouse: 'Відділення №3',
    },
    {
      key: 'nataliia-1',
      email: 'nataliia@example.com',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
      paymentFlow: ['PENDING', 'PAID'],
      items: [
        { sku: 'CASE-IP15-SIL-BK', quantity: 1 },
        { sku: 'CHG-CAR-30W-BK', quantity: 1 },
      ],
      daysAgo: 14,
      city: 'Київ',
      warehouse: 'Відділення №7',
    },
    {
      key: 'oksana-2',
      email: 'oksana@example.com',
      status: 'CANCELLED',
      paymentStatus: 'FAILED',
      statusFlow: ['PENDING', 'CANCELLED'],
      paymentFlow: ['PENDING', 'FAILED'],
      items: [{ sku: 'IP13-128', quantity: 1 }],
      notes: 'Оплату відхилено банком, замовлення скасовано.',
      daysAgo: 6,
      city: 'Львів',
      warehouse: 'Відділення №5',
    },
    {
      key: 'taras-2',
      email: 'taras@example.com',
      status: 'CANCELLED',
      paymentStatus: 'PENDING',
      statusFlow: ['PENDING', 'CANCELLED'],
      paymentFlow: ['PENDING'],
      items: [{ sku: 'CAB-MUSB-1B', quantity: 3 }],
      notes: 'Клієнт скасував замовлення самостійно.',
      daysAgo: 5,
      city: 'Одеса',
      warehouse: 'Відділення №21',
      selfCancel: true,
    },
    {
      key: 'mariia-2',
      email: 'mariia@example.com',
      status: 'REFUNDED',
      paymentStatus: 'REFUNDED',
      statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'REFUNDED'],
      paymentFlow: ['PENDING', 'PAID', 'REFUNDED'],
      items: [{ sku: 'IP14-128', quantity: 1 }],
      notes: 'Повернення товару впродовж 14 днів, кошти повернено.',
      daysAgo: 20,
      city: 'Харків',
      warehouse: 'Відділення №88',
    },
    {
      key: 'dmytro-2',
      email: 'dmytro@example.com',
      status: 'PROCESSING',
      paymentStatus: 'PENDING',
      statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING'],
      paymentFlow: ['PENDING'],
      items: [{ sku: 'CHG-WALL-65W-BK', quantity: 1 }],
      notes: 'Накладений платіж (оплата при отриманні).',
      daysAgo: 2,
      city: 'Дніпро',
      warehouse: 'Відділення №3',
    },
    {
      key: 'nataliia-2',
      email: 'nataliia@example.com',
      status: 'SHIPPED',
      paymentStatus: 'PAID',
      statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'],
      paymentFlow: ['PENDING', 'PAID'],
      items: [
        { sku: 'SP-SGS24-PET-1', quantity: 2 },
        { sku: 'CASE-SGS24-ARM-BK', quantity: 1 },
      ],
      daysAgo: 4,
      city: 'Київ',
      warehouse: 'Відділення №7',
    },
    {
      key: 'john-2',
      email: 'customer@store.com',
      status: 'DELIVERED',
      paymentStatus: 'REFUNDED',
      statusFlow: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
      paymentFlow: ['PENDING', 'PAID', 'REFUNDED'],
      items: [{ sku: 'CHG-WRLS-15W-WH', quantity: 1 }],
      notes: 'Частковий брак — оформлено повернення коштів.',
      daysAgo: 25,
      city: 'Київ',
      warehouse: 'Відділення №12',
    },
  ];

  // changedAt offsets (hours from order.createdAt) per target enum. Distinct per
  // enum so sorting the combined status + payment rows yields a monotonic,
  // realistic timeline (e.g. FAILED payment before CANCELLED status).
  const statusOffsetHours: Record<OrderStatus, number> = {
    PENDING: 0,
    CONFIRMED: 4,
    PROCESSING: 24,
    SHIPPED: 48,
    DELIVERED: 96,
    CANCELLED: 12,
    REFUNDED: 120,
  };
  const paymentOffsetHours: Record<PaymentStatus, number> = {
    PENDING: 0,
    PAID: 2,
    FAILED: 6,
    REFUNDED: 121,
  };

  const hour = 60 * 60 * 1000;
  const redemptionCountByCode = new Map<string, number>();
  let orderCount = 0;
  let itemCount = 0;
  let historyCount = 0;

  for (const spec of orderSpecs) {
    const customer = customerByEmail.get(spec.email);
    if (!customer) throw new Error(`seedOrders: unknown customer ${spec.email}`);

    const orderId = deterministicUuid(`order-${spec.key}`);
    const createdAt = new Date(Date.now() - spec.daysAgo * 24 * hour);

    // Resolve line items + capture price at purchase.
    const items = spec.items.map((line) => {
      const product = bySku.get(line.sku);
      if (!product) throw new Error(`seedOrders: unknown product sku ${line.sku}`);
      return { productId: product.id, quantity: line.quantity, price: product.price };
    });

    const subtotal = money(items.reduce((sum, it) => sum + it.price * it.quantity, 0));

    let discount = 0;
    if (spec.discountCode === 'WELCOME10') discount = money(subtotal * 0.1);
    else if (spec.discountCode === 'SUMMER500') discount = money(Math.min(500, subtotal));

    const shippingCost = subtotal - discount >= 2000 ? 0 : 90;
    const tax = 0;
    const total = money(subtotal - discount + shippingCost + tax);

    const orderData = {
      userId: customer.id,
      status: spec.status,
      paymentStatus: spec.paymentStatus,
      subtotal,
      discount,
      discountCode: spec.discountCode ?? null,
      shippingCost,
      tax,
      total,
      shippingAddress: {
        recipient: nameById.get(customer.id) ?? spec.email,
        city: spec.city,
        warehouse: spec.warehouse,
        carrier: 'Нова Пошта',
      },
      notes: spec.notes ?? null,
    };

    await prisma.order.upsert({
      where: { id: orderId },
      update: orderData,
      create: { id: orderId, createdAt, ...orderData },
    });
    orderCount++;

    // Line items — replace wholesale for idempotency.
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.orderItem.createMany({
      data: items.map((it) => ({
        orderId,
        productId: it.productId,
        quantity: it.quantity,
        price: it.price,
      })),
    });
    itemCount += items.length;

    // Discount redemption (unique on orderId → idempotent upsert).
    if (spec.discountCode) {
      const discountId = discountByCode.get(spec.discountCode);
      if (discountId) {
        await prisma.discountRedemption.upsert({
          where: { orderId },
          update: {},
          create: { discountId, userId: customer.id, orderId },
        });
        redemptionCountByCode.set(
          spec.discountCode,
          (redemptionCountByCode.get(spec.discountCode) ?? 0) + 1,
        );
      }
    }

    // Append-only status history — delete + rebuild the trail each run.
    await prisma.orderStatusHistory.deleteMany({ where: { orderId } });

    const adminId = admins[orderCount % admins.length].id;
    interface HistoryRow {
      offset: number;
      changeType: 'STATUS' | 'PAYMENT_STATUS';
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus | null;
      fromPaymentStatus: PaymentStatus | null;
      toPaymentStatus: PaymentStatus | null;
      changedBy: string | null;
    }
    const rows: HistoryRow[] = [];

    // STATUS rows: initial null→PENDING is system (null); later transitions are
    // admin-driven, except a customer self-cancel.
    for (let i = 0; i < spec.statusFlow.length; i++) {
      const to = spec.statusFlow[i];
      const from = i === 0 ? null : spec.statusFlow[i - 1];
      let changedBy: string | null;
      if (i === 0) changedBy = null;
      else if (to === 'CANCELLED' && spec.selfCancel) changedBy = customer.id;
      else changedBy = adminId;
      rows.push({
        offset: statusOffsetHours[to],
        changeType: 'STATUS',
        fromStatus: from,
        toStatus: to,
        fromPaymentStatus: null,
        toPaymentStatus: null,
        changedBy,
      });
    }

    // PAYMENT_STATUS rows: PENDING→PAID and →FAILED are system/webhook (null);
    // →REFUNDED is an admin action.
    for (let i = 1; i < spec.paymentFlow.length; i++) {
      const to = spec.paymentFlow[i];
      const from = spec.paymentFlow[i - 1];
      rows.push({
        offset: paymentOffsetHours[to],
        changeType: 'PAYMENT_STATUS',
        fromStatus: null,
        toStatus: null,
        fromPaymentStatus: from,
        toPaymentStatus: to,
        changedBy: to === 'REFUNDED' ? adminId : null,
      });
    }

    rows.sort((a, b) => a.offset - b.offset);
    for (const row of rows) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId,
          changeType: row.changeType,
          fromStatus: row.fromStatus,
          toStatus: row.toStatus,
          fromPaymentStatus: row.fromPaymentStatus,
          toPaymentStatus: row.toPaymentStatus,
          changedBy: row.changedBy,
          changedAt: new Date(createdAt.getTime() + row.offset * hour),
        },
      });
      historyCount++;
    }
  }

  // Sync redeemedCount on the discounts actually redeemed above (keeps the admin
  // discount list consistent with the seeded redemptions; idempotent).
  for (const [code, count] of redemptionCountByCode) {
    await prisma.discount.update({ where: { code }, data: { redeemedCount: count } });
  }

  console.log(`  ✓ Orders: ${orderCount} orders, ${itemCount} items, ${historyCount} history rows`);
}

/**
 * Seed customer contact / support messages (TASK-177) across the NEW / READ /
 * ARCHIVED statuses so the admin inbox + unread badge have real data.
 * Idempotent — upsert on a deterministic id.
 */
async function seedContactMessages(prisma: PrismaClient) {
  const messages: {
    key: string;
    name: string;
    phone: string;
    email: string;
    topic: string;
    orderRef?: string;
    message: string;
    status: 'NEW' | 'READ' | 'ARCHIVED';
    adminNote?: string;
  }[] = [
    {
      key: 'msg-1',
      name: 'Оксана Шевченко',
      phone: '+380671112233',
      email: 'oksana@example.com',
      topic: 'Доставка',
      message: 'Доброго дня! Коли буде відправлено моє замовлення? Дуже чекаю.',
      status: 'NEW',
    },
    {
      key: 'msg-2',
      name: 'Тарас Бондаренко',
      phone: '+380672223344',
      email: 'taras@example.com',
      topic: 'Гарантія',
      orderRef: 'taras-1',
      message: 'Чи діє гарантія на зарядний пристрій, який я замовляв минулого тижня?',
      status: 'NEW',
    },
    {
      key: 'msg-3',
      name: 'Марія Коваль',
      phone: '+380673334455',
      email: 'mariia@example.com',
      topic: 'Повернення',
      message: 'Хочу повернути товар. Підкажіть, будь ласка, як це зробити?',
      status: 'READ',
      adminNote: 'Надіслано інструкцію з повернення.',
    },
    {
      key: 'msg-4',
      name: 'Дмитро Ткаченко',
      phone: '+380674445566',
      email: 'dmytro@example.com',
      topic: 'Наявність товару',
      message: 'Коли знову буде в наявності кабель USB-C 2м? Дякую.',
      status: 'READ',
    },
    {
      key: 'msg-5',
      name: 'Наталія Кравченко',
      phone: '+380675556677',
      email: 'nataliia@example.com',
      topic: 'Співпраця',
      message: 'Вітаю! Цікавить оптова закупівля аксесуарів. З ким можна поспілкуватися?',
      status: 'ARCHIVED',
      adminNote: 'Передано менеджеру з оптових продажів.',
    },
  ];

  for (const m of messages) {
    const id = deterministicUuid(`contact-${m.key}`);
    await prisma.contactMessage.upsert({
      where: { id },
      update: {
        name: m.name,
        phone: m.phone,
        email: m.email,
        topic: m.topic,
        orderRef: m.orderRef ?? null,
        message: m.message,
        status: m.status,
        adminNote: m.adminNote ?? null,
      },
      create: {
        id,
        name: m.name,
        phone: m.phone,
        email: m.email,
        topic: m.topic,
        orderRef: m.orderRef ?? null,
        message: m.message,
        status: m.status,
        adminNote: m.adminNote ?? null,
      },
    });
  }

  console.log(`  ✓ Contact messages: ${messages.length} upserted`);
}

/**
 * Seed newsletter subscribers (TASK-188) — a mix of SUBSCRIBED and UNSUBSCRIBED
 * so the admin list and the resubscribe flow have data. Idempotent — upsert on
 * the unique (normalized) email.
 */
async function seedNewsletter(prisma: PrismaClient) {
  const day = 24 * 60 * 60 * 1000;
  const subscribers: {
    email: string;
    status: 'SUBSCRIBED' | 'UNSUBSCRIBED';
    source: string;
    unsubscribedDaysAgo?: number;
  }[] = [
    { email: 'oksana@example.com', status: 'SUBSCRIBED', source: 'home' },
    { email: 'taras@example.com', status: 'SUBSCRIBED', source: 'promo' },
    { email: 'mariia@example.com', status: 'SUBSCRIBED', source: 'blog' },
    { email: 'andrii.subscriber@example.com', status: 'SUBSCRIBED', source: 'home' },
    {
      email: 'olena.subscriber@example.com',
      status: 'UNSUBSCRIBED',
      source: 'promo',
      unsubscribedDaysAgo: 3,
    },
    {
      email: 'ihor.subscriber@example.com',
      status: 'UNSUBSCRIBED',
      source: 'home',
      unsubscribedDaysAgo: 15,
    },
  ];

  for (const s of subscribers) {
    const email = s.email.trim().toLowerCase();
    const unsubscribedAt =
      s.status === 'UNSUBSCRIBED' && s.unsubscribedDaysAgo
        ? new Date(Date.now() - s.unsubscribedDaysAgo * day)
        : null;
    await prisma.newsletterSubscription.upsert({
      where: { email },
      update: { status: s.status, source: s.source, unsubscribedAt },
      create: { email, status: s.status, source: s.source, unsubscribedAt },
    });
  }

  console.log(`  ✓ Newsletter: ${subscribers.length} subscribers upserted`);
}

/**
 * Seed the admin-managed static / service pages (TASK-187) in UA. Content is
 * Tiptap-style HTML sanitized through {@link sanitizeRichText} on write, exactly
 * like the admin editor. All pages are PUBLISHED with a real `publishedAt` and
 * the derived `isActive` mirror set true. Idempotent — upsert on the unique slug.
 */
async function seedPages(prisma: PrismaClient) {
  const publishedAt = new Date('2026-06-01T09:00:00.000Z');

  const pagesData: {
    slug: string;
    title: string;
    excerpt: string;
    metaTitle: string;
    metaDescription: string;
    content: string;
  }[] = [
    {
      slug: 'about',
      title: 'Про нас',
      excerpt: 'Мультибрендовий магазин аксесуарів та Apple-техніки в Україні.',
      metaTitle: 'Про нас | MobileStore',
      metaDescription:
        'MobileStore — мультибрендовий інтернет-магазин аксесуарів для смартфонів та Apple-техніки. Оригінальні товари, гарантія, доставка по Україні.',
      content: `
        <h2>Хто ми</h2>
        <p>MobileStore — це український інтернет-магазин аксесуарів для смартфонів
        та техніки Apple. Ми пропонуємо лише оригінальні товари від перевірених
        постачальників.</p>
        <h2>Чому обирають нас</h2>
        <ul>
          <li>Тільки оригінальна продукція з офіційною гарантією</li>
          <li>Швидка доставка Новою Поштою по всій Україні</li>
          <li>Зручна оплата: карткою онлайн або при отриманні</li>
          <li>Підтримка клієнтів сім днів на тиждень</li>
        </ul>
        <p>Ми працюємо, щоб ви отримували якісні товари та найкращий сервіс.</p>
      `,
    },
    {
      slug: 'delivery',
      title: 'Доставка і оплата',
      excerpt: 'Умови доставки Новою Поштою та способи оплати замовлень.',
      metaTitle: 'Доставка і оплата | MobileStore',
      metaDescription:
        'Доставка Новою Поштою по всій Україні, безкоштовно від 1000 ₴. Оплата карткою онлайн або при отриманні.',
      content: `
        <h2>Доставка</h2>
        <p>Ми відправляємо замовлення Новою Поштою по всій Україні. Товари в
        наявності відправляємо день у день за умови оформлення до 18:00.</p>
        <ul>
          <li>Доставка у відділення — за тарифами перевізника</li>
          <li>Безкоштовна доставка при замовленні від 1000 ₴</li>
          <li>Самовивіз із магазину — безкоштовно</li>
        </ul>
        <h2>Оплата</h2>
        <p>Ви можете обрати зручний спосіб оплати:</p>
        <ul>
          <li>Оплата карткою онлайн (Visa / Mastercard)</li>
          <li>Накладений платіж при отриманні</li>
        </ul>
      `,
    },
    {
      slug: 'returns',
      title: 'Повернення та обмін',
      excerpt: 'Як повернути або обміняти товар протягом 14 днів.',
      metaTitle: 'Повернення та обмін | MobileStore',
      metaDescription:
        'Повернення товару належної якості протягом 14 днів. Кошти повертаємо впродовж 3–7 банківських днів.',
      content: `
        <h2>Умови повернення</h2>
        <p>Ви можете повернути товар належної якості протягом 14 днів з моменту
        отримання за умови збереження товарного вигляду та повної комплектації.</p>
        <h2>Як оформити повернення</h2>
        <ul>
          <li>Зверніться до нашої служби підтримки</li>
          <li>Заповніть заяву на повернення</li>
          <li>Надішліть товар Новою Поштою</li>
        </ul>
        <p>Кошти повертаємо протягом 3–7 банківських днів після отримання товару.</p>
      `,
    },
    {
      slug: 'warranty',
      title: 'Гарантія',
      excerpt: 'Гарантійні зобов’язання на техніку та аксесуари.',
      metaTitle: 'Гарантія | MobileStore',
      metaDescription:
        'Офіційна гарантія виробника від 12 до 24 місяців. Гарантійний талон додається до кожного замовлення.',
      content: `
        <h2>Гарантійні умови</h2>
        <p>Уся техніка має офіційну гарантію виробника від 12 до 24 місяців.
        Гарантійний талон додається до замовлення.</p>
        <h2>Що покриває гарантія</h2>
        <ul>
          <li>Заводські дефекти та несправності</li>
          <li>Безкоштовний ремонт або заміну в гарантійний період</li>
        </ul>
        <p>Гарантія не поширюється на механічні пошкодження, спричинені
        неправильною експлуатацією.</p>
      `,
    },
    {
      slug: 'privacy-policy',
      title: 'Політика конфіденційності',
      excerpt: 'Як ми збираємо, використовуємо та захищаємо ваші дані.',
      metaTitle: 'Політика конфіденційності | MobileStore',
      metaDescription:
        'Політика конфіденційності MobileStore: які персональні дані ми збираємо, як їх використовуємо та захищаємо.',
      content: `
        <h2>Збір персональних даних</h2>
        <p>Ми збираємо лише ті дані, які необхідні для оформлення та доставки
        вашого замовлення: імʼя, телефон, адресу доставки та email.</p>
        <h2>Використання даних</h2>
        <p>Ваші дані використовуються виключно для обробки замовлень та звʼязку з
        вами. Ми не передаємо їх третім особам, окрім служб доставки.</p>
        <h2>Захист даних</h2>
        <p>Ми застосовуємо сучасні технічні засоби для захисту ваших персональних
        даних від несанкціонованого доступу.</p>
      `,
    },
    {
      slug: 'terms',
      title: 'Умови використання',
      excerpt: 'Правила користування сайтом та оформлення замовлень.',
      metaTitle: 'Умови використання | MobileStore',
      metaDescription:
        'Умови використання сайту MobileStore: правила оформлення замовлень, права та обовʼязки сторін.',
      content: `
        <h2>Загальні положення</h2>
        <p>Користуючись сайтом MobileStore, ви погоджуєтесь із цими умовами. Будь
        ласка, уважно ознайомтеся з ними перед оформленням замовлення.</p>
        <h2>Оформлення замовлень</h2>
        <p>Оформлюючи замовлення, ви підтверджуєте достовірність наданих даних.
        Ми залишаємо за собою право скасувати замовлення у разі помилок у ціні
        або наявності товару.</p>
        <h2>Права та обовʼязки</h2>
        <p>Ми зобовʼязуємось надати товар належної якості, а ви — своєчасно
        оплатити та отримати замовлення.</p>
      `,
    },
  ];

  for (let i = 0; i < pagesData.length; i++) {
    const page = pagesData[i];
    const content = sanitizeRichText(page.content);
    const data = {
      title: page.title,
      content,
      excerpt: page.excerpt,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      status: 'PUBLISHED' as const,
      publishedAt,
      scheduledAt: null,
      isActive: true,
      sortOrder: i,
    };
    await prisma.page.upsert({
      where: { slug: page.slug },
      update: data,
      create: { slug: page.slug, ...data },
    });
  }

  console.log(`  ✓ Pages: ${pagesData.length} published pages upserted`);
}

async function main() {
  console.log('\n🌱 Seeding database...\n');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Seed in dependency (FK-safe) order.
    const { admins, customers } = await seedUsers(prisma);
    await seedSiteContactSettings(prisma);
    await seedSeoSettings(prisma);
    await seedFaqItems(prisma);
    await seedBanners(prisma);
    const brands = await seedBrands(prisma);
    const categories = await seedCategories(prisma);
    await seedProducts(prisma, categories, brands);
    await seedDevices(prisma); // must precede seedDeviceCompat (creates DeviceModels)
    await seedAttributeDefinitions(prisma, categories);
    await seedDeviceCompat(prisma);
    await seedDiscounts(prisma);
    await seedOrders(prisma, admins, customers);
    await seedContactMessages(prisma);
    await seedNewsletter(prisma);
    await seedReviews(prisma);
    await seedAddresses(prisma, customers);
    await seedPages(prisma);
    await seedBlog(prisma);

    console.log('\n✅ Seed completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
