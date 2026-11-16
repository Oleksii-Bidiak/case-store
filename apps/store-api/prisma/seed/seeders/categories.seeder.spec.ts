import type { PrismaClient } from '@prisma/client';
import type { SeedImageRef, SeedImageRequest } from '../lib/images/seed-image.generator';
import { seedCategories } from './categories.seeder';

/**
 * Category tiles are media-library assets (TASK-1029).
 *
 * Same defect class as the catalogue photos: the seed wrote `categories.image`
 * (and the demo `ogImage`, the same file) without a `MediaAsset` behind it, so a
 * fresh environment's library never showed the tiles. The fake keeps the asset
 * table in memory and honours `upsert`'s where-by-url, so the re-seed case is
 * checked by its result.
 */

// A function DECLARATION, so it is hoisted above the hoisted `jest.mock` below.
function mockCategory(slug: string, demoOgImage: boolean, parentId?: string) {
  return {
    name: `Категорія ${slug}`,
    slug,
    description: 'Опис',
    metaTitle: null,
    metaDescription: null,
    keywords: [],
    demoOgImage,
    icon: null,
    sortOrder: 0,
    ...(parentId ? { parentId } : {}),
  };
}

jest.mock('../data/categories.data', () => ({
  categoriesData: [mockCategory('cases', true)],
  buildSubcategories: (roots: Record<string, { id: string }>) => [
    mockCategory('cases-iphone', false, roots.cases.id),
    mockCategory('cases-broken', false, roots.cases.id),
  ],
}));

// One tile fails to render, as `renderCategoryTileRef` reports it: null.
jest.mock('../lib/images/seed-image.generator', () => ({
  renderCategoryTileRef: (req: SeedImageRequest): Promise<SeedImageRef | null> =>
    Promise.resolve(
      req.key === 'category-cases-broken'
        ? null
        : {
            url: `http://localhost:3001/uploads/products/seed-${req.key}.webp`,
            alt: req.alt,
            blurDataUrl: 'data:image/webp;base64,LQIP',
            sortOrder: 0,
            isPrimary: true,
            width: 512,
            height: 512,
            bytes: 2048,
          },
    ),
}));

type AssetRow = { id: string; url: string; [key: string]: unknown };
type AssetUpsertArgs = {
  where: { url: string };
  create: { url: string; [key: string]: unknown };
  update: Record<string, unknown>;
};

function fakePrisma() {
  const assets = new Map<string, AssetRow>();
  const assetUpserts: AssetUpsertArgs[] = [];
  const assetCreates: AssetRow[] = [];

  const prisma = {
    category: {
      upsert: ({ where }: { where: { slug: string } }) =>
        Promise.resolve({ id: `cat-${where.slug}` }),
    },
    mediaAsset: {
      upsert: (args: AssetUpsertArgs) => {
        assetUpserts.push(args);
        const existing = assets.get(args.where.url);
        if (existing) return Promise.resolve(existing);
        const row = { id: `asset-${assets.size + 1}`, ...args.create };
        assets.set(args.where.url, row);
        assetCreates.push(row);
        return Promise.resolve(row);
      },
    },
  } as unknown as PrismaClient;

  return { prisma, assets, assetUpserts, assetCreates };
}

const ROOT_URL = 'http://localhost:3001/uploads/products/seed-category-cases.webp';
const SUB_URL = 'http://localhost:3001/uploads/products/seed-category-cases-iphone.webp';

describe('seedCategories — media library assets (TASK-1029)', () => {
  beforeAll(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  it('upserts an asset per rendered tile, by url, with the real render numbers', async () => {
    const fake = fakePrisma();
    await seedCategories(fake.prisma);

    expect(fake.assetUpserts.map((u) => u.where.url).sort()).toEqual([ROOT_URL, SUB_URL].sort());
    const root = fake.assetUpserts.find((u) => u.where.url === ROOT_URL);
    expect(root?.create).toEqual({
      url: ROOT_URL,
      blurDataUrl: 'data:image/webp;base64,LQIP',
      width: 512,
      height: 512,
      bytes: 2048,
      mime: 'image/webp',
      alt: 'Категорія cases',
      tags: [],
      uploadedById: null,
      originalFilename: null,
    });
    expect(root?.update).toEqual({});
  });

  it('registers nothing for a tile that failed to render', async () => {
    const fake = fakePrisma();
    await seedCategories(fake.prisma);

    expect(fake.assetUpserts.some((u) => u.where.url.includes('cases-broken'))).toBe(false);
  });

  it('creates no extra assets on a second run', async () => {
    const fake = fakePrisma();
    await seedCategories(fake.prisma);
    await seedCategories(fake.prisma);

    expect(fake.assetCreates).toHaveLength(2);
    expect(fake.assets.size).toBe(2);
  });
});
