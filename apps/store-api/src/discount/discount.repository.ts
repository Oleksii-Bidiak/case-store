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
 * mutations (`incrementRedeemed`, `createRedemption`) are transaction-aware: the
 * order-creation flow passes its `tx` so the cap re-check, counter bump, and
 * redemption insert all commit atomically with the order.
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

  /** Find a discount by ID, or null if it does not exist. */
  findById(id: string): Promise<Discount | null> {
    return this.prisma.discount.findUnique({ where: { id } });
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
   */
  countUserRedemptions(discountId: string, userId: string): Promise<number> {
    return this.prisma.discountRedemption.count({ where: { discountId, userId } });
  }

  /**
   * Atomically increment a discount's global `redeemedCount`. Accepts an
   * optional transaction client so it commits with the order in `createOrder`.
   */
  incrementRedeemed(discountId: string, tx?: Prisma.TransactionClient): Promise<Discount> {
    const client = tx ?? this.prisma;
    return client.discount.update({
      where: { id: discountId },
      data: { redeemedCount: { increment: 1 } },
    });
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
