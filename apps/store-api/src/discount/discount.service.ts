import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, Discount, DiscountType } from '@prisma/client';
import {
  DiscountRepository,
  CreateDiscountInput,
  UpdateDiscountInput,
} from './discount.repository';
import { CartService } from '../cart';
import type { ResolvedCartIdentity } from '../cart/cart-identity.types';
import { DiscountEntity, DiscountPreviewEntity, PublicDiscountEntity } from './entities';
import { CreateDiscountDto, UpdateDiscountDto, DiscountListQueryDto } from './dto';
import { DiscountErrorCode, badDiscount, conflictDiscount } from './discount.errors';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** Pagination metadata returned alongside an admin discount list. */
export interface DiscountPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * DiscountService — promo-code validation, amount calculation, redemption, and
 * admin management.
 *
 * The heart is {@link computeDiscount} — the pure, TDD'd calculable core that
 * normalizes the code, runs every eligibility gate (active, window, min-spend,
 * global + per-user caps), and computes the discount amount with integer-cents
 * arithmetic (mirroring the cart/order line-total pattern), clamped so it can
 * never exceed the subtotal. It throws typed {@link DiscountErrorCode} errors so
 * the storefront can localize each failure. The service never trusts a
 * client-sent amount: the preview is advisory and `createOrder` recomputes.
 */
@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(
    private readonly discountRepository: DiscountRepository,
    private readonly cartService: CartService,
  ) {}

  /**
   * Validate a promo code against a subtotal and a user, and compute the
   * discount amount. The **pure calculable core** (TDD).
   *
   * @param code Raw promo code (normalized to trimmed uppercase internally).
   * @param subtotal Cart subtotal as a decimal string ("XX.YY").
   * @param userId The redeeming user (drives the per-user cap check).
   * @returns The loaded discount and the computed amount as a decimal string,
   *   clamped so `amount <= subtotal`.
   * @throws BadRequestException (NOT_FOUND/INACTIVE/NOT_STARTED/EXPIRED/
   *   MIN_SPEND_NOT_MET) and ConflictException (MAX_REDEMPTIONS_REACHED/
   *   USER_LIMIT_REACHED), each carrying a stable {@link DiscountErrorCode}.
   */
  async computeDiscount(
    code: string,
    subtotal: string,
    userId: string,
  ): Promise<{ discount: Discount; amount: string }> {
    const normalizedCode = code.trim().toUpperCase();
    const discount = await this.discountRepository.findByCode(normalizedCode);

    if (!discount) {
      throw badDiscount(DiscountErrorCode.NOT_FOUND, 'This promo code is not valid');
    }
    if (!discount.isActive) {
      throw badDiscount(DiscountErrorCode.INACTIVE, 'This promo code is no longer active');
    }

    const now = new Date();
    if (discount.startsAt && now < discount.startsAt) {
      throw badDiscount(DiscountErrorCode.NOT_STARTED, 'This promo code is not active yet');
    }
    if (discount.expiresAt && now > discount.expiresAt) {
      throw badDiscount(DiscountErrorCode.EXPIRED, 'This promo code has expired');
    }

    const subtotalCents = toCents(subtotal);

    if (discount.minSpend !== null) {
      const minSpendCents = toCents(discount.minSpend.toString());
      if (subtotalCents < minSpendCents) {
        throw badDiscount(
          DiscountErrorCode.MIN_SPEND_NOT_MET,
          `This code requires a minimum spend of ${discount.minSpend.toString()}`,
        );
      }
    }

    // Global cap: the authoritative re-check happens again inside the order
    // transaction (redeem), but reject early here for a clear preview error.
    if (discount.maxRedemptions !== null && discount.redeemedCount >= discount.maxRedemptions) {
      throw conflictDiscount(
        DiscountErrorCode.MAX_REDEMPTIONS_REACHED,
        'This promo code has reached its redemption limit',
      );
    }

    // Per-user cap: only queried when a limit is configured (avoids a needless
    // count for unlimited codes).
    if (discount.perUserLimit !== null) {
      const userCount = await this.discountRepository.countUserRedemptions(discount.id, userId);
      if (userCount >= discount.perUserLimit) {
        throw conflictDiscount(
          DiscountErrorCode.USER_LIMIT_REACHED,
          'You have already used this promo code',
        );
      }
    }

    const amountCents = computeAmountCents(discount, subtotalCents);
    return { discount, amount: centsToDecimalString(amountCents) };
  }

  /**
   * Preview a promo code against the authenticated user's current cart. Reads
   * the subtotal server-side (never trusts a client value), runs
   * {@link computeDiscount}, and returns the applied code, amount, and resulting
   * total.
   */
  async preview(userId: string, code: string): Promise<DiscountPreviewEntity> {
    const identity: ResolvedCartIdentity = { type: 'user', userId };
    const cart = await this.cartService.getCart(identity);
    const subtotal = cart.totals.subtotal;

    const { discount, amount } = await this.computeDiscount(code, subtotal, userId);

    const newTotalCents = toCents(subtotal) - toCents(amount);
    const entity = new DiscountPreviewEntity();
    entity.code = discount.code;
    entity.type = discount.type;
    entity.amount = amount;
    entity.newTotal = centsToDecimalString(newTotalCents);
    return entity;
  }

  /**
   * Redeem a discount inside the order-creation transaction. Re-validates the
   * caps against the live row (the preview may be stale), bumps the global
   * counter, and inserts the redemption. The unique `orderId` makes a repeated
   * apply to the same order idempotent (it throws a unique-constraint error
   * rather than double-counting).
   *
   * @throws ConflictException when a cap was exhausted between preview and order
   *   placement (the whole order transaction then rolls back).
   */
  async redeem(
    discountId: string,
    userId: string,
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const discount = await tx.discount.findUnique({ where: { id: discountId } });
    if (!discount || !discount.isActive) {
      throw conflictDiscount(DiscountErrorCode.INACTIVE, 'This promo code is no longer active');
    }
    if (discount.maxRedemptions !== null && discount.redeemedCount >= discount.maxRedemptions) {
      throw conflictDiscount(
        DiscountErrorCode.MAX_REDEMPTIONS_REACHED,
        'This promo code has reached its redemption limit',
      );
    }
    if (discount.perUserLimit !== null) {
      const userCount = await tx.discountRedemption.count({ where: { discountId, userId } });
      if (userCount >= discount.perUserLimit) {
        throw conflictDiscount(
          DiscountErrorCode.USER_LIMIT_REACHED,
          'You have already used this promo code',
        );
      }
    }

    await this.discountRepository.incrementRedeemed(discountId, tx);
    await this.discountRepository.createRedemption({ discountId, userId, orderId }, tx);
  }

  /**
   * Public active-discounts feed (TASK-179, `GET /api/discounts/active`). Loads
   * the DB-expressible window candidates (active + null-or-past `startsAt` +
   * null-or-future `expiresAt`), then applies the remaining cap gate in JS —
   * `maxRedemptions === null || redeemedCount < maxRedemptions` — a same-row
   * column-vs-column comparison the SQL `where` can't express (mirrors how
   * {@link computeDiscount} checks the cap over an already-loaded row). Survivors
   * are mapped to the public-safe {@link PublicDiscountEntity} (no caps/counts,
   * no id). No pagination: a curated promo list is bounded (dozens, not
   * hundreds).
   */
  async findActivePublic(): Promise<{ data: PublicDiscountEntity[] }> {
    const candidates = await this.discountRepository.findActiveWindowCandidates(new Date());
    const redeemable = candidates.filter(
      (discount) =>
        discount.maxRedemptions === null || discount.redeemedCount < discount.maxRedemptions,
    );
    return { data: redeemable.map((discount) => PublicDiscountEntity.fromPrisma(discount)) };
  }

  // ─── Admin CRUD ─────────────────────────────────────────────────────────

  /** Admin — paginated discount list with optional active filter + code search. */
  async list(
    query: DiscountListQueryDto,
  ): Promise<{ data: DiscountEntity[]; meta: DiscountPaginationMeta }> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const { discounts, total } = await this.discountRepository.findMany({
      page,
      limit,
      isActive: query.isActive,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      data: discounts.map((d) => DiscountEntity.fromPrisma(d)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Admin — get a single discount by id. */
  async getById(id: string): Promise<DiscountEntity> {
    const discount = await this.discountRepository.findById(id);
    if (!discount) {
      throw new NotFoundException('Discount not found');
    }
    return DiscountEntity.fromPrisma(discount);
  }

  /** Admin — create a discount. Validates percent bounds and window ordering. */
  async create(dto: CreateDiscountDto): Promise<DiscountEntity> {
    this.assertValidDefinition(dto.type, dto.value, dto.startsAt, dto.expiresAt);

    const existing = await this.discountRepository.findByCode(dto.code);
    if (existing) {
      throw new BadRequestException(`A discount with code "${dto.code}" already exists`);
    }

    const input: CreateDiscountInput = {
      code: dto.code,
      type: dto.type,
      value: new Prisma.Decimal(dto.value),
      minSpend: dto.minSpend !== undefined ? new Prisma.Decimal(dto.minSpend) : null,
      maxRedemptions: dto.maxRedemptions ?? null,
      perUserLimit: dto.perUserLimit ?? null,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      isActive: dto.isActive,
    };

    const created = await this.discountRepository.create(input);
    this.logger.log(`Discount created: ${created.code}`);
    return DiscountEntity.fromPrisma(created);
  }

  /** Admin — update a discount. */
  async update(id: string, dto: UpdateDiscountDto): Promise<DiscountEntity> {
    const existing = await this.discountRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Discount not found');
    }

    // Validate the effective (post-merge) definition so a partial update can't
    // produce an out-of-range percent or an inverted start/expiry window.
    this.assertValidDefinition(
      dto.type ?? existing.type,
      dto.value ?? Number(existing.value),
      dto.startsAt ?? existing.startsAt?.toISOString(),
      dto.expiresAt ?? existing.expiresAt?.toISOString(),
    );

    if (dto.code && dto.code !== existing.code) {
      const clash = await this.discountRepository.findByCode(dto.code);
      if (clash) {
        throw new BadRequestException(`A discount with code "${dto.code}" already exists`);
      }
    }

    const input: UpdateDiscountInput = {
      ...(dto.code !== undefined ? { code: dto.code } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.value !== undefined ? { value: new Prisma.Decimal(dto.value) } : {}),
      ...(dto.minSpend !== undefined
        ? { minSpend: dto.minSpend === null ? null : new Prisma.Decimal(dto.minSpend) }
        : {}),
      ...(dto.maxRedemptions !== undefined ? { maxRedemptions: dto.maxRedemptions ?? null } : {}),
      ...(dto.perUserLimit !== undefined ? { perUserLimit: dto.perUserLimit ?? null } : {}),
      ...(dto.startsAt !== undefined
        ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }
        : {}),
      ...(dto.expiresAt !== undefined
        ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
        : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    };

    const updated = await this.discountRepository.update(id, input);
    return DiscountEntity.fromPrisma(updated);
  }

  /** Admin — soft-deactivate a discount (sets `isActive = false`). */
  async deactivate(id: string): Promise<DiscountEntity> {
    const existing = await this.discountRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Discount not found');
    }
    const deactivated = await this.discountRepository.softDeactivate(id);
    return DiscountEntity.fromPrisma(deactivated);
  }

  /**
   * Validate a discount definition independent of the DTO layer: PERCENT values
   * must be within 1–100, and the start window must not be after the expiry.
   */
  private assertValidDefinition(
    type: DiscountType,
    value: number,
    startsAt?: string | null,
    expiresAt?: string | null,
  ): void {
    if (type === DiscountType.PERCENT && (value < 1 || value > 100)) {
      throw new BadRequestException('Percentage value must be between 1 and 100');
    }
    if (startsAt && expiresAt && new Date(startsAt) > new Date(expiresAt)) {
      throw new BadRequestException('startsAt must be before expiresAt');
    }
  }
}

// ─── Cents helpers (shared with the cart/order line-total pattern) ────────────

/** Convert a "XX.YY" decimal string to an integer number of cents. */
function toCents(decimal: string): number {
  return Math.round(parseFloat(decimal) * 100);
}

/** Convert an integer number of cents to a "XX.YY" decimal string. */
function centsToDecimalString(cents: number): string {
  const safe = Math.max(0, cents);
  const dollars = Math.floor(safe / 100);
  const remainder = safe % 100;
  return `${dollars}.${remainder.toString().padStart(2, '0')}`;
}

/**
 * Compute the discount amount in cents, clamped so it never exceeds the
 * subtotal (never a negative total). PERCENT rounds to the nearest cent; FIXED
 * is the configured UAH value in cents.
 */
function computeAmountCents(discount: Discount, subtotalCents: number): number {
  const rawCents =
    discount.type === DiscountType.PERCENT
      ? Math.round((subtotalCents * Number(discount.value)) / 100)
      : toCents(discount.value.toString());
  return Math.min(rawCents, subtotalCents);
}
