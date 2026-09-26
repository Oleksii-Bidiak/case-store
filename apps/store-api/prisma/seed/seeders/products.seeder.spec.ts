import type { PrismaClient } from '@prisma/client';
import type { ProductSeed } from '../types';
import { seedProducts } from './products.seeder';

/**
 * The product seeder's description write (TASK-572).
 *
 * The PDP renders `description` as markup, and the admin write path sanitizes
 * it (`ProductService.sanitizeDescription`, TASK-361). The seed is the other
 * writer, and it has to hold the same line: today's data carries no markup, but
 * the day an entry gains a table (TASK-434) it must arrive already cleaned, like
 * the pages and blog seeders do.
 */

const HOSTILE = '<p onclick="steal()">Надійний <strong>чохол</strong></p><script>alert(1)</script>';

jest.mock('../data/catalogue', () => ({
  buildProductsData: (): ProductSeed[] => [
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
  ],
}));

// The real generator renders WebP files to disk; the description is all this
// test is about.
jest.mock('../lib/images/seed-image.generator', () => ({
  renderSeedImages: () => Promise.resolve([]),
}));

type UpsertArgs = {
  where: { slug: string };
  create: { description: string };
  update: { description: string };
};

describe('seedProducts — description (TASK-572)', () => {
  let upserts: UpsertArgs[];

  beforeAll(async () => {
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
