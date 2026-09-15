import { INestApplication, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CatalogLandingRepository } from '../src/catalog-landing/catalog-landing.repository';
import { CatalogLandingService } from '../src/catalog-landing/catalog-landing.service';
import { CategoryRepository } from '../src/category/category.repository';
import { DeviceRepository } from '../src/device/device.repository';
import { PrismaService } from '../src/prisma';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * The compatibility landing pages against a REAL Postgres — TASK-490, plan 182
 * F3 / owner decision B-10 §5.
 *
 * ── Why this file has to exist ──────────────────────────────────────────────
 * The acceptance criterion is a single sentence — «кількість сторінок = активні
 * пари з ≥1 товаром» — and every way of getting it wrong compiles, type-checks
 * and passes a mocked test:
 *
 *   • counting a product whose category was DEACTIVATED (the TASK-297 leak,
 *     which is exactly the class of bug the shared `buildProductListWhere`
 *     exists to prevent);
 *   • counting a soft-deleted or inactive product;
 *   • offering a page for a device model the storefront's own filter hides;
 *   • counting only a product's OWN category, so that a PARENT category's page
 *     404s while opening it would have listed products (the catalogue filter
 *     rolls subtrees up — TASK-236);
 *   • letting the LIST and the single-page EXISTENCE CHECK disagree, which
 *     publishes a sitemap entry that 404s or hides a page that answers 200.
 *
 * Only real rows joined through a real subtree walk show any of that, so the
 * fixture below is built to trip each one.
 *
 * Fixture — one throwaway category tree and three device models:
 *
 *   parent  (active)
 *    ├── child  (active)
 *    └── dead   (INACTIVE)
 *
 *   gparent (active) → middle (INACTIVE) → leaf (active)
 *
 *   phone / tablet  (active models)      hidden (INACTIVE model)
 *   lonely (active model, no compat rows at all)
 *
 *   p-live-phone         child  active            → phone
 *   p-live-both          child  active            → phone, tablet
 *   p-inactive           child  isActive: false    → phone
 *   p-deleted            child  deletedAt set      → phone
 *   p-dead-category      dead   active            → phone
 *   p-hidden-model       child  active            → hidden
 *   p-deep               leaf   active            → phone
 *
 * So exactly six pages must exist: (parent|child) × (phone|tablet) — phone at 2
 * products, tablet at 1 — plus (gparent|leaf) × phone. NOT `middle`: it is
 * withdrawn from sale, yet the walk must CONTINUE through it, because
 * `gparent`'s own listing does roll `leaf`'s products up.
 *
 * Requires the isolated `*_test` DB (forced by setup-int.ts). Run with
 * `npm run test:int -w apps/store-api`.
 */

const MIGRATION_SQL = join(
  __dirname,
  '..',
  'prisma',
  'migrations',
  '20260916120000_device_model_seo_fields',
  'migration.sql',
);

/**
 * Split the migration file into executable statements — same treatment
 * `color-facet-backfill.int-spec.ts` gives its own: Prisma's
 * `$executeRawUnsafe` goes through a prepared statement and refuses more than
 * one command at a time, so the `--` comments are stripped and the rest is split
 * on the terminator. No statement here contains a `;` inside a string literal,
 * which is what makes that safe.
 */
function migrationStatements(): string[] {
  return readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

describe('Compatibility landing pages (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: CatalogLandingService;

  const s = randomUUID().slice(0, 8);
  const slug = (name: string) => `compat-${name}-${s}`;

  let parentId: string;
  let childId: string;
  let deadId: string;
  let gparentId: string;
  let middleId: string;
  let leafId: string;
  let deviceBrandId: string;
  let phoneId: string;
  let tabletId: string;
  let hiddenId: string;
  let lonelyId: string;
  const productIds: string[] = [];

  /** Our fixture's pages only — the test DB may carry unrelated rows. */
  async function fixturePages(): Promise<
    Array<{ category: string; device: string; count: number }>
  > {
    const pages = await service.getCompatPages();
    return pages
      .filter((page) => page.categorySlug.endsWith(s) && page.deviceSlug.endsWith(s))
      .map((page) => ({
        category: page.categorySlug,
        device: page.deviceSlug,
        count: page.productCount,
      }));
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        PrismaService,
        SlugRedirectRepository,
        CategoryRepository,
        DeviceRepository,
        CatalogLandingRepository,
        CatalogLandingService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(CatalogLandingService);

    const parent = await prisma.category.create({
      data: { name: 'compat parent', slug: slug('parent') },
    });
    parentId = parent.id;
    const child = await prisma.category.create({
      data: { name: 'compat child', slug: slug('child'), parentId },
    });
    childId = child.id;
    // Withdrawn from sale: its products must vanish from every count, but its
    // ANCESTOR's pages must still exist on the strength of its siblings.
    const dead = await prisma.category.create({
      data: { name: 'compat dead', slug: slug('dead'), parentId, isActive: false },
    });
    deadId = dead.id;

    // A second, deeper tree whose MIDDLE link is deactivated — the case that
    // separates "skip this ancestor" from "stop walking".
    const gparent = await prisma.category.create({
      data: { name: 'compat gparent', slug: slug('gparent') },
    });
    gparentId = gparent.id;
    const middle = await prisma.category.create({
      data: {
        name: 'compat middle',
        slug: slug('middle'),
        parentId: gparentId,
        isActive: false,
      },
    });
    middleId = middle.id;
    const leaf = await prisma.category.create({
      data: { name: 'compat leaf', slug: slug('leaf'), parentId: middleId },
    });
    leafId = leaf.id;

    const brand = await prisma.deviceBrand.create({
      data: { name: 'compat brand', slug: slug('brand') },
    });
    deviceBrandId = brand.id;

    const model = async (name: string, isActive = true) =>
      prisma.deviceModel.create({
        data: { deviceBrandId, name: `compat ${name}`, slug: slug(name), isActive },
      });
    phoneId = (await model('phone')).id;
    tabletId = (await model('tablet')).id;
    hiddenId = (await model('hidden', false)).id;
    lonelyId = (await model('lonely')).id;

    const product = async (
      name: string,
      categoryId: string,
      compat: string[],
      extra: { isActive?: boolean; deletedAt?: Date } = {},
    ) => {
      const row = await prisma.product.create({
        data: {
          name,
          slug: slug(name),
          price: '19.99',
          stock: 5,
          categoryId,
          isActive: extra.isActive ?? true,
          deletedAt: extra.deletedAt ?? null,
          deviceCompat: { create: compat.map((deviceModelId) => ({ deviceModelId })) },
        },
      });
      productIds.push(row.id);
      return row;
    };

    await product('live-phone', childId, [phoneId]);
    await product('live-both', childId, [phoneId, tabletId]);
    await product('inactive', childId, [phoneId], { isActive: false });
    await product('deleted', childId, [phoneId], { deletedAt: new Date() });
    await product('dead-category', deadId, [phoneId]);
    await product('hidden-model', childId, [hiddenId]);
    await product('deep', leafId, [phoneId]);
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    // Compat rows cascade from the product, but they are deleted first anyway so
    // a partial failure above still leaves the test DB clean.
    await prisma.productDeviceCompat.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.deviceModel.deleteMany({
      where: { id: { in: [phoneId, tabletId, hiddenId, lonelyId] } },
    });
    await prisma.deviceBrand.deleteMany({ where: { id: deviceBrandId } });
    // Leaves before parents — `Category.parent` is a plain FK, not a cascade.
    await prisma.category.deleteMany({ where: { id: leafId } });
    await prisma.category.deleteMany({ where: { id: middleId } });
    await prisma.category.deleteMany({ where: { id: { in: [childId, deadId] } } });
    await prisma.category.deleteMany({ where: { id: { in: [parentId, gparentId] } } });
    await app.close();
  });

  describe('which pages exist («кількість сторінок = активні пари з ≥1 товаром»)', () => {
    it('lists exactly the pairs with at least one visible product', async () => {
      // Sorted by (categorySlug, deviceSlug) — every slug here shares the
      // `compat-` prefix and the same suffix, so the order is alphabetical on
      // the middle word: child < gparent < leaf < parent.
      expect(await fixturePages()).toEqual([
        { category: slug('child'), device: slug('phone'), count: 2 },
        { category: slug('child'), device: slug('tablet'), count: 1 },
        { category: slug('gparent'), device: slug('phone'), count: 1 },
        { category: slug('leaf'), device: slug('phone'), count: 1 },
        { category: slug('parent'), device: slug('phone'), count: 2 },
        { category: slug('parent'), device: slug('tablet'), count: 1 },
      ]);
    });

    it('skips a DEACTIVATED middle ancestor but keeps walking past it', async () => {
      const pages = await fixturePages();

      // `middle` is withdrawn from sale — no page of its own…
      expect(pages.map((page) => page.category)).not.toContain(slug('middle'));
      // …but `gparent` still gets one, because ITS listing rolls the whole
      // subtree up and does show `leaf`'s product. Stopping the walk at the
      // first inactive link would have lost that page.
      expect(pages).toContainEqual({
        category: slug('gparent'),
        device: slug('phone'),
        count: 1,
      });
    });

    it('rolls a leaf product up to its ancestors, because the listing does', async () => {
      // No product is filed DIRECTLY in `parent`. Counting own-category only
      // would leave `parent × phone` out of the sitemap while the page itself
      // lists two products — a 404 on a URL that works.
      const parentPhone = (await fixturePages()).find(
        (page) => page.category === slug('parent') && page.device === slug('phone'),
      );
      expect(parentPhone).toEqual({
        category: slug('parent'),
        device: slug('phone'),
        count: 2,
      });
    });

    it('never publishes a page for a DEACTIVATED category', async () => {
      const pages = await fixturePages();
      expect(pages.map((page) => page.category)).not.toContain(slug('dead'));
    });

    it('never publishes a page for a DEACTIVATED device model', async () => {
      const pages = await fixturePages();
      expect(pages.map((page) => page.device)).not.toContain(slug('hidden'));
    });

    it('never publishes a page for a model nothing is compatible with', async () => {
      const pages = await fixturePages();
      expect(pages.map((page) => page.device)).not.toContain(slug('lonely'));
    });

    it('counts neither a deactivated nor a soft-deleted product', async () => {
      // Four products carry the `phone` compat row in `child`; two are visible.
      // A count of 3 or 4 here is the sitemap promising stock the storefront
      // refuses to show.
      const childPhone = (await fixturePages()).find(
        (page) => page.category === slug('child') && page.device === slug('phone'),
      );
      expect(childPhone?.count).toBe(2);
    });
  });

  describe('one page (the existence check the route 404s on)', () => {
    it('resolves a real pair, with the same count the list reports', async () => {
      const page = await service.getCompatPage(slug('child'), slug('phone'));

      expect(page.categorySlug).toBe(slug('child'));
      expect(page.deviceModel.slug).toBe(slug('phone'));
      expect(page.productCount).toBe(2);
    });

    it('agrees with the list on EVERY page, count included', async () => {
      // The acceptance criterion in its strongest form: the two reads are
      // separate queries (an aggregate over the compat table vs. a subtree
      // COUNT), and the only thing keeping them honest is the shared
      // `buildProductListWhere`. If one ever grows a filter the other lacks,
      // this is where it shows up.
      const pages = await fixturePages();
      for (const page of pages) {
        const detail = await service.getCompatPage(page.category, page.device);
        expect(detail.productCount).toBe(page.count);
      }
    });

    it('404s a pair whose products are all invisible', async () => {
      // `dead × phone` has a product — the category is just withdrawn from sale.
      await expect(service.getCompatPage(slug('dead'), slug('phone'))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s a deactivated device model', async () => {
      await expect(service.getCompatPage(slug('child'), slug('hidden'))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s a real category and a real model that share no product', async () => {
      await expect(service.getCompatPage(slug('child'), slug('lonely'))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s an unknown slug on either side', async () => {
      await expect(service.getCompatPage('no-such-category', slug('phone'))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.getCompatPage(slug('child'), 'no-such-device')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('the shipped migration', () => {
    /**
     * `store_test` is schema-synced with `prisma db push`, so migrations never
     * run here and the three columns already exist. Re-implementing the DDL in
     * TypeScript would test a copy and leave the file that actually ships on the
     * client's stand unexercised — so instead the columns are DROPPED and the
     * shipped `.sql` is executed verbatim against a table that lacks them,
     * inside a transaction that is then rolled back. Postgres DDL is
     * transactional, and `test:int` runs `--runInBand`, so nothing else can
     * observe the intermediate state.
     */
    it('adds the three columns to a table that does not have them', async () => {
      const ROLLBACK = 'rollback-after-assert';
      let before: string[] = [];
      let after: string[] = [];

      const columns = async (tx: {
        $queryRawUnsafe: (sql: string) => Promise<Array<{ column_name: string }>>;
      }) => {
        const rows = await tx.$queryRawUnsafe(
          `SELECT column_name FROM information_schema.columns WHERE table_name = 'device_models'`,
        );
        return rows.map((row) => row.column_name);
      };

      await expect(
        prisma.$transaction(
          async (tx) => {
            await tx.$executeRawUnsafe(
              'ALTER TABLE "device_models" DROP COLUMN "meta_title", DROP COLUMN "meta_description", DROP COLUMN "description"',
            );
            before = await columns(tx);
            for (const statement of migrationStatements()) {
              await tx.$executeRawUnsafe(statement);
            }
            after = await columns(tx);
            // Never commit: the test DB keeps the pushed schema it came with.
            throw new Error(ROLLBACK);
          },
          { timeout: 20000 },
        ),
      ).rejects.toThrow(ROLLBACK);

      // The pre-condition, asserted rather than assumed — if the DROP silently
      // did nothing, the migration below would prove nothing either.
      expect(before).not.toContain('meta_title');
      expect(before).not.toContain('meta_description');
      expect(before).not.toContain('description');

      expect(after).toContain('meta_title');
      expect(after).toContain('meta_description');
      expect(after).toContain('description');
    });
  });
});
