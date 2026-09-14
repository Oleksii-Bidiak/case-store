import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
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
    expect(args.where).toEqual({
      createdAt: { gte: new Date('2026-09-14T11:00:00.000Z') },
      // TASK-598: hiding the author is the action this signal asks for, and it
      // leaves the rows in place. Counting them anyway gave the operator a number
      // their own click could not move.
      hiddenAt: null,
    });
    // MORE than ten, not ten: the threshold is the number that is still fine.
    expect(args.having).toEqual({ productId: { _count: { gt: 10 } } });
  });

  it('counts the moderation badge over the queue’s own rows, not over every PENDING row', async () => {
    // TASK-598. Every submission is written `textStatus: PENDING`, star-only ones
    // included, so counting that alone made the badge read 50 while the queue it
    // labelled held nothing anyone could act on: approving an empty comment
    // publishes nothing, and the only way to clear it was to "reject" a review
    // nobody wrote. The badge and the list now ask the same question.
    await repo.getNeedsAction();

    expect(prismaMock.review.count).toHaveBeenCalledWith({
      where: {
        textStatus: 'PENDING',
        hiddenAt: null,
        comment: { not: null },
        NOT: { comment: '' },
      },
    });
  });

  it('stops counting a burst once the moderator has withdrawn its author', async () => {
    // TASK-598 — the property that makes the tile actionable. Both queries must
    // carry it: an operator who hides the author and watches the number sit there
    // for another day learns the tile is noise.
    await repo.getNeedsAction();

    expect(groupByFor('productId').where).toMatchObject({ hiddenAt: null });
    expect(groupByFor('createdIp').where).toMatchObject({ hiddenAt: null });
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

/**
 * The «Недоступні позиції» tile (TASK-470).
 *
 * The aggregate of the fourth mark of owner decision B-1 §3, and the one signal
 * in the whole system that NOTHING else reacts to: the owner decided the buyer
 * is told by a person, not by an automatic mail, so this tile is the entire
 * notification. If its predicate is wrong the shop finds out from the customer.
 *
 * Two ways it can be wrong, and they fail in opposite directions. Forget the
 * `status` exclusion and every cancelled order the shop ever had lands in the
 * count, which then only ever grows — an operator learns within a week that the
 * tile means nothing. Ask about the wrong columns and it sits at a calm zero
 * while orders quietly cannot be shipped.
 */
describe('DashboardRepository — the «Недоступні позиції» tile (TASK-470)', () => {
  let repo: DashboardRepository;

  const orderCount = jest.fn().mockResolvedValue(0);

  const prismaMock = {
    order: { count: orderCount },
    review: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    mailOutbox: { count: jest.fn().mockResolvedValue(0) },
  };

  /** The `where` of the count issued for the unavailable-items tile. */
  const unavailableWhere = () =>
    orderCount.mock.calls
      .map((call) => call[0].where)
      .find((where: Record<string, unknown>) => Array.isArray(where.OR));

  beforeEach(async () => {
    jest.clearAllMocks();
    orderCount.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(DashboardRepository);
  });

  it('counts orders whose line product is deleted, unpublished or oversold', async () => {
    await repo.getNeedsAction();

    expect(unavailableWhere().OR).toContainEqual({
      items: {
        some: {
          product: {
            OR: [{ deletedAt: { not: null } }, { isActive: false }, { stock: { lt: 0 } }],
          },
        },
      },
    });
  });

  it('also counts an order whose reservation the TTL worker released', async () => {
    // Stock is taken at creation, so "someone else bought it" cannot happen on
    // its own — it can only happen after the hold was released.
    await repo.getNeedsAction();

    expect(unavailableWhere().OR).toContainEqual({ restockedAt: { not: null } });
  });

  it('excludes orders that have already ended', async () => {
    await repo.getNeedsAction();

    expect(unavailableWhere().status).toEqual({
      notIn: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
    });
  });

  it('excludes soft-deleted orders', async () => {
    await repo.getNeedsAction();

    expect(unavailableWhere().deletedAt).toBeNull();
  });

  it('reports the count as a number, zero included', async () => {
    const needsAction = await repo.getNeedsAction();

    expect(needsAction.unavailableItems).toBe(0);
  });
});
