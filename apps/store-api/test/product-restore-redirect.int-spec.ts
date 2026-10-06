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

  /** A raw ledger row, as some other product's history could have left it. */
  const row = async (from: string, to: string): Promise<void> => {
    await prisma.slugRedirect.create({
      data: { entity: P, scope: '', oldSlug: from, newScope: '', newSlug: to },
    });
  };

  /**
   * The addresses a visitor landing on `start` is sent through, `start` first — what
   * the storefront's 301s would do hop by hop. Throws on a loop instead of spinning.
   */
  const walk = async (start: string): Promise<string[]> => {
    const seen = [start];
    for (let next = await target(start); next !== null; next = await target(next)) {
      if (seen.includes(next)) {
        throw new Error(`redirect loop: ${[...seen, next].join(' → ')}`);
      }
      seen.push(next);
    }
    return seen;
  };

  /** Keeps `updatedAt` of the rows written next strictly after the ones before. */
  const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 15));

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

  it('a stale row FROM the native address, older than the delete, is overwritten', async () => {
    const native = slug('stale');
    const fresh = slug('stale-new');
    // Long before: some other product lived on the native address and renamed away from
    // it, leaving `native → elsewhere` behind. Then ours took the free address.
    await row(native, slug('stale-elsewhere'));
    await tick();
    const id = await makeProduct('stale', native);
    await softDelete(id, native);

    await products.restore(id, fresh, null, native);

    expect(await target(native)).toBe(fresh);
  });

  it('another product’s alias ON the new address is dropped — no 301 loop', async () => {
    const native = slug('cycle');
    const fresh = slug('cycle-new');
    const id = await makeProduct('cycle', native);
    await softDelete(id, native);

    // After our delete another product lived on `fresh`, renamed into the free native
    // address (writing `fresh → native`), and was deleted in its turn.
    const other = await makeProduct('cycle-other', fresh);
    await prisma.product.update({ where: { id: other }, data: { slug: native } });
    await alias(fresh, native);
    await softDelete(other, native);

    await products.restore(id, fresh, null, native);

    expect(await target(fresh)).toBeNull(); // the address we live on never redirects
    expect(await target(native)).toBe(fresh);
    expect(await walk(native)).toEqual([native, fresh]);
  });

  it('a chain that runs through the new address into the native one cannot loop', async () => {
    const native = slug('chain');
    const fresh = slug('chain-new');
    const mid = slug('chain-mid');
    const id = await makeProduct('chain', native);
    await softDelete(id, native);

    // Rows of other, deleted products: `fresh → mid → native`.
    await row(fresh, mid);
    await row(mid, native);

    await products.restore(id, fresh, null, native);

    expect(await target(fresh)).toBeNull();
    expect(await target(mid)).toBe(native); // theirs, written after our delete — kept
    expect(await walk(mid)).toEqual([mid, native, fresh]);
    expect(await walk(native)).toEqual([native, fresh]);
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
