import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import argon2 from 'argon2';

// ─── Helpers ────────────────────────────────────────────────────────────────

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
      ],
    },
  ];

  let productCount = 0;
  let variantCount = 0;
  let imageCount = 0;

  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        sku: p.sku,
        categoryId: p.categoryId,
        isActive: true,
      },
    });

    productCount++;

    // Create variants
    for (const v of p.variants) {
      await prisma.productVariant.upsert({
        where: { sku: v.sku! },
        update: {},
        create: {
          productId: product.id,
          name: v.name,
          sku: v.sku,
          price: v.price,
          stock: v.stock,
          attributes: v.attributes,
          isActive: true,
        },
      });
      variantCount++;
    }

    // Create images (delete existing first for idempotency)
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    for (const img of p.images) {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: img.url,
          alt: img.alt,
          sortOrder: img.sortOrder,
        },
      });
      imageCount++;
    }
  }

  console.log(
    `  ✓ Products: ${productCount} products, ${variantCount} variants, ${imageCount} images`,
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Seeding database...\n');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Seed in dependency order
    const { customer } = await seedUsers(prisma);
    const categories = await seedCategories(prisma);
    await seedProducts(prisma, categories);
    await seedReviews(prisma);
    await seedAddresses(prisma, customer);

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
