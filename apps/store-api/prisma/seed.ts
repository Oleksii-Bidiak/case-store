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

async function seedUsers(prisma: PrismaClient) {
  // Admin credentials are configurable via env (ADMIN_SEED_EMAIL /
  // ADMIN_SEED_PASSWORD) and fall back to the dev defaults below. The upsert is
  // idempotent and re-asserts the ADMIN role on every run. To promote an
  // already-registered user instead of seeding a new one, run:
  //   UPDATE users SET role='ADMIN' WHERE email='<email>';
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@store.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'Admin123!';
  const adminPasswordHash = await argon2.hash(adminPassword);
  const customerPasswordHash = await argon2.hash('Customer123!');

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN', isActive: true },
    create: {
      email: adminEmail,
      passwordHash: adminPasswordHash,
      firstName: 'Admin',
      lastName: 'Store',
      role: 'ADMIN',
      isActive: true,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'customer@store.com' },
    update: {},
    create: {
      email: 'customer@store.com',
      passwordHash: customerPasswordHash,
      firstName: 'John',
      lastName: 'Doe',
      phone: '+380991234567',
      role: 'CUSTOMER',
      isActive: true,
    },
  });

  console.log(`  ✓ Users: admin=${admin.id}, customer=${customer.id}`);
  return { admin, customer };
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

  const allSubcategories = [
    ...casesSubcategories,
    ...chargersSubcategories,
    ...cablesSubcategories,
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

async function seedProducts(prisma: PrismaClient, categories: Record<string, { id: string }>) {
  const productsData = [
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

    // Create one position per variant. Group members carry the variant name and
    // attributes; a standalone position takes the entry name and empty attributes.
    for (let i = 0; i < p.variants.length; i++) {
      const v = p.variants[i];
      const positionSlug = isGroup ? `${p.slug}-${slugify(v.name)}` : p.slug;
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

  console.log(`  ✓ Reviews: ${reviewCount} approved reviews across ${products.length} products`);
}

async function seedAddresses(prisma: PrismaClient, customer: { id: string }) {
  const address = await prisma.address.upsert({
    where: { id: 'seed-address-1' },
    update: {},
    create: {
      id: 'seed-address-1',
      userId: customer.id,
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

  console.log(`  ✓ Addresses: default shipping address for customer`);
  return address;
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Seeding database...\n');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Seed in dependency order
    const { customer } = await seedUsers(prisma);
    await seedSiteContactSettings(prisma);
    const categories = await seedCategories(prisma);
    await seedProducts(prisma, categories);
    await seedReviews(prisma);
    await seedAddresses(prisma, customer);
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
