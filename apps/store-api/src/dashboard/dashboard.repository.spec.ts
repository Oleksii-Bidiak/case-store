import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRepository } from './dashboard.repository';
import { PrismaService } from '../prisma';

/**
 * The «Потребує дії» rating-abuse signal (TASK-589).
 *
 * ## What it answers
 *
 * The owner's decision 7: «>10 оцінок на один товар за годину, або серія 1★ з
 * однієї IP». Two questions, two `groupBy`s, one number — how many things are
 * currently worth a look.
 *
 * ## Why it is worth a unit test against a mocked Prisma
 *
 * Because both halves fail SILENTLY and in opposite directions. A `having` that
 * counts the wrong way flags nothing, and the widget simply shows a calm zero
 * for ever — an operator cannot tell "no abuse" from "no query". And a
 * `createdIp` filter that lets NULL group as a value flags everything: every
 * review written before the column existed — the entire seeded catalogue, ~2 200
 * rows — shares the value `null`, so the panel would open on «одна адреса
 * залишила 2 200 відгуків» and stay there.
 *
 * Fake timers because both windows are relative: a real clock would make the
 * assertions about `createdAt` untestable or flaky.
 */
describe('DashboardRepository — the rating-abuse signal (TASK-589)', () => {
  let repo: DashboardRepository;

  const NOW = new Date('2026-09-14T12:00:00.000Z');
  const reviewGroupBy = jest.fn();

  const prismaMock = {
    order: { count: jest.fn().mockResolvedValue(0) },
    review: { count: jest.fn().mockResolvedValue(0), groupBy: reviewGroupBy },
    mailOutbox: { count: jest.fn().mockResolvedValue(0) },
  };

  /** The args of the groupBy issued for a given `by` field. */
  const groupByFor = (field: string) =>
    reviewGroupBy.mock.calls.map((call) => call[0]).find((args) => args.by[0] === field);

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    reviewGroupBy.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(DashboardRepository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts a product that collected more than ten ratings in the last hour', async () => {
    await repo.getNeedsAction();

    const args = groupByFor('productId');
    expect(args.where).toEqual({ createdAt: { gte: new Date('2026-09-14T11:00:00.000Z') } });
    // MORE than ten, not ten: the threshold is the number that is still fine.
    expect(args.having).toEqual({ productId: { _count: { gt: 10 } } });
  });

  it('counts an address that left three or more one-star ratings in a day', async () => {
    await repo.getNeedsAction();

    const args = groupByFor('createdIp');
    expect(args.where).toMatchObject({
      rating: 1,
      createdAt: { gte: new Date('2026-09-13T12:00:00.000Z') },
    });
    expect(args.having).toEqual({ createdIp: { _count: { gte: 3 } } });
  });

  it('never lets an unknown address group as a value', async () => {
    // `createdIp` is null on every row written before TASK-588. Without this
    // filter they all share one group and the signal opens at ~2 200 — one
    // "abuser" who is in fact the whole seeded catalogue.
    await repo.getNeedsAction();

    expect(groupByFor('createdIp').where.createdIp).toEqual({ not: null });
  });

  it('reports how many things are flagged — products and addresses together', async () => {
    reviewGroupBy.mockImplementation((args: { by: string[] }) =>
      Promise.resolve(
        args.by[0] === 'productId'
          ? [{ productId: 'p-1' }, { productId: 'p-2' }]
          : [{ createdIp: '203.0.113.7' }],
      ),
    );

    const needsAction = await repo.getNeedsAction();

    expect(needsAction.ratingAbuse).toBe(3);
  });

  it('is zero — not absent — when nothing is flagged', async () => {
    // The widget renders the number; `undefined` would read as «—» and look like
    // a broken tile rather than a quiet shop.
    const needsAction = await repo.getNeedsAction();

    expect(needsAction.ratingAbuse).toBe(0);
  });
});
