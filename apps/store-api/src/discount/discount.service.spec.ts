import { HttpException } from '@nestjs/common';
import { Prisma, Discount, DiscountType } from '@prisma/client';
import { DiscountService } from './discount.service';
import { DiscountErrorCode } from './discount.errors';

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
  incrementRedeemed: jest.fn(),
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
  let tx: {
    discount: { findUnique: jest.Mock };
    discountRedemption: { count: jest.Mock };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscountService(repositoryMock as never, cartServiceMock as never);
    tx = {
      discount: { findUnique: jest.fn() },
      discountRedemption: { count: jest.fn() },
    };
  });

  it('increments the global counter and inserts a redemption inside the tx', async () => {
    tx.discount.findUnique.mockResolvedValue(makeDiscount());

    await service.redeem('d1', 'u1', 'o1', tx as never);

    expect(repositoryMock.incrementRedeemed).toHaveBeenCalledWith('d1', tx);
    expect(repositoryMock.createRedemption).toHaveBeenCalledWith(
      { discountId: 'd1', userId: 'u1', orderId: 'o1' },
      tx,
    );
  });

  it('re-checks the global cap against the live row and throws if exhausted', async () => {
    tx.discount.findUnique.mockResolvedValue(makeDiscount({ maxRedemptions: 5, redeemedCount: 5 }));

    await expectDiscountError(
      () => service.redeem('d1', 'u1', 'o1', tx as never),
      DiscountErrorCode.MAX_REDEMPTIONS_REACHED,
      409,
    );
    expect(repositoryMock.incrementRedeemed).not.toHaveBeenCalled();
  });

  it('re-checks the per-user cap against the live count and throws if exhausted', async () => {
    tx.discount.findUnique.mockResolvedValue(makeDiscount({ perUserLimit: 1 }));
    tx.discountRedemption.count.mockResolvedValue(1);

    await expectDiscountError(
      () => service.redeem('d1', 'u1', 'o1', tx as never),
      DiscountErrorCode.USER_LIMIT_REACHED,
      409,
    );
    expect(repositoryMock.createRedemption).not.toHaveBeenCalled();
  });

  it('throws when the discount was deactivated between preview and redeem', async () => {
    tx.discount.findUnique.mockResolvedValue(makeDiscount({ isActive: false }));

    await expectDiscountError(
      () => service.redeem('d1', 'u1', 'o1', tx as never),
      DiscountErrorCode.INACTIVE,
      409,
    );
  });
});
