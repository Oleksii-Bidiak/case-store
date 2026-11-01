import { PrismaService } from '../prisma';
import { CatalogLandingRepository } from './catalog-landing.repository';

/**
 * TASK-711 — the compat-pair aggregate is ONE `GROUP BY` in Postgres, not a
 * load of every public compat row tallied in JS. What it counts is proven
 * against a real database in `test/compat-landing-pages.int-spec.ts`; this
 * spec pins the shape of the read: a single raw aggregate, no row fetch.
 */
describe('CatalogLandingRepository.countCompatPairs (TASK-711)', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    productDeviceCompat: { findMany: jest.fn() },
  };
  const repository = new CatalogLandingRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('aggregates in one GROUP BY instead of fetching the compat rows', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { categoryId: 'cat-1', deviceModelId: 'model-1', productCount: 3 },
    ]);

    const pairs = await repository.countCompatPairs();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.productDeviceCompat.findMany).not.toHaveBeenCalled();
    expect(pairs).toEqual([{ categoryId: 'cat-1', deviceModelId: 'model-1', productCount: 3 }]);

    const query = prisma.$queryRaw.mock.calls[0][0] as { sql: string };
    expect(query.sql).toMatch(/GROUP BY/i);
    // The shared SQL twin of PUBLIC_PRODUCT_WHERE, plus the public device list's
    // own rule — not a hand-written copy of either.
    expect(query.sql).toContain(
      'p.is_active = true AND p.deleted_at IS NULL AND c.is_active = true',
    );
    expect(query.sql).toContain('dm.is_active = true');
  });

  it('returns plain numbers even if the driver hands back a bigint count', async () => {
    // COUNT(*) is bigint in Postgres; the SQL casts it, and the mapping keeps a
    // bigint from ever reaching the service's `+=` (which would throw on mix).
    prisma.$queryRaw.mockResolvedValue([
      { categoryId: 'cat-1', deviceModelId: 'model-1', productCount: BigInt(2) },
    ]);

    const [pair] = await repository.countCompatPairs();

    expect(pair.productCount).toBe(2);
    expect(typeof pair.productCount).toBe('number');
  });
});

/**
 * TASK-1954 — the model hub reads its groups in ONE windowed query: one round
 * trip however many top-level categories the model spans, capped per group in
 * SQL. What it selects is proven against Postgres in
 * `test/device-hub.int-spec.ts`; this pins the shape.
 */
describe('CatalogLandingRepository.findDeviceHubRows (TASK-1954)', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    product: { findMany: jest.fn() },
  };
  const repository = new CatalogLandingRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it('ranks and caps every group in a single query, never one per category', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { groupCategoryId: 'cases', productId: 'p1', rank: 1, productCount: 12 },
    ]);

    await repository.findDeviceHubRows('model-1', 8);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.product.findMany).not.toHaveBeenCalled();

    const query = prisma.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(query.sql).toMatch(/ROW_NUMBER\(\) OVER \(\s*PARTITION BY r\.root_id/);
    expect(query.sql).toMatch(/COUNT\(\*\) OVER \(PARTITION BY r\.root_id\)/);
    // The catalogue default order: in stock first, newest, id tiebreak.
    expect(query.sql).toMatch(/ORDER BY \(p\.stock > 0\) DESC, p\.created_at DESC, p\.id ASC/);
    // The shared SQL twin of PUBLIC_PRODUCT_WHERE, including the branch flag.
    expect(query.sql).toContain(
      'p.is_active = true AND p.deleted_at IS NULL AND c.is_active = true AND c.deleted_at IS NULL AND c.ancestors_active = true',
    );
    expect(query.values).toEqual(expect.arrayContaining(['model-1', 8]));
  });

  it('maps bigint driver values to plain numbers', async () => {
    prisma.$queryRaw.mockResolvedValue([
      { groupCategoryId: 'cases', productId: 'p1', rank: BigInt(1), productCount: BigInt(3) },
    ]);

    const [row] = await repository.findDeviceHubRows('model-1', 8);

    expect(row).toEqual({ groupCategoryId: 'cases', productId: 'p1', rank: 1, productCount: 3 });
  });
});
