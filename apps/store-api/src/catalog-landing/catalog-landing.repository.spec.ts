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
