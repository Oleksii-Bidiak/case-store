import { OrderStatus, Prisma, SlugRedirectEntity } from '@prisma/client';
import { ProductRepository } from './product.repository';
import {
  ProductCategoryBusyError,
  ProductCategoryGoneError,
  ProductRestoreConflictError,
} from './product.errors';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from '../slug-redirect';
import { PUBLIC_PRODUCT_WHERE } from './product-visibility';

// ─── Mock PrismaService ──────────────────────────────────────────────────────

const txMock = {
  $executeRaw: jest.fn(),
  product: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  category: {
    findFirst: jest.fn(),
  },
};

const prismaMock = {
  $queryRaw: jest.fn(),
  product: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  productImage: {
    findMany: jest.fn(),
  },
  review: {
    groupBy: jest.fn(),
  },
  orderItem: {
    groupBy: jest.fn(),
  },
  $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
};

/** The SQL text of one `$executeRaw` tagged-template call. */
const rawSql = (call: unknown[]): string => (call[0] as TemplateStringsArray).join('?');

/**
 * The advisory-lock statement among the transaction's raw calls — the bounded-wait
 * `lock_timeout` settings bracket it (TASK-1772 review), so it is not the first one.
 */
const advisoryLockCall = (): unknown[] => {
  const call = txMock.$executeRaw.mock.calls.find((c: unknown[]) =>
    rawSql(c).includes('pg_advisory'),
  );
  if (!call) throw new Error('no advisory lock was taken');
  return call;
};

/** A Prisma known-request error as the client would throw it. */
const prismaError = (code: string, meta: Record<string, unknown> = {}) =>
  new Prisma.PrismaClientKnownRequestError(code, { code, clientVersion: 'test', meta });

/** Postgres `lock_timeout` firing on a raw statement, as the pg driver adapter reports it. */
const lockTimeout = () =>
  prismaError('P2010', {
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: { originalCode: '55P03', kind: 'postgres', code: '55P03' },
    },
  });

const slugRedirectRepositoryMock = {
  recordRename: jest.fn(),
  recordRestoreRename: jest.fn(),
};

describe('ProductRepository (soft-delete behaviour)', () => {
  let repository: ProductRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ProductRepository(
      prismaMock as unknown as PrismaService,
      slugRedirectRepositoryMock as unknown as SlugRedirectRepository,
    );
  });

  // ─── update + slug-redirect recording (TASK-285-G) ──────────────────────────

  describe('update (slug rename)', () => {
    it('never opens a transaction nor records a redirect when slugRename is absent', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-1' });

      await repository.update('product-1', { name: 'Renamed' });

      expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
    });

    it('runs the product update + recordRename inside one transaction when slugRename is given', async () => {
      const renamed = { id: 'product-1', slug: 'new-slug' };
      txMock.product.update.mockResolvedValue(renamed);

      const result = await repository.update(
        'product-1',
        { slug: 'new-slug' },
        { oldSlug: 'old-slug', newSlug: 'new-slug' },
      );

      expect(result).toBe(renamed);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'product-1' },
          data: expect.objectContaining({ slug: 'new-slug' }),
        }),
      );
      expect(slugRedirectRepositoryMock.recordRename).toHaveBeenCalledWith(
        txMock,
        SlugRedirectEntity.PRODUCT,
        'old-slug',
        'new-slug',
      );
      expect(prismaMock.product.update).not.toHaveBeenCalled();
    });

    it('softDelete (audit tombstone with mangled slug) never records a redirect', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-1' });

      await repository.softDelete('product-1', 'deleted:product-1:old-slug', null);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
    });
  });

  // ─── invariant I1 under the category tree lock (TASK-1772) ──────────────────

  describe('create / update — category re-checked under the tree lock (TASK-1772)', () => {
    const order = (fn: jest.Mock): number => fn.mock.invocationCallOrder[0];
    const lockSql = (): string => (advisoryLockCall()[0] as TemplateStringsArray).join('?');

    beforeEach(() => {
      txMock.$executeRaw.mockResolvedValue(1);
      txMock.category.findFirst.mockResolvedValue({ id: 'cat-1' });
      txMock.product.create.mockResolvedValue({ id: 'product-1' });
      txMock.product.update.mockResolvedValue({ id: 'product-1' });
    });

    it('create: SHARED tree lock → live-category read → insert, in one transaction', async () => {
      await repository.create({ name: 'Case', slug: 'case', price: 9.99, categoryId: 'cat-1' });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.product.create).not.toHaveBeenCalled();
      // The same tree key CategoryRepository.deleteSubtreeWithMove holds exclusively.
      expect(advisoryLockCall()[1]).toBe('categories:__tree__');
      expect(lockSql()).toContain('pg_advisory_xact_lock_shared(');
      expect(txMock.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-1', deletedAt: null },
        select: { id: true },
      });
      expect(order(txMock.$executeRaw)).toBeLessThan(order(txMock.category.findFirst));
      expect(order(txMock.category.findFirst)).toBeLessThan(order(txMock.product.create));
    });

    it('create: a deleted category → ProductCategoryGoneError, nothing inserted', async () => {
      txMock.category.findFirst.mockResolvedValue(null);

      await expect(
        repository.create({ name: 'Case', slug: 'case', price: 9.99, categoryId: 'cat-gone' }),
      ).rejects.toBeInstanceOf(ProductCategoryGoneError);
      expect(txMock.product.create).not.toHaveBeenCalled();
    });

    it('update with a categoryId: lock → check → write, in one transaction', async () => {
      await repository.update('product-1', { categoryId: 'cat-1', name: 'Moved' });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.product.update).not.toHaveBeenCalled();
      expect(advisoryLockCall()[1]).toBe('categories:__tree__');
      expect(lockSql()).toContain('pg_advisory_xact_lock_shared(');
      expect(order(txMock.$executeRaw)).toBeLessThan(order(txMock.category.findFirst));
      expect(order(txMock.category.findFirst)).toBeLessThan(order(txMock.product.update));
      expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
    });

    // A form re-sending the category it loaded must not put a product a concurrent
    // delete just moved back into the tombstone — so the check is not "only on change".
    it('update re-checks an UNCHANGED categoryId too, and refuses a deleted one', async () => {
      txMock.category.findFirst.mockResolvedValue(null);

      await expect(
        repository.update('product-1', { categoryId: 'cat-gone' }),
      ).rejects.toBeInstanceOf(ProductCategoryGoneError);
      expect(txMock.product.update).not.toHaveBeenCalled();
    });

    it('update with a categoryId AND a slug rename: one transaction, lock first', async () => {
      await repository.update(
        'product-1',
        { categoryId: 'cat-1', slug: 'new-slug' },
        { oldSlug: 'old-slug', newSlug: 'new-slug' },
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(order(txMock.$executeRaw)).toBeLessThan(order(txMock.product.update));
      expect(slugRedirectRepositoryMock.recordRename).toHaveBeenCalledWith(
        txMock,
        SlugRedirectEntity.PRODUCT,
        'old-slug',
        'new-slug',
      );
    });

    it('bounds the wait: lock_timeout set just for the lock statement, then back to default', async () => {
      await repository.create({ name: 'Case', slug: 'case', price: 9.99, categoryId: 'cat-1' });

      const sql = txMock.$executeRaw.mock.calls.map((call: unknown[]) => rawSql(call));
      expect(sql).toHaveLength(3);
      expect(sql[0]).toContain("set_config('lock_timeout'");
      expect(txMock.$executeRaw.mock.calls[0][1]).toBe('5s');
      expect(sql[0]).toMatch(/, true\)$/); // transaction-local
      expect(sql[1]).toContain('pg_advisory_xact_lock_shared(');
      expect(sql[2]).toBe('SET LOCAL lock_timeout TO DEFAULT');
    });

    it.each([
      ['create', () => repository.create({ name: 'C', slug: 'c', price: 1, categoryId: 'cat-1' })],
      ['update', () => repository.update('product-1', { categoryId: 'cat-1' })],
    ])(
      '%s: a lock wait that times out (55P03) → ProductCategoryBusyError, nothing written',
      async (_name, write) => {
        txMock.$executeRaw.mockImplementation((sql: TemplateStringsArray) =>
          sql.join('?').includes('pg_advisory')
            ? Promise.reject(lockTimeout())
            : Promise.resolve(1),
        );

        await expect(write()).rejects.toBeInstanceOf(ProductCategoryBusyError);
        expect(txMock.category.findFirst).not.toHaveBeenCalled();
        expect(txMock.product.create).not.toHaveBeenCalled();
        expect(txMock.product.update).not.toHaveBeenCalled();
      },
    );

    it('a transaction that outlived its budget (P2028) is busy too', async () => {
      prismaMock.$transaction.mockRejectedValueOnce(prismaError('P2028', { operation: 'commit' }));

      await expect(repository.update('product-1', { categoryId: 'cat-1' })).rejects.toBeInstanceOf(
        ProductCategoryBusyError,
      );
    });

    it('a slug rename alone takes no lock and is never reported busy', async () => {
      const expired = prismaError('P2028', { operation: 'commit' });
      prismaMock.$transaction.mockRejectedValueOnce(expired);

      await expect(
        repository.update('product-1', { slug: 'new' }, { oldSlug: 'old', newSlug: 'new' }),
      ).rejects.toBe(expired);
    });

    it('any other error passes through untouched', async () => {
      const broken = prismaError('P2010', { driverAdapterError: { cause: { code: '42P01' } } });
      txMock.$executeRaw.mockImplementation((sql: TemplateStringsArray) =>
        sql.join('?').includes('pg_advisory') ? Promise.reject(broken) : Promise.resolve(1),
      );

      await expect(
        repository.create({ name: 'C', slug: 'c', price: 1, categoryId: 'cat-1' }),
      ).rejects.toBe(broken);
    });

    it('update without a categoryId takes no lock (the hot, single-statement path)', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-1' });

      await repository.update('product-1', { price: 10 });

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(txMock.$executeRaw).not.toHaveBeenCalled();
    });
  });

  // ─── read paths exclude tombstoned rows ─────────────────────────────────────

  describe('findById', () => {
    it('should filter out soft-deleted products via deletedAt: null', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findById('product-1');

      expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'product-1', deletedAt: null },
        include: { brand: { select: { id: true, name: true, slug: true, logo: true } } },
      });
    });
  });

  describe('findPublicById (TASK-781)', () => {
    it('reads through the shared public predicate, so a draft answers like a missing id', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      const result = await repository.findPublicById('product-1');

      expect(result).toBeNull();
      expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'product-1', ...PUBLIC_PRODUCT_WHERE },
        include: { brand: { select: { id: true, name: true, slug: true, logo: true } } },
      });
    });
  });

  describe('findBySlug', () => {
    it('should exclude soft-deleted products', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySlug('clear-case');

      expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
        where: { slug: 'clear-case', deletedAt: null },
      });
    });
  });

  describe('findBySku', () => {
    it('should exclude soft-deleted products', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySku('SKU-1');

      expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
        where: { sku: 'SKU-1', deletedAt: null },
      });
    });
  });

  // ─── findBySkuIgnoringCase — the search article-number lookup (TASK-542) ─────
  // A shopper typing `ip15-1` means `IP15-1`. The Postgres fallback's `contains`
  // was already case-insensitive, so the exact-code pre-pass must be too, or the
  // answer depends on whether Meilisearch is up.

  describe('findBySkuIgnoringCase', () => {
    it('returns the exact-case match without a second query', async () => {
      const exact = { id: 'p-exact', sku: 'IP15-1' };
      prismaMock.product.findFirst.mockResolvedValue(exact as never);

      await expect(repository.findBySkuIgnoringCase('IP15-1')).resolves.toBe(exact);

      expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
        where: { sku: 'IP15-1', deletedAt: null },
      });
      expect(prismaMock.product.findMany).not.toHaveBeenCalled();
    });

    it('finds IP15-1 for the query ip15-1', async () => {
      const row = { id: 'p-1', sku: 'IP15-1' };
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.findMany.mockResolvedValue([row] as never);

      await expect(repository.findBySkuIgnoringCase('ip15-1')).resolves.toBe(row);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith({
        where: { sku: { equals: 'ip15-1', mode: 'insensitive' }, deletedAt: null },
        take: 2,
      });
    });

    it('answers null when the code names two positions that differ only by case', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.findMany.mockResolvedValue([
        { id: 'p-1', sku: 'AB-1' },
        { id: 'p-2', sku: 'ab-1' },
      ] as never);

      await expect(repository.findBySkuIgnoringCase('Ab-1')).resolves.toBeNull();
    });

    it('answers null when nothing matches', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.findMany.mockResolvedValue([]);

      await expect(repository.findBySkuIgnoringCase('zz-9')).resolves.toBeNull();
    });

    it('escapes LIKE metacharacters so the code is matched literally', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);
      prismaMock.product.findMany.mockResolvedValue([]);

      await repository.findBySkuIgnoringCase('ab_1%\\x');

      expect(prismaMock.product.findMany).toHaveBeenCalledWith({
        where: { sku: { equals: 'ab\\_1\\%\\\\x', mode: 'insensitive' }, deletedAt: null },
        take: 2,
      });
    });
  });

  // ─── findBySlugWithRelations — public detail read (TASK-145) ─────────────────
  // The public PDP endpoint must hide deactivated products: the default query
  // filters `isActive: true`. The `activeOnly: false` override (reserved for the
  // future staff preview, TASK-155) drops that filter.

  describe('findBySlugWithRelations', () => {
    it('should require BOTH the product and its category to be active by default (TASK-297)', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySlugWithRelations('clear-case');

      const findFirstArgs = prismaMock.product.findFirst.mock.calls[0][0];
      expect(findFirstArgs.where).toEqual({ slug: 'clear-case', ...PUBLIC_PRODUCT_WHERE });
    });

    it('lists only publicly visible sibling positions — a sibling in an inactive category is no variant (TASK-782)', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySlugWithRelations('clear-case');

      const findFirstArgs = prismaMock.product.findFirst.mock.calls[0][0];
      expect(findFirstArgs.include.group.include.positions.where).toEqual(PUBLIC_PRODUCT_WHERE);
    });

    it('keeps the sibling filter public in the admin preview — it previews what the storefront shows (TASK-782)', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySlugWithRelations('clear-case', { activeOnly: false });

      const findFirstArgs = prismaMock.product.findFirst.mock.calls[0][0];
      expect(findFirstArgs.include.group.include.positions.where).toEqual(PUBLIC_PRODUCT_WHERE);
    });

    it('should omit BOTH active filters when activeOnly is false (admin preview)', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySlugWithRelations('clear-case', { activeOnly: false });

      const findFirstArgs = prismaMock.product.findFirst.mock.calls[0][0];
      expect(findFirstArgs.where).toEqual({
        slug: 'clear-case',
        deletedAt: null,
      });
      expect(findFirstArgs.where).not.toHaveProperty('isActive');
    });
  });

  describe('findAll', () => {
    it('should always constrain the where clause with deletedAt: null', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(expect.objectContaining({ deletedAt: null }));
      const countArgs = prismaMock.product.count.mock.calls[0][0];
      expect(countArgs.where).toEqual(expect.objectContaining({ deletedAt: null }));
    });

    // ── Tombstone filter, admin only (TASK-427) ──────────────────────────────
    //
    // The `deleted` flag INVERTS the tombstone filter rather than relaxing it:
    // a listing shows the live products or exactly the deleted ones, never a
    // mixed page. The public storefront listing calls this very method, so the
    // "not set" case below is the one that keeps withdrawn products — whose slug
    // and sku have been mangled and freed for reuse — off the shop.
    describe('deleted filter (TASK-427)', () => {
      beforeEach(() => {
        prismaMock.product.findMany.mockResolvedValue([]);
        prismaMock.product.count.mockResolvedValue(0);
      });

      const whereOf = () => prismaMock.product.findMany.mock.calls[0][0].where;
      const countWhereOf = () => prismaMock.product.count.mock.calls[0][0].where;

      it('keeps deletedAt: null when the flag is absent (the public path)', async () => {
        await repository.findAll({ page: 1, limit: 20, isActive: true, categoryActiveOnly: true });

        expect(whereOf()).toEqual(expect.objectContaining({ deletedAt: null }));
        expect(countWhereOf()).toEqual(expect.objectContaining({ deletedAt: null }));
      });

      it('keeps deletedAt: null when the flag is explicitly false', async () => {
        await repository.findAll({ page: 1, limit: 20, deleted: false });

        expect(whereOf()).toEqual(expect.objectContaining({ deletedAt: null }));
        expect(countWhereOf()).toEqual(expect.objectContaining({ deletedAt: null }));
      });

      it('asks for tombstones only when the flag is set (the admin path)', async () => {
        await repository.findAll({ page: 1, limit: 20, deleted: true });

        expect(whereOf()).toEqual(expect.objectContaining({ deletedAt: { not: null } }));
        expect(countWhereOf()).toEqual(expect.objectContaining({ deletedAt: { not: null } }));
      });

      it('composes with the other filters instead of replacing them', async () => {
        await repository.findAll({
          page: 1,
          limit: 20,
          deleted: true,
          categoryIds: ['cat-1'],
          search: 'чохол',
        });

        expect(whereOf()).toEqual(
          expect.objectContaining({
            deletedAt: { not: null },
            categoryId: { in: ['cat-1'] },
          }),
        );
        expect(whereOf().OR).toHaveLength(2);
      });
    });

    // ── Search by article number, admin only (TASK-406 / AD-PROD-08) ──
    //
    // `findAll` is ONE method serving both the public storefront listing and the
    // admin table. Adding `sku` to the OR unconditionally would have handed the
    // shop's internal article numbers to the public search box, so the column
    // joins the clause only behind the flag `adminFindAll` sets.
    describe('search over sku', () => {
      beforeEach(() => {
        prismaMock.product.findMany.mockResolvedValue([]);
        prismaMock.product.count.mockResolvedValue(0);
      });

      const orOf = () => prismaMock.product.findMany.mock.calls[0][0].where.OR;

      it('searches name + description only by default (the public path)', async () => {
        await repository.findAll({ page: 1, limit: 20, search: 'AB-1234' });

        expect(orOf()).toEqual([
          { name: { contains: 'AB-1234', mode: 'insensitive' } },
          { description: { contains: 'AB-1234', mode: 'insensitive' } },
        ]);
      });

      it('never leaks sku when the flag is explicitly false', async () => {
        await repository.findAll({
          page: 1,
          limit: 20,
          search: 'AB-1234',
          searchIncludesSku: false,
        });

        expect(orOf()).toHaveLength(2);
        expect(JSON.stringify(orOf())).not.toContain('sku');
      });

      it('adds sku to the OR when searchIncludesSku is set (the admin path)', async () => {
        await repository.findAll({
          page: 1,
          limit: 20,
          search: 'AB-1234',
          searchIncludesSku: true,
        });

        expect(orOf()).toEqual([
          { name: { contains: 'AB-1234', mode: 'insensitive' } },
          { description: { contains: 'AB-1234', mode: 'insensitive' } },
          { sku: { contains: 'AB-1234', mode: 'insensitive' } },
        ]);
      });

      it('builds no OR at all when the flag is set without a search term', async () => {
        await repository.findAll({ page: 1, limit: 20, searchIncludesSku: true });

        expect(prismaMock.product.findMany.mock.calls[0][0].where).not.toHaveProperty('OR');
      });
    });

    it('appends id as the last sort key so pages cannot overlap (TASK-292)', async () => {
      // None of the sortable columns is unique — an import writes many products
      // with the same createdAt, and stock repeats constantly. Without a unique
      // last key Postgres may order tied rows differently on every query, so a
      // product comes back on page 1 AND page 2 while another never appears,
      // with the totals still adding up.
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      expect(prismaMock.product.findMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: 'desc' },
        { id: 'asc' },
      ]);
    });

    // TASK-362: on the PUBLIC listing, sold-out products sort behind everything
    // in stock. Prisma cannot order by an expression, so the page is assembled
    // from two independently-ordered partitions.
    describe('inStockFirst (TASK-362)', () => {
      const args = { page: 1, limit: 20, inStockFirst: true };

      /** Rows the page-enrichment step can chew through without extra queries. */
      const rows = (prefix: string, count: number) =>
        Array.from({ length: count }, (_, i) => ({
          id: `${prefix}${i}`,
          groupId: null,
          brand: null,
        }));

      /** Only the calls that actually partition — enrichment issues its own. */
      const partitionCalls = () =>
        prismaMock.product.findMany.mock.calls.filter(
          (call) => call[0]?.where?.stock !== undefined,
        );

      beforeEach(() => {
        // Enrichment runs whenever a page returns rows; give it empty results so
        // these tests stay about the ordering.
        prismaMock.review.groupBy.mockResolvedValue([]);
        prismaMock.productImage.findMany.mockResolvedValue([]);
      });

      it('does not partition unless asked — the admin keeps one flat query', async () => {
        prismaMock.product.findMany.mockResolvedValue([]);
        prismaMock.product.count.mockResolvedValue(0);

        await repository.findAll({ page: 1, limit: 20 });

        expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.product.findMany.mock.calls[0][0].where.stock).toBeUndefined();
      });

      it('serves a full page from the in-stock partition alone', async () => {
        prismaMock.product.count
          .mockResolvedValueOnce(100) // in stock
          .mockResolvedValueOnce(140); // total
        prismaMock.product.findMany.mockResolvedValueOnce(rows('p', 20));

        const result = await repository.findAll(args);

        expect(partitionCalls()).toHaveLength(1);
        expect(partitionCalls()[0][0].where.stock).toEqual({ gt: 0 });
        expect(result.total).toBe(140);
      });

      // The page that straddles the boundary is the one worth pinning: it has to
      // top up from the START of the out-of-stock tail, not from the same offset.
      it('tops a straddling page up from the head of the out-of-stock tail', async () => {
        prismaMock.product.count.mockResolvedValueOnce(5).mockResolvedValueOnce(40);
        prismaMock.product.findMany
          .mockResolvedValueOnce(rows('in', 5))
          .mockResolvedValueOnce(rows('out', 15));

        const result = await repository.findAll(args);

        expect(partitionCalls()).toHaveLength(2);
        const tailArgs = partitionCalls()[1][0];
        expect(tailArgs.where.stock).toEqual({ lte: 0 });
        expect(tailArgs.take).toBe(15);
        expect(tailArgs.skip).toBeUndefined();
        expect(result.products).toHaveLength(20);
        expect(result.total).toBe(40);
      });

      it('pages wholly past the boundary against the tail, offset by the in-stock count', async () => {
        prismaMock.product.count.mockResolvedValueOnce(5).mockResolvedValueOnce(40);
        prismaMock.product.findMany.mockResolvedValueOnce([]);

        // page 2 of 20 ⇒ skip 20, which is past the 5 in-stock rows.
        await repository.findAll({ page: 2, limit: 20, inStockFirst: true });

        expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
        const tailArgs = prismaMock.product.findMany.mock.calls[0][0];
        expect(tailArgs.where.stock).toEqual({ lte: 0 });
        expect(tailArgs.skip).toBe(15);
      });

      // TASK-830 (SF-CAT-13): the partitions set `stock` themselves, so running
      // them over a slice the caller already narrowed by stock REPLACED the
      // filter — «Тільки в наявності» topped a short page up with sold-out rows.
      it('does not partition an inStock slice — no sold-out tail can leak back in', async () => {
        prismaMock.product.count.mockResolvedValueOnce(5);
        prismaMock.product.findMany.mockResolvedValueOnce(rows('in', 5));

        const result = await repository.findAll({ ...args, inStock: true });

        expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
        for (const [call] of prismaMock.product.findMany.mock.calls) {
          expect(call.where.stock).toEqual({ gt: 0 });
        }
        expect(prismaMock.product.count).toHaveBeenCalledTimes(1);
        expect(prismaMock.product.count.mock.calls[0][0].where.stock).toEqual({ gt: 0 });
        expect(result.products).toHaveLength(5);
        expect(result.total).toBe(5);
      });

      it('pages an inStock slice past page 1 by plain offset, never against a tail', async () => {
        prismaMock.product.count.mockResolvedValueOnce(25);
        prismaMock.product.findMany.mockResolvedValueOnce(rows('in', 5));

        await repository.findAll({ page: 2, limit: 20, inStockFirst: true, inStock: true });

        expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
        const pageArgs = prismaMock.product.findMany.mock.calls[0][0];
        expect(pageArgs.where.stock).toEqual({ gt: 0 });
        expect(pageArgs.skip).toBe(20);
      });

      it('keeps an outOfStock slice to the zero-stock side as well', async () => {
        prismaMock.product.count.mockResolvedValueOnce(3);
        prismaMock.product.findMany.mockResolvedValueOnce(rows('out', 3));

        await repository.findAll({ ...args, outOfStock: true });

        expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.product.findMany.mock.calls[0][0].where.stock).toEqual({ lte: 0 });
      });

      it('keeps the id tiebreaker inside each partition', async () => {
        prismaMock.product.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
        prismaMock.product.findMany.mockResolvedValueOnce([]);

        await repository.findAll({ ...args, sortBy: 'price', sortOrder: 'asc' });

        expect(prismaMock.product.findMany.mock.calls[0][0].orderBy).toEqual([
          { price: 'asc' },
          { id: 'asc' },
        ]);
      });
    });

    it('keeps the id tiebreaker on an explicit sort field (TASK-292)', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, sortBy: 'price', sortOrder: 'asc' });

      expect(prismaMock.product.findMany.mock.calls[0][0].orderBy).toEqual([
        { price: 'asc' },
        { id: 'asc' },
      ]);
    });

    // TASK-656 (Т8): the «Видалені» list orders by the moment of deletion.
    it('orders the tombstone list by deletedAt with the id tiebreaker', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        deleted: true,
        sortBy: 'deletedAt',
        sortOrder: 'desc',
      });

      expect(prismaMock.product.findMany.mock.calls[0][0].orderBy).toEqual([
        { deletedAt: 'desc' },
        { id: 'asc' },
      ]);
    });

    it('should keep deletedAt: null alongside other filters', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, categoryIds: ['cat-1'], isActive: true });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(
        expect.objectContaining({ deletedAt: null, categoryId: { in: ['cat-1'] }, isActive: true }),
      );
    });

    // ─── withdrawn categories (TASK-297) ────────────────────────────────────

    it('joins on category.isActive when categoryActiveOnly is set (public list)', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, isActive: true, categoryActiveOnly: true });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(
        expect.objectContaining({ isActive: true, category: { isActive: true, deletedAt: null } }),
      );
      // The count must carry the SAME predicate, or pagination `total` would
      // advertise pages of products the list itself refuses to return.
      const countArgs = prismaMock.product.count.mock.calls[0][0];
      expect(countArgs.where).toEqual(
        expect.objectContaining({ category: { isActive: true, deletedAt: null } }),
      );
    });

    it('leaves the category join off when categoryActiveOnly is unset (admin list)', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).not.toHaveProperty('category');
    });

    it('composes the category join with the subtree rollup, not instead of it', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        categoryIds: ['root', 'child'],
        categoryActiveOnly: true,
      });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(
        expect.objectContaining({
          categoryId: { in: ['root', 'child'] },
          category: { isActive: true, deletedAt: null },
        }),
      );
    });

    // TASK-236: the category filter now matches the whole expanded subtree via
    // an `IN (...)` clause, so a parent category rolls up its subcategories.
    it('matches the full category subtree with an IN clause', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        categoryIds: ['root', 'child', 'grandchild'],
      });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(
        expect.objectContaining({ categoryId: { in: ['root', 'child', 'grandchild'] } }),
      );
    });

    // ── TASK-414: in-stock + multi-value spec facets ─────────────────────────

    it('filters to stock > 0 for the storefront «В наявності» checkbox', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, inStock: true });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(expect.objectContaining({ stock: { gt: 0 } }));
      // The count must carry the same predicate or `total` overcounts.
      expect(prismaMock.product.count.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ stock: { gt: 0 } }),
      );
    });

    it('applies no stock predicate at all when inStock is unset', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      expect(prismaMock.product.findMany.mock.calls[0][0].where).not.toHaveProperty('stock');
    });

    it('lets the admin restock worklist (outOfStock) win over inStock', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, inStock: true, outOfStock: true });

      // The two are exact opposites; an AND of both would always be empty, so
      // the more specific admin intent takes the field.
      expect(prismaMock.product.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ stock: { lte: 0 } }),
      );
    });

    // B-10: values inside a facet OR, facets AND. The AND must be one ENTRY PER
    // FACET — a single `specValues.some` covering two definition keys asks for
    // one spec row that is both keys at once, which is never true.
    it('builds one AND entry per facet, with the facet values OR-ed inside it', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        specFilters: [
          { key: 'material', values: ['Силікон', 'TPU'] },
          { key: 'case-type', values: ['Накладка'] },
        ],
      });

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      // The full definition guard (filterable + facetable type, TASK-706) is
      // pinned in product-list-where.spec.ts; here only the per-facet shape.
      expect(findManyArgs.where.AND).toEqual([
        {
          specValues: {
            some: {
              value: { in: ['Силікон', 'TPU'] },
              definition: expect.objectContaining({ key: 'material', isFilterable: true }),
            },
          },
        },
        {
          specValues: {
            some: {
              value: { in: ['Накладка'] },
              definition: expect.objectContaining({ key: 'case-type', isFilterable: true }),
            },
          },
        },
      ]);
      // Never collapsed into a single `some`, which would be unsatisfiable.
      expect(findManyArgs.where).not.toHaveProperty('specValues');
    });

    it('leaves where.AND untouched when no facet is requested', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, specFilters: [] });

      expect(prismaMock.product.findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
    });

    it('attaches active sibling positions of each grouped product for the variant summary', async () => {
      prismaMock.product.findMany
        // page rows
        .mockResolvedValueOnce([{ id: 'p1', groupId: 'grp-1' }])
        // variant siblings query
        .mockResolvedValueOnce([
          {
            id: 'p1',
            slug: 'p1',
            groupId: 'grp-1',
            price: { toString: () => '9.99' },
            attributes: { color: 'Black' },
            stock: 3,
            positionOrder: 0,
          },
          {
            id: 'p2',
            slug: 'p2',
            groupId: 'grp-1',
            price: { toString: () => '12.99' },
            attributes: { color: 'White' },
            stock: 1,
            positionOrder: 1,
          },
        ]);
      prismaMock.product.count.mockResolvedValue(1);
      prismaMock.review.groupBy.mockResolvedValue([]);
      prismaMock.productImage.findMany.mockResolvedValue([]);

      const result = await repository.findAll({ page: 1, limit: 20 });

      // Sibling query is scoped to the page's groups and to what a shopper may
      // see — including the category half, so neither a colour dot nor the
      // «від X ₴» price comes from a position in a withdrawn category (TASK-782).
      const variantQuery = prismaMock.product.findMany.mock.calls[1][0];
      expect(variantQuery.where).toEqual({
        groupId: { in: ['grp-1'] },
        ...PUBLIC_PRODUCT_WHERE,
      });
      expect(result.products[0].variantSiblings).toHaveLength(2);
      expect(result.products[0].variantSiblings?.[0]).not.toHaveProperty('groupId');
    });

    it('does not run a sibling query when no product on the page has a group', async () => {
      prismaMock.product.findMany.mockResolvedValueOnce([{ id: 'p1', groupId: null }]);
      prismaMock.product.count.mockResolvedValue(1);
      prismaMock.review.groupBy.mockResolvedValue([]);
      prismaMock.productImage.findMany.mockResolvedValue([]);

      const result = await repository.findAll({ page: 1, limit: 20 });

      // Only the page query ran — no second product.findMany for siblings.
      expect(prismaMock.product.findMany).toHaveBeenCalledTimes(1);
      expect(result.products[0].variantSiblings).toBeUndefined();
    });
  });

  // ─── onSale filter (TASK-179) ───────────────────────────────────────────────
  // `compareAtPrice > price` can't be a typed Prisma where, so the repository
  // prefetches the matching ids with a raw query and ANDs them into `where.id`.
  describe('onSale filter (TASK-179)', () => {
    it('ANDs the raw-SQL id set into where.id alongside existing filters', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'p1' }, { id: 'p3' }]);
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        onSale: true,
        categoryIds: ['cat-1'],
      });

      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      // The category filter is preserved (ANDed), not replaced.
      expect(findManyArgs.where).toEqual(
        expect.objectContaining({
          categoryId: { in: ['cat-1'] },
          id: { in: ['p1', 'p3'] },
        }),
      );
      const countArgs = prismaMock.product.count.mock.calls[0][0];
      expect(countArgs.where).toEqual(expect.objectContaining({ id: { in: ['p1', 'p3'] } }));
    });

    it('composes with the bestselling sort — the candidate where carries id: in', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      // bestselling: candidates query (id + createdAt), then the page rows query.
      prismaMock.product.findMany
        .mockResolvedValueOnce([
          { id: 'p1', createdAt: new Date('2026-01-01') },
          { id: 'p2', createdAt: new Date('2026-01-02') },
        ])
        .mockResolvedValueOnce([{ id: 'p1', groupId: null }]);
      prismaMock.orderItem.groupBy.mockResolvedValue([]);
      prismaMock.review.groupBy.mockResolvedValue([]);
      prismaMock.productImage.findMany.mockResolvedValue([]);

      await repository.findAll({ page: 1, limit: 20, onSale: true, sortBy: 'bestselling' });

      const candidateWhere = prismaMock.product.findMany.mock.calls[0][0].where;
      expect(candidateWhere).toEqual(
        expect.objectContaining({ id: { in: ['p1', 'p2'] }, deletedAt: null }),
      );
    });

    it('does not run the raw query when onSale is absent/false', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });
      await repository.findAll({ page: 1, limit: 20, onSale: false });

      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });
  });

  // ─── softDelete ─────────────────────────────────────────────────────────────

  describe('softDelete', () => {
    it('should set deletedAt, isActive=false, and mangled slug/sku', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-1' });

      await repository.softDelete(
        'product-1',
        'deleted:product-1:clear-case',
        'deleted:product-1:SKU-1',
      );

      const updateArgs = prismaMock.product.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'product-1' });
      expect(updateArgs.data.isActive).toBe(false);
      expect(updateArgs.data.slug).toBe('deleted:product-1:clear-case');
      expect(updateArgs.data.sku).toBe('deleted:product-1:SKU-1');
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    });

    it('should pass a null sku through unchanged when the product had none', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-2' });

      await repository.softDelete('product-2', 'deleted:product-2:no-sku-product', null);

      const updateArgs = prismaMock.product.update.mock.calls[0][0];
      expect(updateArgs.data.sku).toBeNull();
    });
  });

  // ─── restore (TASK-656) ─────────────────────────────────────────────────────

  describe('findDeletedById', () => {
    it('reads ONLY tombstones — the inverse of every other read', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findDeletedById('product-1');

      expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'product-1', deletedAt: { not: null } },
      });
    });
  });

  describe('restore', () => {
    function uniqueViolation(meta: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
      return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta,
      });
    }

    beforeEach(() => {
      txMock.$executeRaw.mockResolvedValue(1);
      txMock.product.findFirst.mockResolvedValue({ categoryId: 'cat-1' });
      txMock.category.findFirst.mockResolvedValue({ id: 'cat-1' });
      txMock.product.update.mockResolvedValue({ id: 'product-1' });
    });

    it('clears deletedAt, keeps the product hidden and writes the given slug/sku, tombstones only', async () => {
      await repository.restore('product-1', 'clear-case', 'SKU-1');

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.product.update).not.toHaveBeenCalled();
      expect(txMock.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1', deletedAt: { not: null } },
        data: { deletedAt: null, isActive: false, slug: 'clear-case', sku: 'SKU-1' },
      });
    });

    it('checks the CURRENT category of the row under the category tree lock, before writing', async () => {
      await repository.restore('product-1', 'clear-case', 'SKU-1');

      // The same tree key CategoryRepository.deleteSubtreeWithMove holds for a delete.
      const [lockSql, lockedKey] = advisoryLockCall();
      expect(lockedKey).toBe('categories:__tree__');
      // Shared, like every category-filing product write (TASK-1772): the delete holds
      // it exclusively, so the two still cannot interleave.
      expect((lockSql as TemplateStringsArray).join('?')).toContain(
        'pg_advisory_xact_lock_shared(',
      );
      expect(txMock.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'product-1', deletedAt: { not: null } },
        select: { categoryId: true, deletedAt: true },
      });
      expect(txMock.category.findFirst).toHaveBeenCalledWith({
        where: { id: 'cat-1', deletedAt: null },
        select: { id: true },
      });
      const order = (fn: jest.Mock): number => fn.mock.invocationCallOrder[0];
      expect(order(txMock.$executeRaw)).toBeLessThan(order(txMock.product.findFirst));
      expect(order(txMock.category.findFirst)).toBeLessThan(order(txMock.product.update));
    });

    it('a tree lock held past the wait → ProductCategoryBusyError, the product stays deleted', async () => {
      txMock.$executeRaw.mockImplementation((sql: TemplateStringsArray) =>
        sql.join('?').includes('pg_advisory') ? Promise.reject(lockTimeout()) : Promise.resolve(1),
      );

      await expect(repository.restore('product-1', 'clear-case', null)).rejects.toBeInstanceOf(
        ProductCategoryBusyError,
      );
      expect(txMock.product.update).not.toHaveBeenCalled();
    });

    it('refuses with ProductCategoryGoneError and writes nothing when the category is deleted', async () => {
      txMock.category.findFirst.mockResolvedValue(null);

      await expect(repository.restore('product-1', 'clear-case', 'SKU-1')).rejects.toBeInstanceOf(
        ProductCategoryGoneError,
      );
      expect(txMock.product.update).not.toHaveBeenCalled();
    });

    it('leaves a missing tombstone to the guarded update (P2025 → 404, as before)', async () => {
      txMock.product.findFirst.mockResolvedValue(null);

      await repository.restore('product-1', 'clear-case', null);

      expect(txMock.category.findFirst).not.toHaveBeenCalled();
      expect(txMock.product.update).toHaveBeenCalledTimes(1);
    });

    it('records no redirect when the product comes back on its native slug', async () => {
      await repository.restore('product-1', 'clear-case', null, 'clear-case');
      await repository.restore('product-1', 'clear-case', null);

      expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
      expect(slugRedirectRepositoryMock.recordRestoreRename).not.toHaveBeenCalled();
    });

    // TASK-1828: restored on a NEW slug, the old links follow — in the same transaction.
    describe('on a new slug (TASK-1828)', () => {
      const deletedAt = new Date('2026-09-01T10:00:00.000Z');

      beforeEach(() => {
        txMock.product.findFirst.mockImplementation(({ where }: { where: { id?: string } }) =>
          Promise.resolve(where.id ? { categoryId: 'cat-1', deletedAt } : null),
        );
      });

      it('re-homes the native address after the write, as of the deletion time', async () => {
        await repository.restore('product-1', 'clear-case-2', null, 'clear-case');

        expect(slugRedirectRepositoryMock.recordRestoreRename).toHaveBeenCalledWith(
          txMock,
          SlugRedirectEntity.PRODUCT,
          'clear-case',
          'clear-case-2',
          { deletedAt, redirectFrom: true },
        );
        expect(txMock.product.findFirst).toHaveBeenCalledWith({
          where: { slug: 'clear-case', deletedAt: null },
          select: { id: true },
        });
        const order = (fn: jest.Mock): number => fn.mock.invocationCallOrder[0];
        expect(order(txMock.product.update)).toBeLessThan(
          order(slugRedirectRepositoryMock.recordRestoreRename),
        );
        // Not the plain rename: that would steal rows a later holder of the address wrote.
        expect(slugRedirectRepositoryMock.recordRename).not.toHaveBeenCalled();
      });

      it('does not redirect a native address another live product now holds', async () => {
        txMock.product.findFirst.mockImplementation(({ where }: { where: { id?: string } }) =>
          Promise.resolve(where.id ? { categoryId: 'cat-1', deletedAt } : { id: 'holder' }),
        );

        await repository.restore('product-1', 'clear-case-2', null, 'clear-case');

        expect(slugRedirectRepositoryMock.recordRestoreRename).toHaveBeenCalledWith(
          txMock,
          SlugRedirectEntity.PRODUCT,
          'clear-case',
          'clear-case-2',
          { deletedAt, redirectFrom: false },
        );
      });

      it('writes no redirect when the restore is refused for a deleted category', async () => {
        txMock.category.findFirst.mockResolvedValue(null);

        await expect(
          repository.restore('product-1', 'clear-case-2', null, 'clear-case'),
        ).rejects.toBeInstanceOf(ProductCategoryGoneError);
        expect(slugRedirectRepositoryMock.recordRestoreRename).not.toHaveBeenCalled();
      });
    });

    it.each([
      ['meta.target column list', { target: ['slug'] }, { slug: true, sku: false }],
      ['meta.target constraint name', { target: 'products_sku_key' }, { slug: false, sku: true }],
      [
        'driver-adapter constraint fields',
        { driverAdapterError: { cause: { constraint: { fields: ['slug', 'sku'] } } } },
        { slug: true, sku: true },
      ],
      ['unidentifiable metadata', { modelName: 'Product' }, null],
    ])('maps a P2002 named by %s onto ProductRestoreConflictError', async (_label, meta, clash) => {
      txMock.product.update.mockRejectedValue(uniqueViolation(meta));

      const error = await repository.restore('product-1', 'clear-case', 'SKU-1').catch((e) => e);

      expect(error).toBeInstanceOf(ProductRestoreConflictError);
      expect((error as ProductRestoreConflictError).clash).toEqual(clash);
    });

    it('re-throws any other error untouched', async () => {
      const notFound = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      });
      txMock.product.update.mockRejectedValue(notFound);

      await expect(repository.restore('product-1', 'clear-case', null)).rejects.toBe(notFound);
    });
  });

  // ─── Reserved-qty derivation (TASK-254) ─────────────────────────────────────
  // Reserved = Σ OrderItem.quantity across orders in PRE_SHIPMENT_STATUSES
  // (PENDING/CONFIRMED/PROCESSING), non-deleted. Critical inventory module — TDD.

  describe('getReservedQtyByProductId', () => {
    it('short-circuits an empty id list without touching Prisma', async () => {
      const result = await repository.getReservedQtyByProductId([]);

      expect(result).toEqual(new Map());
      expect(prismaMock.orderItem.groupBy).not.toHaveBeenCalled();
    });

    it('groups by product over PRE_SHIPMENT statuses and non-deleted orders only', async () => {
      prismaMock.orderItem.groupBy.mockResolvedValue([]);

      await repository.getReservedQtyByProductId(['a', 'b']);

      const args = prismaMock.orderItem.groupBy.mock.calls[0][0];
      expect(args.by).toEqual(['productId']);
      expect(args._sum).toEqual({ quantity: true });
      expect(args.where.productId).toEqual({ in: ['a', 'b'] });
      // SHIPPED/DELIVERED/CANCELLED/REFUNDED are excluded (discovery §5).
      expect(args.where.order.status).toEqual({
        in: [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
      });
      expect(args.where.order.status.in).not.toContain(OrderStatus.SHIPPED);
      // Soft-deleted orders are excluded (discovery §5).
      expect(args.where.order.deletedAt).toBeNull();
    });

    it('has no restockedAt key in the where clause (revive edge case, discovery §5)', async () => {
      prismaMock.orderItem.groupBy.mockResolvedValue([]);

      await repository.getReservedQtyByProductId(['a']);

      const args = prismaMock.orderItem.groupBy.mock.calls[0][0];
      // A revived order is indistinguishable from any other live pre-shipment
      // order — there is nothing revive-specific to filter on.
      expect(args.where.order).not.toHaveProperty('restockedAt');
      expect(args.where).not.toHaveProperty('restockedAt');
    });

    it('maps summed quantities, defaulting a null _sum to 0 and omitting absent ids', async () => {
      prismaMock.orderItem.groupBy.mockResolvedValue([
        { productId: 'a', _sum: { quantity: 3 } },
        { productId: 'b', _sum: { quantity: null } },
      ]);

      const result = await repository.getReservedQtyByProductId(['a', 'b', 'c']);

      expect(result.get('a')).toBe(3);
      expect(result.get('b')).toBe(0); // defensive `?? 0`
      expect(result.has('c')).toBe(false); // absent from rows → absent from map
    });
  });

  // ─── search-index sources + card hydration exclude withdrawn categories ─────
  //
  // The whole category de-indexing story hangs on `findOneForIndex` returning null:
  // `SearchService.indexProduct` reads that null as "not indexable" and DELETES the
  // document. If the category predicate ever falls out of this `where`, deactivating
  // a category silently leaves its products searchable — with no other symptom.

  describe('search-index reads (TASK-297)', () => {
    it('findOneForIndex refuses a product whose category is deactivated', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      const result = await repository.findOneForIndex('product-1');

      expect(result).toBeNull();
      const findFirstArgs = prismaMock.product.findFirst.mock.calls[0][0];
      expect(findFirstArgs.where).toEqual({ id: 'product-1', ...PUBLIC_PRODUCT_WHERE });
    });

    it('findManyForIndex rebuilds only the on-sale catalogue', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);

      await repository.findManyForIndex(0, 100);

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(PUBLIC_PRODUCT_WHERE);
    });

    it.each([
      ['findOneForIndex', 'findFirst'],
      ['findManyForIndex', 'findMany'],
    ] as const)(
      '%s carries the article number and keywords into the index source (TASK-522, TASK-558)',
      async (method, prismaCall) => {
        const row = {
          id: 'product-1',
          name: 'Чохол Spigen',
          description: null,
          price: { toString: () => '10' },
          compareAtPrice: null,
          slug: 'chokhol-spigen',
          sku: 'SPG-IP15-CL',
          keywords: ['ударостійкий'],
          categoryId: 'cat-1',
          brandId: null,
          stock: 3,
          isActive: true,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          category: { name: 'Чохли' },
          brand: null,
          images: [],
          deviceCompat: [],
        };
        prismaMock.product[prismaCall].mockResolvedValue(
          (prismaCall === 'findMany' ? [row] : row) as never,
        );

        const result =
          method === 'findOneForIndex'
            ? await repository.findOneForIndex('product-1')
            : (await repository.findManyForIndex(0, 100)).items[0];

        expect(result?.sku).toBe('SPG-IP15-CL');
        // TASK-558: the admin tags ride the same source into the document.
        expect(result?.keywords).toEqual(['ударостійкий']);
      },
    );

    it('findIdsByCategoryIds still returns the ACTIVE products of a deactivated category', async () => {
      // These ids are the re-index work list, not a visibility query: they are
      // exactly the documents that must be pushed through `indexProduct` so they
      // get evicted. Filtering on category.isActive here would strand them.
      prismaMock.product.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);

      const ids = await repository.findIdsByCategoryIds(['cat-off']);

      expect(ids).toEqual(['p1', 'p2']);
      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual({
        categoryId: { in: ['cat-off'] },
        isActive: true,
        deletedAt: null,
      });
    });

    it('findByIdsForCards drops products of a deactivated category', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.review.groupBy.mockResolvedValue([]);
      prismaMock.productImage.findMany.mockResolvedValue([]);

      await repository.findByIdsForCards(['p1']);

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual({ id: { in: ['p1'] }, ...PUBLIC_PRODUCT_WHERE });
    });

    it('findByIdsForCards filters variant siblings through the public predicate too (TASK-782)', async () => {
      prismaMock.product.findMany
        .mockResolvedValueOnce([{ id: 'p1', groupId: 'grp-1' }])
        .mockResolvedValueOnce([]);
      prismaMock.review.groupBy.mockResolvedValue([]);
      prismaMock.productImage.findMany.mockResolvedValue([]);

      await repository.findByIdsForCards(['p1']);

      const siblingArgs = prismaMock.product.findMany.mock.calls[1][0];
      expect(siblingArgs.where).toEqual({ groupId: { in: ['grp-1'] }, ...PUBLIC_PRODUCT_WHERE });
    });

    // TASK-814: the card hydration used to be a character-for-character copy of
    // the listing's private enrichProducts — a field added to one silently never
    // reached search results, «Ви переглядали» or the manual carousels.
    it('findByIdsForCards hydrates through the same enrichProducts pass as the listing (TASK-814)', async () => {
      const rows = [{ id: 'p1', groupId: null }];
      prismaMock.product.findMany.mockResolvedValueOnce(rows);
      const enrichSpy = jest
        .spyOn(
          repository as unknown as { enrichProducts: (p: unknown[]) => Promise<unknown[]> },
          'enrichProducts',
        )
        .mockResolvedValue([{ id: 'p1', hydrated: true }]);

      const result = await repository.findByIdsForCards(['p1']);

      expect(enrichSpy).toHaveBeenCalledWith(rows);
      expect(result).toEqual([{ id: 'p1', hydrated: true }]);
    });
  });

  // ─── SEO meta pass-through (TASK-241) ───────────────────────────────────────

  describe('SEO meta (TASK-241)', () => {
    beforeEach(() => {
      // create() re-checks the category under the tree lock (TASK-1772).
      txMock.category.findFirst.mockResolvedValue({ id: 'cat-1' });
    });

    it('create persists metaTitle/metaDescription when provided', async () => {
      txMock.product.create.mockResolvedValue({ id: 'product-1' });

      await repository.create({
        name: 'Clear Case',
        slug: 'clear-case',
        price: 29.99,
        categoryId: 'cat-1',
        metaTitle: 'Clear Case | Store',
        metaDescription: 'A crystal-clear protective case.',
      });

      const createArgs = txMock.product.create.mock.calls[0][0];
      expect(createArgs.data.metaTitle).toBe('Clear Case | Store');
      expect(createArgs.data.metaDescription).toBe('A crystal-clear protective case.');
    });

    it('create defaults metaTitle/metaDescription to null when omitted', async () => {
      txMock.product.create.mockResolvedValue({ id: 'product-2' });

      await repository.create({
        name: 'Plain Case',
        slug: 'plain-case',
        price: 9.99,
        categoryId: 'cat-1',
      });

      const createArgs = txMock.product.create.mock.calls[0][0];
      expect(createArgs.data.metaTitle).toBeNull();
      expect(createArgs.data.metaDescription).toBeNull();
    });

    // TASK-437 — the same pass-through for the two fields added alongside them.
    it('create persists keywords/ogImage, defaulting to [] and null', async () => {
      txMock.product.create.mockResolvedValue({ id: 'product-5' });

      await repository.create({
        name: 'Tagged Case',
        slug: 'tagged-case',
        price: 19.99,
        categoryId: 'cat-1',
        keywords: ['magsafe'],
        ogImage: 'https://cdn.example.com/og/tagged-case.jpg',
      });
      await repository.create({
        name: 'Untagged Case',
        slug: 'untagged-case',
        price: 19.99,
        categoryId: 'cat-1',
      });

      const tagged = txMock.product.create.mock.calls[0][0];
      expect(tagged.data.keywords).toEqual(['magsafe']);
      expect(tagged.data.ogImage).toBe('https://cdn.example.com/og/tagged-case.jpg');

      const untagged = txMock.product.create.mock.calls[1][0];
      expect(untagged.data.keywords).toEqual([]);
      expect(untagged.data.ogImage).toBeNull();
    });

    it('update forwards keywords/ogImage, an empty list clearing the tags', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-6' });

      await repository.update('product-6', { keywords: [], ogImage: null });

      const updateArgs = prismaMock.product.update.mock.calls[0][0];
      expect(updateArgs.data.keywords).toEqual([]);
      expect(updateArgs.data.ogImage).toBeNull();
    });

    it('update forwards metaTitle/metaDescription through the spread', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-3' });

      await repository.update('product-3', {
        metaTitle: 'Updated Title',
        metaDescription: 'Updated description.',
      });

      const updateArgs = prismaMock.product.update.mock.calls[0][0];
      expect(updateArgs.data.metaTitle).toBe('Updated Title');
      expect(updateArgs.data.metaDescription).toBe('Updated description.');
    });

    it('update forwards an explicit null to clear the override (TASK-245)', async () => {
      prismaMock.product.update.mockResolvedValue({ id: 'product-4' });

      await repository.update('product-4', {
        metaTitle: null,
        metaDescription: null,
      });

      const updateArgs = prismaMock.product.update.mock.calls[0][0];
      // null must survive untouched (not stripped to undefined) so Prisma
      // writes NULL and the SEO override reverts to auto-derived.
      expect(updateArgs.data.metaTitle).toBeNull();
      expect(updateArgs.data.metaDescription).toBeNull();
    });
  });

  // ─── the stars on a product card (TASK-585) ─────────────────────────────────
  //
  // `getRatingsByProductId` is the catalogue's half of the rating aggregate;
  // `ReviewRepository.aggregate` is the PDP's. They answer the same question on
  // two screens the user sees within one click of each other, so they have to
  // move together: if only one starts counting unapproved-text ratings, a card
  // says «4,5 · 8 оцінок» and the reviews tab beneath it says «4,7 · 3», and
  // nothing in either code path looks wrong.
  describe('rating aggregate on the catalogue listing', () => {
    beforeEach(() => {
      prismaMock.productImage.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(1);
    });

    it('counts every VISIBLE rating, whether or not its text was approved', async () => {
      prismaMock.product.findMany.mockResolvedValue([{ id: 'p1', groupId: null, brand: null }]);
      prismaMock.review.groupBy.mockResolvedValue([
        { productId: 'p1', _avg: { rating: 4.5 }, _count: { rating: 8 } },
      ]);

      const result = await repository.findAll({ page: 1, limit: 20 });

      expect(prismaMock.review.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { productId: { in: ['p1'] }, ratingVisible: true } }),
      );
      expect(result.products[0].ratingAverage).toBe(4.5);
      expect(result.products[0].ratingCount).toBe(8);
    });

    it('does not consult the text status — that gate belongs to the comment, not the star', async () => {
      prismaMock.product.findMany.mockResolvedValue([{ id: 'p1', groupId: null, brand: null }]);
      prismaMock.review.groupBy.mockResolvedValue([]);

      await repository.findAll({ page: 1, limit: 20 });

      expect(prismaMock.review.groupBy.mock.calls[0][0].where).not.toHaveProperty('textStatus');
      expect(prismaMock.review.groupBy.mock.calls[0][0].where).not.toHaveProperty('isActive');
    });

    it('still reports no rating rather than zero for a product nobody rated', async () => {
      prismaMock.product.findMany.mockResolvedValue([{ id: 'p1', groupId: null, brand: null }]);
      prismaMock.review.groupBy.mockResolvedValue([]);

      const result = await repository.findAll({ page: 1, limit: 20 });

      expect(result.products[0].ratingAverage).toBeNull();
      expect(result.products[0].ratingCount).toBe(0);
    });
  });
});
