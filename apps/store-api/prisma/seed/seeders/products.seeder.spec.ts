import type { PrismaClient } from '@prisma/client';
import type { SeedImageRef, SeedImageRequest } from '../lib/images/seed-image.generator';
import type { ProductSeed } from '../types';
import { seedProducts } from './products.seeder';

const HOSTILE = '<p onclick="steal()">Надійний <strong>чохол</strong></p><script>alert(1)</script>';

/** Swapped per describe block; read lazily by the catalogue mock below. */
let mockCatalogue: ProductSeed[] = [];

jest.mock('../data/catalogue', () => ({
  buildProductsData: (): ProductSeed[] => mockCatalogue,
}));

// The real generator renders WebP files to disk. The fake returns one URL per
// sort order, so — exactly like the real per-run memo — every position of a
// group gets the SAME URLs for its gallery.
jest.mock('../lib/images/seed-image.generator', () => ({
  renderSeedImages: (reqs: SeedImageRequest[]): Promise<SeedImageRef[]> =>
    Promise.resolve(
      reqs.map((req) => ({
        url: `http://localhost:3001/uploads/products/seed-${req.sortOrder}.webp`,
        alt: req.alt,
        blurDataUrl: `data:image/webp;base64,LQIP${req.sortOrder}`,
        sortOrder: req.sortOrder,
        isPrimary: req.sortOrder === 0,
        width: 800,
        height: 800,
        bytes: 1000 + req.sortOrder,
      })),
    ),
}));

/**
 * The product seeder's description write (TASK-572).
 *
 * The PDP renders `description` as markup, and the admin write path sanitizes
 * it (`ProductService.sanitizeDescription`, TASK-361). The seed is the other
 * writer, and it has to hold the same line: today's data carries no markup, but
 * the day an entry gains a table (TASK-434) it must arrive already cleaned, like
 * the pages and blog seeders do.
 */
type UpsertArgs = {
  where: { slug: string };
  create: { description: string };
  update: { description: string };
};

describe('seedProducts — description (TASK-572)', () => {
  let upserts: UpsertArgs[];

  beforeAll(async () => {
    mockCatalogue = [
      {
        name: 'Тестовий чохол',
        slug: 'test-case',
        description: HOSTILE,
        price: 100,
        sku: 'TST-1',
        categorySlug: 'iphone-cases',
        categoryId: 'cat-1',
        variants: [{ name: 'Тестовий чохол', price: 100, stock: 1, attributes: {} }],
        images: [],
      },
    ];
    upserts = [];
    const prisma = {
      product: {
        upsert: (args: UpsertArgs) => {
          upserts.push(args);
          return Promise.resolve({ id: 'prod-1' });
        },
        update: () => Promise.resolve({}),
      },
      productImage: {
        deleteMany: () => Promise.resolve({ count: 0 }),
        create: () => Promise.resolve({}),
      },
    } as unknown as PrismaClient;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await seedProducts(prisma, { 'iphone-cases': { id: 'cat-1' } }, {});
  });

  afterAll(() => jest.restoreAllMocks());

  it('writes the description through sanitizeRichText on create AND update', () => {
    expect(upserts).toHaveLength(1);
    for (const description of [upserts[0].create.description, upserts[0].update.description]) {
      expect(description).not.toContain('<script');
      expect(description).not.toContain('onclick');
      // The allowed markup survives — sanitizing is not stripping.
      expect(description).toContain('<strong>чохол</strong>');
    }
  });
});

/**
 * Catalogue photos are media-library assets (TASK-1029).
 *
 * Before this, the seed wrote `product_images` with no `MediaAsset` behind them,
 * so every NEW environment came up with a full catalogue and an empty library —
 * the migration's backfill only covers photos that already existed. The fake
 * keeps the asset table in memory and honours `upsert`'s where-by-url, so a
 * second run is checked by its RESULT (no new rows), not by call shapes alone.
 */
type AssetRow = { id: string; url: string; [key: string]: unknown };
type AssetUpsertArgs = {
  where: { url: string };
  create: { url: string; [key: string]: unknown };
  update: Record<string, unknown>;
};
type ImageCreateArgs = { data: { url: string; mediaAssetId?: string | null } };

function fakePrisma() {
  const assets = new Map<string, AssetRow>();
  const assetUpserts: AssetUpsertArgs[] = [];
  const assetCreates: AssetRow[] = [];
  const imageCreates: ImageCreateArgs['data'][] = [];

  const prisma = {
    product: {
      upsert: ({ where }: { where: { slug: string } }) =>
        Promise.resolve({ id: `prod-${where.slug}` }),
      update: () => Promise.resolve({}),
    },
    productGroup: { upsert: () => Promise.resolve({}) },
    productGroupAxis: {
      deleteMany: () => Promise.resolve({ count: 0 }),
      createMany: () => Promise.resolve({ count: 0 }),
    },
    productImage: {
      deleteMany: () => Promise.resolve({ count: 0 }),
      create: ({ data }: ImageCreateArgs) => {
        imageCreates.push(data);
        return Promise.resolve({});
      },
    },
    mediaAsset: {
      upsert: (args: AssetUpsertArgs) => {
        assetUpserts.push(args);
        const existing = assets.get(args.where.url);
        if (existing) {
          const updated = { ...existing, ...args.update };
          assets.set(args.where.url, updated);
          return Promise.resolve(updated);
        }
        const row = { id: `asset-${assets.size + 1}`, ...args.create };
        assets.set(args.where.url, row);
        assetCreates.push(row);
        return Promise.resolve(row);
      },
    },
  } as unknown as PrismaClient;

  return { prisma, assets, assetUpserts, assetCreates, imageCreates };
}

const URL_0 = 'http://localhost:3001/uploads/products/seed-0.webp';
const URL_1 = 'http://localhost:3001/uploads/products/seed-1.webp';

describe('seedProducts — media library assets (TASK-1029)', () => {
  beforeAll(() => {
    // One group of two positions with a two-image gallery: four product_images
    // rows over two distinct URLs, the same shape as the real catalogue.
    mockCatalogue = [
      {
        name: 'Тестовий чохол',
        slug: 'test-case',
        description: 'Опис',
        price: 100,
        sku: 'TST-1',
        categorySlug: 'iphone-cases',
        categoryId: 'cat-1',
        variants: [
          {
            name: 'Чорний',
            slugPart: 'black',
            sku: 'TST-1-BK',
            price: 100,
            stock: 1,
            attributes: { Колір: 'Чорний' },
          },
          {
            name: 'Білий',
            slugPart: 'white',
            sku: 'TST-1-WH',
            price: 100,
            stock: 1,
            attributes: { Колір: 'Білий' },
          },
        ],
        images: [
          { alt: 'Тестовий чохол — спереду', sortOrder: 0 },
          { alt: 'Тестовий чохол — ззаду', sortOrder: 1 },
        ],
      },
    ];
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

  it('upserts one asset per distinct URL, by url, with the real render numbers', async () => {
    const fake = fakePrisma();
    await seedProducts(fake.prisma, { 'iphone-cases': { id: 'cat-1' } }, {});

    expect(fake.assetUpserts.map((u) => u.where.url).sort()).toEqual([URL_0, URL_1]);
    const first = fake.assetUpserts.find((u) => u.where.url === URL_0);
    expect(first?.create).toEqual({
      url: URL_0,
      blurDataUrl: 'data:image/webp;base64,LQIP0',
      width: 800,
      height: 800,
      bytes: 1000,
      mime: 'image/webp',
      alt: 'Тестовий чохол — спереду',
      tags: [],
      uploadedById: null,
      originalFilename: null,
    });
    // A re-seed must not overwrite what an operator has since edited (alt, tags).
    expect(first?.update).toEqual({});
  });

  it('links every product image to the asset of its URL', async () => {
    const fake = fakePrisma();
    await seedProducts(fake.prisma, { 'iphone-cases': { id: 'cat-1' } }, {});

    expect(fake.imageCreates).toHaveLength(4);
    for (const image of fake.imageCreates) {
      expect(image.mediaAssetId).toEqual(expect.any(String));
      expect(image.mediaAssetId).toBe(fake.assets.get(image.url)?.id);
    }
  });

  it('creates no extra assets on a second run', async () => {
    const fake = fakePrisma();
    await seedProducts(fake.prisma, { 'iphone-cases': { id: 'cat-1' } }, {});
    await seedProducts(fake.prisma, { 'iphone-cases': { id: 'cat-1' } }, {});

    expect(fake.assetCreates).toHaveLength(2);
    expect(fake.assets.size).toBe(2);
  });
});
