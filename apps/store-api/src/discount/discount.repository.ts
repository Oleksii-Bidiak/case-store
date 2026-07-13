import { Injectable } from '@nestjs/common';
import { Prisma, Discount, DiscountRedemption } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Fields accepted when creating a discount. Money values arrive as Prisma
 * `Decimal` (the service converts from the DTO's numbers); date/cap fields are
 * already normalized (`null` = unbounded/unlimited).
 */
export interface CreateDiscountInput {
  code: string;
  type: Prisma.DiscountCreateInput['type'];
  value: Prisma.Decimal;
  minSpend?: Prisma.Decimal | null;
  maxRedemptions?: number | null;
  perUserLimit?: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isActive?: boolean;
}

/**
 * Fields accepted when updating a discount. Only provided keys are changed.
 */
export interface UpdateDiscountInput {
  code?: string;
  type?: Prisma.DiscountCreateInput['type'];
  value?: Prisma.Decimal;
  minSpend?: Prisma.Decimal | null;
  maxRedemptions?: number | null;
  perUserLimit?: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  isActive?: boolean;
}

/**
 * Parameters for the paginated admin discount list.
 */
export interface FindManyParams {
  page: number;
  limit: number;
  isActive?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedDiscountsResult {
  discounts: Discount[];
  total: number;
}

/**
 * Allow-listed sort fields for the admin list (the DTO `@IsIn` already rejects
 * unknown values at the boundary; this is a defensive map).
 */
const ALLOWED_SORT: Record<string, keyof Prisma.DiscountOrderByWithRelationInput> = {
  code: 'code',
  createdAt: 'createdAt',
  redeemedCount: 'redeemedCount',
  expiresAt: 'expiresAt',
};

/**
 * DiscountRepository — all Prisma access for discounts and their redemptions.
 *
 * Injects {@link PrismaService} (never the raw PrismaClient). The redemption
 * reads and mutations (`findById`, `countUserRedemptions`, `tryIncrementRedeemed`,
 * `createRedemption`) are transaction-aware: the order-creation flow passes its
 * `tx` so the cap claim, per-user re-check, and redemption insert all commit
 * atomically with the order.
 */
@Injectable()
export class DiscountRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a discount by its (uppercase) code. Callers normalize the input to
   * uppercase first, so the unique lookup is effectively case-insensitive.
   */
  findByCode(code: string): Promise<Discount | null> {
    return this.prisma.discount.findUnique({ where: { code } });
  }

  /**
   * Find a discount by ID, or null if it does not exist. Accepts an optional
   * transaction client so the order flow reads the row inside its own
   * transaction.
   */
  findById(id: string, tx?: Prisma.TransactionClient): Promise<Discount | null> {
    const client = tx ?? this.prisma;
    return client.discount.findUnique({ where: { id } });
  }

  /**
   * Paginated admin list with optional active filter and code search, plus an
   * allow-listed sort. Runs the count and page query in a single transaction.
   */
  async findMany(params: FindManyParams): Promise<PaginatedDiscountsResult> {
    const { page, limit, isActive, search, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.DiscountWhereInput = {
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search ? { code: { contains: search, mode: 'insensitive' } } : {}),
    };

    const sortField = ALLOWED_SORT[sortBy] ?? 'createdAt';

    const [discounts, total] = await this.prisma.$transaction([
      this.prisma.discount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortOrder },
      }),
      this.prisma.discount.count({ where }),
    ]);

    return { discounts, total };
  }

  /**
   * Candidate rows for the public active-discounts feed (TASK-179): active codes
   * whose redemption window contains `now` — a null-or-past `startsAt` AND a
   * null-or-future `expiresAt`. Every comparison here is column-vs-literal, so
   * the fluent `where` handles it natively; the redemption-cap check
   * (`redeemedCount < maxRedemptions`, a same-row column-vs-column comparison)
   * is applied in the service over this small candidate set. Ordered by
   * `expiresAt ASC` — Postgres's default `NULLS LAST` trails never-expiring
   * codes after the soonest-expiring ones (a reasonable promo default).
   */
  findActiveWindowCandidates(now: Date): Promise<Discount[]> {
    return this.prisma.discount.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  /** Create a discount. */
  create(data: CreateDiscountInput): Promise<Discount> {
    return this.prisma.discount.create({
      data: {
        code: data.code,
        type: data.type,
        value: data.value,
        minSpend: data.minSpend ?? null,
        maxRedemptions: data.maxRedemptions ?? null,
        perUserLimit: data.perUserLimit ?? null,
        startsAt: data.startsAt ?? null,
        expiresAt: data.expiresAt ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  /** Update a discount's fields (only the provided ones). */
  update(id: string, data: UpdateDiscountInput): Promise<Discount> {
    return this.prisma.discount.update({ where: { id }, data });
  }

  /** Soft-deactivate a discount (sets `isActive = false`). */
  softDeactivate(id: string): Promise<Discount> {
    return this.prisma.discount.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * Count how many times a user has already redeemed a given discount. Drives
   * the `perUserLimit` gate in both the preview and the order-redeem re-check.
   * Accepts an optional transaction client (the redeem path passes the order
   * `tx`, so the count sees that transaction's own writes and is serialized by
   * the discount row lock {@link tryIncrementRedeemed} takes).
   */
  countUserRedemptions(
    discountId: string,
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.discountRedemption.count({ where: { discountId, userId } });
  }

  /**
   * Claim ONE redemption slot: increment `redeemedCount`, but only while the
   * global cap still has room. Returns the number of rows changed — 0 means the
   * cap was exhausted and the caller must abort (MAX_REDEMPTIONS_REACHED).
   *
   * The cap check lives INSIDE the UPDATE's `WHERE` (a `redeemedCount <
   * maxRedemptions` column-vs-column comparison via a Prisma field reference),
   * never in a preceding read: under READ COMMITTED two order transactions at
   * the cap would both pass a read-then-check gate and both increment. Postgres
   * re-evaluates this predicate against the freshly committed row version, so
   * the loser matches no row. Same pattern as the conditional stock decrement in
   * `order.repository.ts`.
   *
   * Side effect the redeem flow depends on: the UPDATE takes a row lock on the
   * discount that is held until the transaction ends, which serializes concurrent
   * redemptions of the same code.
   */
  async tryIncrementRedeemed(discountId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prisma;
    const { count } = await client.discount.updateMany({
      where: {
        id: discountId,
        OR: [
          { maxRedemptions: null },
          { redeemedCount: { lt: this.prisma.discount.fields.maxRedemptions } },
        ],
      },
      data: { redeemedCount: { increment: 1 } },
    });
    return count;
  }

  /**
   * Record a redemption. The `orderId` is unique, so a repeat-apply to the same
   * order throws a unique-constraint error rather than double-counting — this is
   * the idempotency guard. Always runs inside the order transaction.
   */
  createRedemption(
    data: { discountId: string; userId: string; orderId: string },
    tx: Prisma.TransactionClient,
  ): Promise<DiscountRedemption> {
    return tx.discountRedemption.create({ data });
  }
}
