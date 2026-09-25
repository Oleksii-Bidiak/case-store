import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';
import { ProductImageRepository } from '../src/product/product-image.repository';

/**
 * Integration tests for the gallery reorder write (TASK-783) — the REAL
 * repository against a REAL Postgres.
 *
 * Only a live DB proves what the fix rests on: every update is scoped to the
 * product in the URL (an id of another product's image matches no row instead of
 * rewriting that product's cover), a rejected batch rolls back as a whole, an
 * unknown id never surfaces as Prisma's P2025, and two concurrent reorders that
 * each promote a different image cannot leave the product with two covers.
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by
 * setup-int.ts. Run with `npm run test:int -w apps/store-api`.
 */
describe('ProductImageRepository.reorderForProduct (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: ProductImageRepository;

  let categoryId: string;
  let createdProducts: string[] = [];

  /** A product with three images: `a` is the cover, `b` and `c` are not. */
  const mkGallery = async (): Promise<{ productId: string; a: string; b: string; c: string }> => {
    const product = await prisma.product.create({
      data: {
        name: 'reorder-product',
        slug: `reorder-product-${randomUUID()}`,
        price: 10,
        stock: 1,
        categoryId,
      },
    });
    createdProducts.push(product.id);
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    await prisma.productImage.createMany({
      data: [
        { id: a, productId: product.id, url: `/u/${a}.webp`, sortOrder: 0, isPrimary: true },
        { id: b, productId: product.id, url: `/u/${b}.webp`, sortOrder: 1, isPrimary: false },
        { id: c, productId: product.id, url: `/u/${c}.webp`, sortOrder: 2, isPrimary: false },
      ],
    });
    return { productId: product.id, a, b, c };
  };

  const gallery = async (
    productId: string,
  ): Promise<Array<{ id: string; sortOrder: number; isPrimary: boolean }>> =>
    prisma.productImage.findMany({
      where: { productId },
      orderBy: { id: 'asc' },
      select: { id: true, sortOrder: true, isPrimary: true },
    });

  const covers = async (productId: string): Promise<string[]> =>
    (await gallery(productId)).filter((i) => i.isPrimary).map((i) => i.id);

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, ProductImageRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(ProductImageRepository);

    const category = await prisma.category.create({
      data: { name: 'reorder-images', slug: `reorder-images-${randomUUID()}` },
    });
    categoryId = category.id;
  });

  beforeEach(() => {
    createdProducts = [];
  });

  afterEach(async () => {
    // Images cascade with their product.
    await prisma.product.deleteMany({ where: { id: { in: createdProducts } } });
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  it('persists the new order and cover for the product', async () => {
    const { productId, a, b, c } = await mkGallery();

    const ok = await repo.reorderForProduct(productId, [
      { id: c, sortOrder: 0, isPrimary: true },
      { id: a, sortOrder: 1, isPrimary: false },
      { id: b, sortOrder: 2, isPrimary: false },
    ]);

    expect(ok).toBe(true);
    const rows = await gallery(productId);
    expect(rows.find((r) => r.id === c)).toEqual({ id: c, sortOrder: 0, isPrimary: true });
    expect(rows.find((r) => r.id === a)).toEqual({ id: a, sortOrder: 1, isPrimary: false });
    expect(rows.find((r) => r.id === b)).toEqual({ id: b, sortOrder: 2, isPrimary: false });
  });

  it('refuses an image of another product, rolls the whole batch back and leaves that product untouched', async () => {
    const mine = await mkGallery();
    const theirs = await mkGallery();
    const before = await gallery(mine.productId);

    const ok = await repo.reorderForProduct(mine.productId, [
      { id: mine.a, sortOrder: 2, isPrimary: false },
      { id: theirs.b, sortOrder: 0, isPrimary: true },
    ]);

    expect(ok).toBe(false);
    // Nothing of the batch was written — not even the valid first row.
    expect(await gallery(mine.productId)).toEqual(before);
    // The other product's cover did not move.
    expect(await covers(theirs.productId)).toEqual([theirs.a]);
  });

  it('answers false (never P2025) for an id that does not exist', async () => {
    const { productId, a } = await mkGallery();

    await expect(
      repo.reorderForProduct(productId, [{ id: randomUUID(), sortOrder: 0, isPrimary: true }]),
    ).resolves.toBe(false);
    expect(await covers(productId)).toEqual([a]);
  });

  it('demotes the current cover when a partial payload promotes another image', async () => {
    const { productId, b, c } = await mkGallery();

    await expect(
      repo.reorderForProduct(productId, [{ id: b, sortOrder: 1, isPrimary: true }]),
    ).resolves.toBe(true);

    expect(await covers(productId)).toEqual([b]);
    // An image the payload did not mention keeps its order.
    expect((await gallery(productId)).find((r) => r.id === c)?.sortOrder).toBe(2);
  });

  it('never leaves two covers when a concurrent reorder promotes another image', async () => {
    const { productId, a, b, c } = await mkGallery();

    // A competing reorder caught mid-flight: it has moved the cover from `a` to
    // `b` but not committed yet. Letting two real calls race is not enough — they
    // usually finish one after the other and pass even without the row lock.
    let promoted!: () => void;
    const hasPromoted = new Promise<void>((resolve) => (promoted = resolve));
    let commit!: () => void;
    const mayCommit = new Promise<void>((resolve) => (commit = resolve));
    const competing = prisma.$transaction(
      async (tx) => {
        await tx.productImage.update({ where: { id: a }, data: { isPrimary: false } });
        await tx.productImage.update({ where: { id: b }, data: { isPrimary: true } });
        promoted();
        await mayCommit;
      },
      { timeout: 15_000 },
    );
    await hasPromoted;

    // Our reorder promotes `c` while `b`'s promotion is still uncommitted. Without
    // the lock its demote reads a snapshot where `b` is not a cover, skips it, and
    // both `b` and `c` end up primary.
    const ours = repo.reorderForProduct(productId, [{ id: c, sortOrder: 2, isPrimary: true }]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    commit();
    await competing;

    await expect(ours).resolves.toBe(true);
    expect(await covers(productId)).toEqual([c]);
  });
});
