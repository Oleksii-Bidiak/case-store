import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SlugRedirectEntity } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma';
import { ProductRepository } from '../src/product/product.repository';
import { SlugRedirectRepository } from '../src/slug-redirect';

/**
 * Restoring a product onto a NEW slug against a REAL Postgres (TASK-1828).
 *
 * While a product is deleted its native address is free, and another product may take
 * it — and record redirects of its own into it. So restoring on a new address must move
 * only the restored product's OWN redirect history (rows last written before its
 * deletion), redirect the native address only when nobody lives there, and never steal
 * a row a later holder wrote. The `updatedAt` cutoff and the transaction only exist on
 * a real database, hence this file.
 *
 * Requires an isolated `*_test` database; DATABASE_URL is forced to it by setup-int.ts.
 */
describe('Product restore onto a new slug — redirects (integration, TASK-1828)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let products: ProductRepository;
  let redirects: SlugRedirectRepository;

  const s = randomUUID().slice(0, 8);
  const slug = (name: string): string => `rr-${name}-${s}`;
  const P = SlugRedirectEntity.PRODUCT;

  let categoryId: string;
  const createdProductIds: string[] = [];

  const makeProduct = async (name: string, productSlug: string): Promise<string> => {
    const row = await prisma.product.create({
      data: { name: `rr ${name}`, slug: productSlug, price: '9.99', stock: 1, categoryId },
    });
    createdProductIds.push(row.id);
    return row.id;
  };

  /** A redirect row as a rename of the product would have written it. */
  const alias = (from: string, to: string): Promise<void> =>
    prisma.$transaction((tx) => redirects.recordRename(tx, P, from, to));

  const softDelete = async (id: string, productSlug: string): Promise<void> => {
    await products.softDelete(id, `deleted:${id}:${productSlug}`, null);
    // `updatedAt` / `deletedAt` are millisecond timestamps — keep later writes later.
    await new Promise((resolve) => setTimeout(resolve, 15));
  };

  const target = async (oldSlug: string): Promise<string | null> =>
    (await redirects.findRedirect(P, oldSlug))?.newSlug ?? null;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, SlugRedirectRepository, ProductRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    products = moduleRef.get(ProductRepository);
    redirects = moduleRef.get(SlugRedirectRepository);

    categoryId = (await prisma.category.create({ data: { name: 'rr cat', slug: slug('cat') } })).id;
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.slugRedirect.deleteMany({
      where: { entity: P, OR: [{ oldSlug: { contains: s } }, { newSlug: { contains: s } }] },
    });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  it('a free native address redirects to the new one, and the old aliases follow', async () => {
    const native = slug('free');
    const fresh = slug('free-new');
    const id = await makeProduct('free', native);
    await alias(slug('free-older'), native); // renamed older → native while live
    await softDelete(id, native);

    const restored = await products.restore(id, fresh, null, native);

    expect(restored.slug).toBe(fresh);
    expect(restored.isActive).toBe(false); // recorded although it comes back hidden
    expect(await target(native)).toBe(fresh);
    expect(await target(slug('free-older'))).toBe(fresh);
  });

  it('a native address another product now holds stays theirs — only OUR aliases move', async () => {
    const native = slug('taken');
    const fresh = slug('taken-new');
    const id = await makeProduct('taken', native);
    await alias(slug('taken-ours'), native);
    await softDelete(id, native);

    // After the delete, another product takes the native address and brings its own
    // history into it — a rename `theirs → native`.
    await makeProduct('holder', native);
    await alias(slug('taken-theirs'), native);

    await products.restore(id, fresh, null, native);

    expect(await target(slug('taken-ours'))).toBe(fresh);
    expect(await target(slug('taken-theirs'))).toBe(native); // untouched
    expect(await target(native)).toBeNull(); // live elsewhere — no redirect
  });

  it('a row a later holder wrote FROM the native address is not overwritten', async () => {
    const native = slug('moved-on');
    const fresh = slug('moved-on-new');
    const id = await makeProduct('moved-on', native);
    await softDelete(id, native);

    // A later product lived on the native address and renamed away from it.
    const later = await makeProduct('later', native);
    await prisma.product.update({ where: { id: later }, data: { slug: slug('later-now') } });
    await alias(native, slug('later-now'));

    await products.restore(id, fresh, null, native);

    expect(await target(native)).toBe(slug('later-now'));
  });

  it('restoring onto one of its own old aliases leaves no self-loop behind', async () => {
    const native = slug('loop');
    const formerAlias = slug('loop-former');
    const id = await makeProduct('loop', native);
    await alias(formerAlias, native);
    await softDelete(id, native);

    await products.restore(id, formerAlias, null, native);

    expect(await redirects.findRedirect(P, formerAlias)).toBeNull();
    expect(await target(native)).toBe(formerAlias);
  });

  it('restoring on the native slug writes no redirect at all', async () => {
    const native = slug('home');
    const id = await makeProduct('home', native);
    await alias(slug('home-older'), native);
    await softDelete(id, native);

    await products.restore(id, native, null, native);

    expect(await target(native)).toBeNull();
    expect(await target(slug('home-older'))).toBe(native);
  });
});
