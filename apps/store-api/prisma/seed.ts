import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { seedAddonServices } from './seed/seeders/addon-services.seeder';
import { seedAddresses } from './seed/seeders/addresses.seeder';
import { seedAttributeDefinitions } from './seed/seeders/attributes.seeder';
import { seedBanners } from './seed/seeders/banners.seeder';
import { seedBlog } from './seed/seeders/blog.seeder';
import { seedBrands } from './seed/seeders/brands.seeder';
import { seedCarousels } from './seed/seeders/carousels.seeder';
import { seedCategories } from './seed/seeders/categories.seeder';
import { seedContactMessages } from './seed/seeders/contact-messages.seeder';
import { seedDeviceCompat } from './seed/seeders/device-compat.seeder';
import { seedDevices } from './seed/seeders/devices.seeder';
import { seedDiscounts } from './seed/seeders/discounts.seeder';
import { seedFaqItems } from './seed/seeders/faq.seeder';
import { seedNewsletter } from './seed/seeders/newsletter.seeder';
import { seedOrders } from './seed/seeders/orders.seeder';
import { seedPages } from './seed/seeders/pages.seeder';
import { seedProducts } from './seed/seeders/products.seeder';
import { seedReviews } from './seed/seeders/reviews.seeder';
import { seedSeoSettings, seedSiteContactSettings } from './seed/seeders/site-settings.seeder';
import { seedUsers } from './seed/seeders/users.seeder';
import { pruneSeedImages } from './seed/lib/images/seed-image.generator';

// ─── Guard ──────────────────────────────────────────────────────────────────

/**
 * Refuse to touch a production database unless the operator explicitly opts in.
 * The seed writes demo accounts (customers, reviewers) whose passwords are
 * published in `docs/seed-guide.md`, so an accidental production run is a
 * credential-disclosure incident, not just noise. `ALLOW_PROD_SEED=true` is the
 * deliberate escape hatch (bootstrapping a fresh staging/demo instance); under
 * it the admin credentials must be supplied explicitly, because the dev
 * fallbacks are public too.
 *
 * Runs BEFORE the connection pool is opened — a rejected seed writes nothing.
 */
function assertSeedAllowed(): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (process.env.ALLOW_PROD_SEED !== 'true') {
    throw new Error(
      'Refusing to run the seed with NODE_ENV=production: it creates demo accounts with ' +
        'publicly documented passwords. Set ALLOW_PROD_SEED=true to override — see ' +
        'docs/seed-guide.md §"Production guard".',
    );
  }

  if (!process.env.ADMIN_SEED_EMAIL || !process.env.ADMIN_SEED_PASSWORD) {
    throw new Error(
      'ALLOW_PROD_SEED=true requires explicit ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD: ' +
        'the fallback admin credentials are published in the env example file.',
    );
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  assertSeedAllowed();

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
    await seedCarousels(prisma); // must follow seedCategories + seedProducts (rows referenced)
    await seedDevices(prisma); // must precede seedDeviceCompat (creates DeviceModels)
    await seedAttributeDefinitions(prisma, categories);
    await seedAddonServices(prisma, categories); // must follow seedProducts (deltas need products)
    await seedDeviceCompat(prisma);
    await seedDiscounts(prisma);
    await seedOrders(prisma, admins, customers);
    await seedContactMessages(prisma);
    await seedNewsletter(prisma);
    await seedReviews(prisma);
    await seedAddresses(prisma, customers);
    await seedPages(prisma);
    await seedBlog(prisma);

    // Last, once every seeder that draws imagery has run: drop the generated
    // image files nothing points at any more (a renamed category, a dropped
    // product). Only this generator's own `seed-<hash>.webp` names are eligible,
    // so real uploads sharing the directory are untouchable.
    const prunedImages = await pruneSeedImages();
    if (prunedImages > 0) {
      console.log(`  ✓ Seed images: ${prunedImages} orphaned file(s) removed`);
    }

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
