import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { ReviewHiddenReason } from '@prisma/client';
import { ProductsReportRepository } from '../src/analytics/reports/products-report.repository';
import { SalesRepository } from '../src/analytics/reports/sales.repository';
import { DashboardRepository } from '../src/dashboard/dashboard.repository';
import { PrismaService } from '../src/prisma';

/**
 * The rating-abuse signal on a REAL Postgres (TASK-602).
 *
 * The unit spec pins the ARGUMENTS of the two `groupBy … having` calls; this one
 * pins the RESULT of `getNeedsAction()` against rows in a table — which is what
 * TASK-238 showed a mock cannot stand in for: a `having` on the wrong side of a
 * boundary, a null that groups as a value, a window measured from the wrong end,
 * all read correctly as arguments and all count wrong.
 *
 * Boundaries, each on both sides:
 *  - burst: 10 ratings on one product in the last hour is fine, 11 is flagged;
 *  - run: 2 one-star ratings from one address in a day is fine, 3 is flagged;
 *  - a row just outside either window does not count;
 *  - `createdIp = NULL` never groups as an address, however many there are;
 *  - withdrawn rows (`hiddenAt` set) never count;
 *  - one abuser on one product is ONE situation, not a product and an address
 *    (TASK-601).
 *
 * `getNeedsAction` aggregates the whole `reviews` table, so every test starts
 * from an empty one — the same approach as `dashboard.repository.int-spec.ts`,
 * run serially by `test:int`.
 */
describe('Rating-abuse signal (integration, TASK-602)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repo: DashboardRepository;

  const suffix = randomUUID().slice(0, 8);
  let categoryId: string;
  const productIds: string[] = [];
  const userIds: string[] = [];

  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000);

  /**
   * Write `count` reviews on one product, each by a different author (the
   * `(userId, productId)` pair is unique).
   */
  async function reviews(
    count: number,
    productIndex: number,
    opts: {
      rating?: number;
      createdIp?: string | null;
      createdAt?: Date;
      hidden?: boolean;
      authorOffset?: number;
    } = {},
  ) {
    const offset = opts.authorOffset ?? 0;
    for (let i = 0; i < count; i++) {
      await prisma.review.create({
        data: {
          userId: userIds[offset + i],
          productId: productIds[productIndex],
          rating: opts.rating ?? 5,
          createdIp: opts.createdIp === undefined ? '198.51.100.1' : opts.createdIp,
          createdAt: opts.createdAt ?? minutesAgo(5),
          ...(opts.hidden
            ? { hiddenAt: new Date(), hiddenReason: ReviewHiddenReason.MODERATOR }
            : {}),
        },
      });
    }
  }

  const signal = async () => {
    const { ratingAbuse, ratingAbuseSignals } = await repo.getNeedsAction();
    return { ratingAbuse, ...ratingAbuseSignals };
  };

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(url)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${url}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      // The dashboard reads the reports' queries (TASK-688/694).
      providers: [PrismaService, DashboardRepository, ProductsReportRepository, SalesRepository],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    repo = moduleRef.get(DashboardRepository);

    const category = await prisma.category.create({
      data: { name: 'Rating abuse', slug: `rating-abuse-${suffix}` },
    });
    categoryId = category.id;
    for (let i = 0; i < 3; i++) {
      const product = await prisma.product.create({
        data: {
          name: `Rating abuse ${i}`,
          slug: `rating-abuse-${i}-${suffix}`,
          price: '10.00',
          categoryId,
        },
      });
      productIds.push(product.id);
    }
    for (let i = 0; i < 24; i++) {
      const user = await prisma.user.create({
        data: { email: `rating-abuse-${i}-${suffix}@test.local`, passwordHash: 'x' },
      });
      userIds.push(user.id);
    }
  });

  beforeEach(async () => {
    await prisma.review.deleteMany({});
  });

  afterAll(async () => {
    await prisma.review.deleteMany({});
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await app.close();
  });

  describe('burst — more than 10 ratings on one product within an hour', () => {
    it('does not flag exactly 10', async () => {
      await reviews(10, 0);

      await expect(signal()).resolves.toEqual({ ratingAbuse: 0, productIds: [], createdIps: [] });
    });

    it('flags 11', async () => {
      await reviews(11, 0);

      await expect(signal()).resolves.toEqual({
        ratingAbuse: 1,
        productIds: [productIds[0]],
        createdIps: [],
      });
    });

    it('does not count a rating older than the hour (10 inside + 1 at 61 min)', async () => {
      await reviews(10, 0);
      await reviews(1, 0, { createdAt: minutesAgo(61), authorOffset: 10 });

      await expect(signal()).resolves.toMatchObject({ ratingAbuse: 0 });
    });

    it('does not count a withdrawn rating (11 written, 1 hidden)', async () => {
      await reviews(10, 0);
      await reviews(1, 0, { hidden: true, authorOffset: 10 });

      await expect(signal()).resolves.toMatchObject({ ratingAbuse: 0 });
    });
  });

  describe('run — 3 or more 1★ from one address within a day', () => {
    const ip = '203.0.113.9';

    it('does not flag 2', async () => {
      await reviews(2, 1, { rating: 1, createdIp: ip });

      await expect(signal()).resolves.toMatchObject({ ratingAbuse: 0, createdIps: [] });
    });

    it('flags 3', async () => {
      await reviews(3, 1, { rating: 1, createdIp: ip });

      await expect(signal()).resolves.toEqual({
        ratingAbuse: 1,
        productIds: [],
        createdIps: [ip],
      });
    });

    it('does not count a 1★ older than the day (2 inside + 1 at 24h 1min)', async () => {
      await reviews(2, 1, { rating: 1, createdIp: ip });
      await reviews(1, 1, {
        rating: 1,
        createdIp: ip,
        createdAt: minutesAgo(24 * 60 + 1),
        authorOffset: 2,
      });

      await expect(signal()).resolves.toMatchObject({ ratingAbuse: 0 });
    });

    it('does not count 2★ toward a 1★ run', async () => {
      await reviews(2, 1, { rating: 1, createdIp: ip });
      await reviews(1, 1, { rating: 2, createdIp: ip, authorOffset: 2 });

      await expect(signal()).resolves.toMatchObject({ ratingAbuse: 0 });
    });

    it('never groups an unknown address, however many 1★ share it', async () => {
      // Every row written before TASK-588 has `created_ip = NULL`. Grouped as a
      // value, they would be one "address" behind the whole catalogue.
      await reviews(8, 1, { rating: 1, createdIp: null });

      await expect(signal()).resolves.toEqual({ ratingAbuse: 0, productIds: [], createdIps: [] });
    });
  });

  describe('one situation is counted once (TASK-601)', () => {
    const ip = '203.0.113.77';

    it('an address whose whole run sits inside a flagged burst is not a second signal', async () => {
      await reviews(11, 0, { rating: 1, createdIp: ip });

      await expect(signal()).resolves.toEqual({
        ratingAbuse: 1,
        productIds: [productIds[0]],
        createdIps: [],
      });
    });

    it('the same address running 1★ on ANOTHER product is its own signal', async () => {
      await reviews(11, 0, { rating: 1, createdIp: ip });
      await reviews(3, 2, { rating: 1, createdIp: ip, authorOffset: 11 });

      await expect(signal()).resolves.toEqual({
        ratingAbuse: 2,
        productIds: [productIds[0]],
        createdIps: [ip],
      });
    });
  });
});
