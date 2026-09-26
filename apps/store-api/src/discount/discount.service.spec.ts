import { HttpException } from '@nestjs/common';
import { Prisma, Discount, DiscountType } from '@prisma/client';
import { DiscountService } from './discount.service';
import { DiscountRepository } from './discount.repository';
import { DiscountErrorCode } from './discount.errors';
import { PrismaService } from '../prisma';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const repositoryMock = {
  findByCode: jest.fn(),
  findById: jest.fn(),
  findMany: jest.fn(),
  findActiveWindowCandidates: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDeactivate: jest.fn(),
  countUserRedemptions: jest.fn(),
  tryIncrementRedeemed: jest.fn(),
  createRedemption: jest.fn(),
};

const cartServiceMock = {
  getCart: jest.fn(),
};

// ─── Test data ──────────────────────────────────────────────────────────────

/** Build a Discount Prisma model with sensible, fully-eligible defaults. */
function makeDiscount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'd1',
    code: 'SUMMER10',
    type: DiscountType.PERCENT,
    value: new Prisma.Decimal('10'),
    minSpend: null,
    maxRedemptions: null,
    redeemedCount: 0,
    perUserLimit: null,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    showOnPromoPage: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

/** Assert a thunk rejects with a discount HttpException carrying `code` + `status`. */
async function expectDiscountError(
  thunk: () => Promise<unknown>,
  code: DiscountErrorCode,
  status: number,
): Promise<void> {
  let thrown: unknown;
  try {
    await thunk();
  } catch (err) {
    thrown = err;
  }
  if (thrown === undefined) {
    throw new Error(`Expected a ${code} error to be thrown, but none was`);
  }
  expect((thrown as HttpException).getStatus()).toBe(status);
  expect((thrown as HttpException).getResponse()).toMatchObject({ error: code });
}

describe('DiscountService.computeDiscount', () => {
  let service: DiscountService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscountService(repositoryMock as never, cartServiceMock as never);
  });

  // ─── Amount math ─────────────────────────────────────────────────────────

  it('computes a percentage discount with cents arithmetic', async () => {
    repositoryMock.findByCode.mockResolvedValue(makeDiscount({ value: new Prisma.Decimal('10') }));

    const result = await service.computeDiscount('SUMMER10', '200.00', 'u1');

    expect(result.amount).toBe('20.00');
    expect(result.discount.code).toBe('SUMMER10');
  });

  it('computes a fixed discount as a UAH amount', async () => {
    repositoryMock.findByCode.mockResolvedValue(
      makeDiscount({ type: DiscountType.FIXED, value: new Prisma.Decimal('50') }),
    );

    const result = await service.computeDiscount('SUMMER10', '200.00', 'u1');

    expect(result.amount).toBe('50.00');
  });

  it('rounds percentage discounts to the nearest cent', async () => {
    // 99.99 * 10% = 9.999 → rounds to 10.00
    repositoryMock.findByCode.mockResolvedValue(makeDiscount({ value: new Prisma.Decimal('10') }));

    const result = await service.computeDiscount('SUMMER10', '99.99', 'u1');

    expect(result.amount).toBe('10.00');
  });

  it('clamps a fixed discount so it never exceeds the subtotal', async () => {
    repositoryMock.findByCode.mockResolvedValue(
      makeDiscount({ type: DiscountType.FIXED, value: new Prisma.Decimal('500') }),
    );

    const result = await service.computeDiscount('SUMMER10', '200.00', 'u1');

    expect(result.amount).toBe('200.00');
  });

  it('normalizes a lowercase code to uppercase before lookup', async () => {
    repositoryMock.findByCode.mockResolvedValue(makeDiscount());

    await service.computeDiscount('  summer10 ', '200.00', 'u1');

    expect(repositoryMock.findByCode).toHaveBeenCalledWith('SUMMER10');
  });

  // ─── Eligibility gates ────────────────────────────────────────────────────

  it('rejects an unknown code with NOT_FOUND (400)', async () => {
    repositoryMock.findByCode.mockResolvedValue(null);

    await expectDiscountError(
      () => service.computeDiscount('NOPE', '200.00', 'u1'),
      DiscountErrorCode.NOT_FOUND,
      400,
    );
  });

  it('rejects a deactivated code with INACTIVE (400)', async () => {
    repositoryMock.findByCode.mockResolvedValue(makeDiscount({ isActive: false }));

    await expectDiscountError(
      () => service.computeDiscount('SUMMER10', '200.00', 'u1'),
      DiscountErrorCode.INACTIVE,
      400,
    );
  });

  it('rejects a code before its start window with NOT_STARTED (400)', async () => {
    repositoryMock.findByCode.mockResolvedValue(
      makeDiscount({ startsAt: new Date(Date.now() + 86_400_000) }),
    );

    await expectDiscountError(
      () => service.computeDiscount('SUMMER10', '200.00', 'u1'),
      DiscountErrorCode.NOT_STARTED,
      400,
    );
  });

  it('rejects an expired code with EXPIRED (400)', async () => {
    repositoryMock.findByCode.mockResolvedValue(
      makeDiscount({ expiresAt: new Date(Date.now() - 86_400_000) }),
    );

    await expectDiscountError(
      () => service.computeDiscount('SUMMER10', '200.00', 'u1'),
      DiscountErrorCode.EXPIRED,
      400,
    );
  });

  it('rejects when the subtotal is below minSpend with MIN_SPEND_NOT_MET (400)', async () => {
    repositoryMock.findByCode.mockResolvedValue(
      makeDiscount({ minSpend: new Prisma.Decimal('500') }),
    );

    await expectDiscountError(
      () => service.computeDiscount('SUMMER10', '200.00', 'u1'),
      DiscountErrorCode.MIN_SPEND_NOT_MET,
      400,
    );
  });

  it('allows a subtotal exactly at minSpend', async () => {
    repositoryMock.findByCode.mockResolvedValue(
      makeDiscount({ minSpend: new Prisma.Decimal('200') }),
    );

    const result = await service.computeDiscount('SUMMER10', '200.00', 'u1');

    expect(result.amount).toBe('20.00');
  });

  it('rejects when the global redemption cap is reached with MAX_REDEMPTIONS_REACHED (409)', async () => {
    repositoryMock.findByCode.mockResolvedValue(
      makeDiscount({ maxRedemptions: 5, redeemedCount: 5 }),
    );

    await expectDiscountError(
      () => service.computeDiscount('SUMMER10', '200.00', 'u1'),
      DiscountErrorCode.MAX_REDEMPTIONS_REACHED,
      409,
    );
  });

  it('rejects when the per-user cap is reached with USER_LIMIT_REACHED (409)', async () => {
    repositoryMock.findByCode.mockResolvedValue(makeDiscount({ perUserLimit: 1 }));
    repositoryMock.countUserRedemptions.mockResolvedValue(1);

    await expectDiscountError(
      () => service.computeDiscount('SUMMER10', '200.00', 'u1'),
      DiscountErrorCode.USER_LIMIT_REACHED,
      409,
    );
  });

  it('allows a user still under the per-user cap', async () => {
    repositoryMock.findByCode.mockResolvedValue(makeDiscount({ perUserLimit: 2 }));
    repositoryMock.countUserRedemptions.mockResolvedValue(1);

    const result = await service.computeDiscount('SUMMER10', '200.00', 'u1');

    expect(result.amount).toBe('20.00');
    expect(repositoryMock.countUserRedemptions).toHaveBeenCalledWith('d1', 'u1');
  });

  it('does not query per-user redemptions when there is no per-user limit', async () => {
    repositoryMock.findByCode.mockResolvedValue(makeDiscount({ perUserLimit: null }));

    await service.computeDiscount('SUMMER10', '200.00', 'u1');

    expect(repositoryMock.countUserRedemptions).not.toHaveBeenCalled();
  });
});

describe('DiscountService.findActivePublic (TASK-179)', () => {
  let service: DiscountService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscountService(repositoryMock as never, cartServiceMock as never);
  });

  it('includes a null-cap discount and maps to the public-safe shape only', async () => {
    repositoryMock.findActiveWindowCandidates.mockResolvedValue([
      makeDiscount({
        code: 'SUMMER10',
        minSpend: new Prisma.Decimal('500'),
        maxRedemptions: null,
      }),
    ]);

    const result = await service.findActivePublic();

    expect(result.data).toHaveLength(1);
    const entity = result.data[0];
    expect(entity).toEqual({
      code: 'SUMMER10',
      type: DiscountType.PERCENT,
      value: '10',
      minSpend: '500',
      expiresAt: null,
    });
    // Public-safe: none of the sensitive/internal fields leak through.
    for (const hidden of [
      'id',
      'maxRedemptions',
      'redeemedCount',
      'perUserLimit',
      'startsAt',
      'isActive',
      'createdAt',
      'updatedAt',
    ]) {
      expect(entity).not.toHaveProperty(hidden);
    }
  });

  it('includes an unbounded/no-window discount', async () => {
    repositoryMock.findActiveWindowCandidates.mockResolvedValue([makeDiscount({ code: 'ALWAYS' })]);

    const result = await service.findActivePublic();

    expect(result.data.map((d) => d.code)).toEqual(['ALWAYS']);
  });

  it('excludes a discount whose global cap is exhausted', async () => {
    repositoryMock.findActiveWindowCandidates.mockResolvedValue([
      makeDiscount({ code: 'LIVE', maxRedemptions: 10, redeemedCount: 3 }),
      makeDiscount({ code: 'EXHAUSTED', maxRedemptions: 5, redeemedCount: 5 }),
    ]);

    const result = await service.findActivePublic();

    expect(result.data.map((d) => d.code)).toEqual(['LIVE']);
  });

  it('queries the repository with the current time', async () => {
    repositoryMock.findActiveWindowCandidates.mockResolvedValue([]);

    await service.findActivePublic();

    expect(repositoryMock.findActiveWindowCandidates).toHaveBeenCalledWith(expect.any(Date));
  });
});

describe('DiscountService.redeem', () => {
  let service: DiscountService;
  const tx = {} as never; // opaque: the service must reach the DB via the repository

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscountService(repositoryMock as never, cartServiceMock as never);
    repositoryMock.tryIncrementRedeemed.mockResolvedValue(1); // slot claimed
    repositoryMock.countUserRedemptions.mockResolvedValue(0);
  });

  it('claims a slot atomically and inserts a redemption inside the tx', async () => {
    repositoryMock.findById.mockResolvedValue(makeDiscount());

    await service.redeem('d1', 'u1', 'o1', tx);

    expect(repositoryMock.findById).toHaveBeenCalledWith('d1', tx);
    expect(repositoryMock.tryIncrementRedeemed).toHaveBeenCalledWith('d1', tx);
    expect(repositoryMock.createRedemption).toHaveBeenCalledWith(
      { discountId: 'd1', userId: 'u1', orderId: 'o1' },
      tx,
    );
  });

  it('throws MAX_REDEMPTIONS_REACHED when the conditional claim updates no row', async () => {
    // The live row still LOOKS redeemable to a plain read (4 < 5) — a racing
    // transaction exhausted the cap in between. Only the conditional UPDATE can
    // see that, and it reports 0 rows changed.
    repositoryMock.findById.mockResolvedValue(
      makeDiscount({ maxRedemptions: 5, redeemedCount: 4 }),
    );
    repositoryMock.tryIncrementRedeemed.mockResolvedValue(0);

    await expectDiscountError(
      () => service.redeem('d1', 'u1', 'o1', tx),
      DiscountErrorCode.MAX_REDEMPTIONS_REACHED,
      409,
    );
    expect(repositoryMock.createRedemption).not.toHaveBeenCalled();
  });

  it('claims the global slot BEFORE counting per-user redemptions (row lock ordering)', async () => {
    // The conditional UPDATE row-locks the discount for the rest of the
    // transaction, which is what serializes the per-user count below. If the
    // count ran first, two concurrent redemptions could both read 0.
    repositoryMock.findById.mockResolvedValue(makeDiscount({ perUserLimit: 2 }));

    await service.redeem('d1', 'u1', 'o1', tx);

    const claimOrder = repositoryMock.tryIncrementRedeemed.mock.invocationCallOrder[0];
    const countOrder = repositoryMock.countUserRedemptions.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(countOrder);
  });

  it('re-checks the per-user cap against the live count and throws if exhausted', async () => {
    repositoryMock.findById.mockResolvedValue(makeDiscount({ perUserLimit: 1 }));
    repositoryMock.countUserRedemptions.mockResolvedValue(1);

    await expectDiscountError(
      () => service.redeem('d1', 'u1', 'o1', tx),
      DiscountErrorCode.USER_LIMIT_REACHED,
      409,
    );
    expect(repositoryMock.countUserRedemptions).toHaveBeenCalledWith('d1', 'u1', tx);
    expect(repositoryMock.createRedemption).not.toHaveBeenCalled();
  });

  it('does not count per-user redemptions when there is no per-user limit', async () => {
    repositoryMock.findById.mockResolvedValue(makeDiscount({ perUserLimit: null }));

    await service.redeem('d1', 'u1', 'o1', tx);

    expect(repositoryMock.countUserRedemptions).not.toHaveBeenCalled();
  });

  it('throws when the discount was deactivated between preview and redeem', async () => {
    repositoryMock.findById.mockResolvedValue(makeDiscount({ isActive: false }));

    await expectDiscountError(
      () => service.redeem('d1', 'u1', 'o1', tx),
      DiscountErrorCode.INACTIVE,
      409,
    );
    expect(repositoryMock.tryIncrementRedeemed).not.toHaveBeenCalled();
  });
});

describe('DiscountService.redeem — concurrent redemptions (TOCTOU)', () => {
  /**
   * Fake transaction client modelling the ONE Postgres semantic this race turns
   * on: `UPDATE … WHERE redeemed_count < max_redemptions` evaluates its
   * predicate and applies the increment as a single indivisible step, and
   * reports how many rows it changed. Under a read-then-increment
   * implementation two interleaved redeem() calls both read a redeemable row
   * and both increment — overshooting the cap. Under the conditional update the
   * loser gets `count: 0`.
   */
  function makeFakeTx(row: Discount) {
    const redemptions: { discountId: string; userId: string; orderId: string }[] = [];
    const tx = {
      discount: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === row.id ? { ...row } : null),
        updateMany: ({ where }: { where: { id: string } }) => {
          if (where.id !== row.id) return Promise.resolve({ count: 0 });
          if (row.maxRedemptions !== null && row.redeemedCount >= row.maxRedemptions) {
            return Promise.resolve({ count: 0 });
          }
          row.redeemedCount += 1;
          return Promise.resolve({ count: 1 });
        },
        // Unconditional increment — what a read-then-write implementation would
        // reach for. Kept faithful so this suite fails loudly if the service
        // regresses to it.
        update: () => {
          row.redeemedCount += 1;
          return Promise.resolve({ ...row });
        },
      },
      discountRedemption: {
        count: ({ where }: { where: { discountId: string; userId: string } }) =>
          Promise.resolve(
            redemptions.filter(
              (r) => r.discountId === where.discountId && r.userId === where.userId,
            ).length,
          ),
        create: ({ data }: { data: { discountId: string; userId: string; orderId: string } }) => {
          redemptions.push(data);
          return Promise.resolve(data);
        },
      },
    };
    return { tx, redemptions, row };
  }

  /** Service wired to the REAL repository so the conditional update is exercised. */
  function makeService(): DiscountService {
    const prismaStub = {
      discount: { fields: { maxRedemptions: { name: 'maxRedemptions' } } },
    } as unknown as PrismaService;
    return new DiscountService(new DiscountRepository(prismaStub), cartServiceMock as never);
  }

  it('never lets two concurrent redemptions overshoot the global cap', async () => {
    const service = makeService();
    const { tx, row, redemptions } = makeFakeTx(makeDiscount({ maxRedemptions: 1 }));

    const results = await Promise.allSettled([
      service.redeem('d1', 'u1', 'o1', tx as never),
      service.redeem('d1', 'u2', 'o2', tx as never),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      ((rejected[0] as PromiseRejectedResult).reason as HttpException).getResponse(),
    ).toMatchObject({ error: DiscountErrorCode.MAX_REDEMPTIONS_REACHED });
    expect(row.redeemedCount).toBe(1);
    expect(redemptions).toHaveLength(1);
  });

  it('lets both concurrent redemptions through when the cap is unlimited', async () => {
    const service = makeService();
    const { tx, row, redemptions } = makeFakeTx(makeDiscount({ maxRedemptions: null }));

    const results = await Promise.allSettled([
      service.redeem('d1', 'u1', 'o1', tx as never),
      service.redeem('d1', 'u2', 'o2', tx as never),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(row.redeemedCount).toBe(2);
    expect(redemptions).toHaveLength(2);
  });
});

// ─── TASK-798: update() — "not sent" vs "cleared" ────────────────────────────

describe('DiscountService.update — undefined leaves a field, null clears it (TASK-798)', () => {
  let service: DiscountService;

  const existing = makeDiscount({
    minSpend: new Prisma.Decimal('500'),
    maxRedemptions: 100,
    perUserLimit: 1,
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    expiresAt: new Date('2026-12-31T00:00:00.000Z'),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscountService(repositoryMock as never, cartServiceMock as never);
    repositoryMock.findById.mockResolvedValue(existing);
    repositoryMock.update.mockImplementation((_id: string, input: Partial<Discount>) =>
      Promise.resolve({ ...existing, ...input }),
    );
  });

  const nullableFields = [
    'minSpend',
    'maxRedemptions',
    'perUserLimit',
    'startsAt',
    'expiresAt',
  ] as const;

  it.each(nullableFields)('%s: omitted → not written', async (field) => {
    await service.update('d1', { isActive: true });

    const input = repositoryMock.update.mock.calls[0][1] as Record<string, unknown>;
    expect(input).not.toHaveProperty(field);
  });

  it.each(nullableFields)('%s: null → written as null', async (field) => {
    await service.update('d1', { [field]: null } as never);

    const input = repositoryMock.update.mock.calls[0][1] as Record<string, unknown>;
    expect(input).toHaveProperty(field, null);
  });

  it('clearing startsAt does not validate against the stored start date', async () => {
    // The stored start (2026-10-01) is AFTER the new expiry; the operator is
    // clearing it in the same request, so there is no window to invert.
    await expect(
      service.update('d1', { startsAt: null, expiresAt: '2026-09-01T00:00:00.000Z' } as never),
    ).resolves.toBeDefined();

    expect(repositoryMock.update).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ startsAt: null, expiresAt: new Date('2026-09-01T00:00:00.000Z') }),
    );
  });

  it('clearing expiresAt does not validate against the stored expiry', async () => {
    await expect(
      service.update('d1', { expiresAt: null, startsAt: '2027-02-01T00:00:00.000Z' } as never),
    ).resolves.toBeDefined();
  });

  it('an omitted startsAt still validates the new expiry against the stored start', async () => {
    await expect(service.update('d1', { expiresAt: '2026-09-01T00:00:00.000Z' })).rejects.toThrow(
      'startsAt must be before expiresAt',
    );
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });
});

// ─── TASK-823: update() field by field ────────────────────────────────────────
//
// `update()` is the most intricate write in the module — a partial DTO merged
// over the stored row, validated as the MERGED definition, then written as a
// sparse input — and before TASK-823 it had no coverage beyond the TASK-798
// null/omitted pair above. That is exactly where TASK-797 and TASK-798 landed.

describe('DiscountService.update — field by field (TASK-823)', () => {
  let service: DiscountService;

  /** A stored PERCENT 10 % code with every nullable field populated. */
  const stored = makeDiscount({
    id: 'd1',
    code: 'SUMMER10',
    minSpend: new Prisma.Decimal('500'),
    maxRedemptions: 100,
    perUserLimit: 1,
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    expiresAt: new Date('2026-12-31T00:00:00.000Z'),
    isActive: true,
    showOnPromoPage: true,
  });

  const writtenInput = (): Record<string, unknown> =>
    repositoryMock.update.mock.calls[0][1] as Record<string, unknown>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscountService(repositoryMock as never, cartServiceMock as never);
    repositoryMock.findById.mockResolvedValue(stored);
    repositoryMock.findByCode.mockResolvedValue(null);
    repositoryMock.update.mockImplementation((_id: string, input: Partial<Discount>) =>
      Promise.resolve({ ...stored, ...input }),
    );
  });

  // ─── Existence ──────────────────────────────────────────────────────────

  it('404s for an unknown id without looking up the code or writing', async () => {
    repositoryMock.findById.mockResolvedValue(null);

    await expect(service.update('missing', { code: 'NEW10' })).rejects.toThrow(
      'Discount not found',
    );
    expect(repositoryMock.findByCode).not.toHaveBeenCalled();
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  // ─── Not sent ───────────────────────────────────────────────────────────

  it('an empty body writes nothing — every stored field is kept', async () => {
    await service.update('d1', {});

    expect(repositoryMock.update).toHaveBeenCalledWith('d1', {});
  });

  // ─── Sent with a value ──────────────────────────────────────────────────

  it.each([
    ['code', { code: 'AUTUMN15' }, { code: 'AUTUMN15' }],
    ['type', { type: DiscountType.FIXED }, { type: DiscountType.FIXED }],
    ['value', { value: 25.5 }, { value: new Prisma.Decimal('25.5') }],
    ['minSpend', { minSpend: 300 }, { minSpend: new Prisma.Decimal('300') }],
    ['maxRedemptions', { maxRedemptions: 50 }, { maxRedemptions: 50 }],
    ['perUserLimit', { perUserLimit: 3 }, { perUserLimit: 3 }],
    [
      'startsAt',
      { startsAt: '2026-11-01T00:00:00.000Z' },
      { startsAt: new Date('2026-11-01T00:00:00.000Z') },
    ],
    [
      'expiresAt',
      { expiresAt: '2027-01-31T00:00:00.000Z' },
      { expiresAt: new Date('2027-01-31T00:00:00.000Z') },
    ],
    ['isActive', { isActive: false }, { isActive: false }],
    ['showOnPromoPage', { showOnPromoPage: false }, { showOnPromoPage: false }],
  ])('%s: a value is written — and nothing else is', async (_field, dto, expected) => {
    await service.update('d1', dto);

    expect(repositoryMock.update).toHaveBeenCalledWith('d1', expected);
  });

  it('minSpend: 0 is written as a zero minimum, not cleared to null', async () => {
    await service.update('d1', { minSpend: 0 });

    expect(writtenInput().minSpend).toEqual(new Prisma.Decimal(0));
  });

  it('returns the updated row as an entity with money as strings', async () => {
    const entity = await service.update('d1', { value: 15, minSpend: 250 });

    expect(entity).toMatchObject({ id: 'd1', value: '15', minSpend: '250' });
  });

  it('returns minSpend: null once the minimum is cleared', async () => {
    const entity = await service.update('d1', { minSpend: null } as never);

    expect(entity.minSpend).toBeNull();
  });

  // ─── Percent bounds — validated on the MERGED definition ────────────────

  it.each([1, 100])('accepts a PERCENT value at the %s boundary', async (value) => {
    await expect(service.update('d1', { value })).resolves.toBeDefined();
    expect(writtenInput().value).toEqual(new Prisma.Decimal(value));
  });

  it.each([0.5, 100.01, 101])('refuses a PERCENT value of %s without writing', async (value) => {
    await expect(service.update('d1', { value })).rejects.toThrow(
      'Percentage value must be between 1 and 100',
    );
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('refuses switching a FIXED 150 code to PERCENT when the stored value is kept', async () => {
    repositoryMock.findById.mockResolvedValue(
      makeDiscount({ type: DiscountType.FIXED, value: new Prisma.Decimal('150') }),
    );

    await expect(service.update('d1', { type: DiscountType.PERCENT })).rejects.toThrow(
      'Percentage value must be between 1 and 100',
    );
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('accepts switching FIXED 150 to PERCENT when a valid value comes with it', async () => {
    repositoryMock.findById.mockResolvedValue(
      makeDiscount({ type: DiscountType.FIXED, value: new Prisma.Decimal('150') }),
    );

    await service.update('d1', { type: DiscountType.PERCENT, value: 20 });

    expect(repositoryMock.update).toHaveBeenCalledWith('d1', {
      type: DiscountType.PERCENT,
      value: new Prisma.Decimal(20),
    });
  });

  it('accepts a FIXED value above 100 — the percent bound is PERCENT-only', async () => {
    await expect(
      service.update('d1', { type: DiscountType.FIXED, value: 250 }),
    ).resolves.toBeDefined();
  });

  // ─── Date window — validated on the MERGED definition ───────────────────

  it('accepts startsAt equal to expiresAt (a zero-length window is not inverted)', async () => {
    const instant = '2026-11-15T12:00:00.000Z';

    await expect(
      service.update('d1', { startsAt: instant, expiresAt: instant }),
    ).resolves.toBeDefined();
  });

  it('refuses startsAt one millisecond after expiresAt', async () => {
    await expect(
      service.update('d1', {
        startsAt: '2026-11-15T12:00:00.001Z',
        expiresAt: '2026-11-15T12:00:00.000Z',
      }),
    ).rejects.toThrow('startsAt must be before expiresAt');
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('refuses a new startsAt after the STORED expiry', async () => {
    await expect(service.update('d1', { startsAt: '2027-01-01T00:00:00.000Z' })).rejects.toThrow(
      'startsAt must be before expiresAt',
    );
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('accepts a new startsAt before the stored expiry', async () => {
    await service.update('d1', { startsAt: '2026-12-01T00:00:00.000Z' });

    expect(repositoryMock.update).toHaveBeenCalledWith('d1', {
      startsAt: new Date('2026-12-01T00:00:00.000Z'),
    });
  });

  it('accepts a new expiresAt after the stored start', async () => {
    await expect(
      service.update('d1', { expiresAt: '2026-10-02T00:00:00.000Z' }),
    ).resolves.toBeDefined();
  });

  it('clearing both ends leaves an unbounded window', async () => {
    await service.update('d1', { startsAt: null, expiresAt: null } as never);

    expect(repositoryMock.update).toHaveBeenCalledWith('d1', { startsAt: null, expiresAt: null });
  });

  // ─── Code conflict ──────────────────────────────────────────────────────

  it('refuses renaming to a code another discount already holds, without writing', async () => {
    repositoryMock.findByCode.mockResolvedValue(makeDiscount({ id: 'd2', code: 'TAKEN' }));

    await expect(service.update('d1', { code: 'TAKEN' })).rejects.toThrow(
      'A discount with code "TAKEN" already exists',
    );
    expect(repositoryMock.findByCode).toHaveBeenCalledWith('TAKEN');
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('re-sending the code it already has is not a conflict with itself', async () => {
    await service.update('d1', { code: 'SUMMER10', value: 12 });

    expect(repositoryMock.findByCode).not.toHaveBeenCalled();
    expect(repositoryMock.update).toHaveBeenCalledWith('d1', {
      code: 'SUMMER10',
      value: new Prisma.Decimal(12),
    });
  });

  it('validates the definition before looking the code up — a bad percent is reported first', async () => {
    repositoryMock.findByCode.mockResolvedValue(makeDiscount({ id: 'd2', code: 'TAKEN' }));

    await expect(service.update('d1', { code: 'TAKEN', value: 150 })).rejects.toThrow(
      'Percentage value must be between 1 and 100',
    );
    expect(repositoryMock.findByCode).not.toHaveBeenCalled();
  });
});

// ─── TASK-731: «Показувати на сторінці «Акції»» ───────────────────────────────

describe('DiscountService — showOnPromoPage (TASK-731)', () => {
  let service: DiscountService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscountService(repositoryMock as never, cartServiceMock as never);
    repositoryMock.findByCode.mockResolvedValue(null);
    repositoryMock.create.mockImplementation((input: Partial<Discount>) =>
      Promise.resolve(makeDiscount(input)),
    );
    repositoryMock.findById.mockResolvedValue(makeDiscount({ showOnPromoPage: false }));
    repositoryMock.update.mockImplementation((_id: string, input: Partial<Discount>) =>
      Promise.resolve(makeDiscount(input)),
    );
  });

  it('creates a private code when the flag is omitted', async () => {
    const entity = await service.create({ code: 'PRIVATE', type: DiscountType.PERCENT, value: 5 });

    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ showOnPromoPage: false }),
    );
    expect(entity.showOnPromoPage).toBe(false);
  });

  it('creates a published code when the operator ticks the flag', async () => {
    const entity = await service.create({
      code: 'PUBLIC',
      type: DiscountType.PERCENT,
      value: 5,
      showOnPromoPage: true,
    });

    expect(repositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ showOnPromoPage: true }),
    );
    expect(entity.showOnPromoPage).toBe(true);
  });

  it('publishes an existing code on update, and leaves the flag alone when omitted', async () => {
    await service.update('d1', { showOnPromoPage: true });
    expect(repositoryMock.update).toHaveBeenLastCalledWith(
      'd1',
      expect.objectContaining({ showOnPromoPage: true }),
    );

    await service.update('d1', { isActive: false });
    expect(repositoryMock.update.mock.calls[1][1]).not.toHaveProperty('showOnPromoPage');
  });
});
