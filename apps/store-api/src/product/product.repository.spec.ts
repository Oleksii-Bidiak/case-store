import { OrderStatus, SlugRedirectEntity } from '@prisma/client';
import { ProductRepository } from './product.repository';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from '../slug-redirect';

// ─── Mock PrismaService ──────────────────────────────────────────────────────

const txMock = {
  product: {
    update: jest.fn(),
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

const slugRedirectRepositoryMock = {
  recordRename: jest.fn(),
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

  // ─── findBySlugWithRelations — public detail read (TASK-145) ─────────────────
  // The public PDP endpoint must hide deactivated products: the default query
  // filters `isActive: true`. The `activeOnly: false` override (reserved for the
  // future staff preview, TASK-155) drops that filter.

  describe('findBySlugWithRelations', () => {
    it('should require BOTH the product and its category to be active by default (TASK-297)', async () => {
      prismaMock.product.findFirst.mockResolvedValue(null);

      await repository.findBySlugWithRelations('clear-case');

      const findFirstArgs = prismaMock.product.findFirst.mock.calls[0][0];
      expect(findFirstArgs.where).toEqual({
        slug: 'clear-case',
        isActive: true,
        category: { isActive: true },
        deletedAt: null,
      });
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
        expect.objectContaining({ isActive: true, category: { isActive: true } }),
      );
      // The count must carry the SAME predicate, or pagination `total` would
      // advertise pages of products the list itself refuses to return.
      const countArgs = prismaMock.product.count.mock.calls[0][0];
      expect(countArgs.where).toEqual(expect.objectContaining({ category: { isActive: true } }));
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
          category: { isActive: true },
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

      // Sibling query is scoped to the page's groups, active and non-deleted.
      const variantQuery = prismaMock.product.findMany.mock.calls[1][0];
      expect(variantQuery.where).toEqual({
        groupId: { in: ['grp-1'] },
        isActive: true,
        deletedAt: null,
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
      expect(findFirstArgs.where).toEqual({
        id: 'product-1',
        isActive: true,
        deletedAt: null,
        category: { isActive: true },
      });
    });

    it('findManyForIndex rebuilds only the on-sale catalogue', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);

      await repository.findManyForIndex(0, 100);

      const findManyArgs = prismaMock.product.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual({
        isActive: true,
        deletedAt: null,
        category: { isActive: true },
      });
    });

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
      expect(findManyArgs.where).toEqual({
        id: { in: ['p1'] },
        isActive: true,
        deletedAt: null,
        category: { isActive: true },
      });
    });
  });

  // ─── SEO meta pass-through (TASK-241) ───────────────────────────────────────

  describe('SEO meta (TASK-241)', () => {
    it('create persists metaTitle/metaDescription when provided', async () => {
      prismaMock.product.create.mockResolvedValue({ id: 'product-1' });

      await repository.create({
        name: 'Clear Case',
        slug: 'clear-case',
        price: 29.99,
        categoryId: 'cat-1',
        metaTitle: 'Clear Case | Store',
        metaDescription: 'A crystal-clear protective case.',
      });

      const createArgs = prismaMock.product.create.mock.calls[0][0];
      expect(createArgs.data.metaTitle).toBe('Clear Case | Store');
      expect(createArgs.data.metaDescription).toBe('A crystal-clear protective case.');
    });

    it('create defaults metaTitle/metaDescription to null when omitted', async () => {
      prismaMock.product.create.mockResolvedValue({ id: 'product-2' });

      await repository.create({
        name: 'Plain Case',
        slug: 'plain-case',
        price: 9.99,
        categoryId: 'cat-1',
      });

      const createArgs = prismaMock.product.create.mock.calls[0][0];
      expect(createArgs.data.metaTitle).toBeNull();
      expect(createArgs.data.metaDescription).toBeNull();
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
});
