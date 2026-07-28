import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { User, UserRole, Prisma, PaymentStatus, ContactMessage } from '@prisma/client';
import {
  type AdminCardOrderRow,
  type AdminCardReviewRow,
  type AdminCardCouponRow,
} from './user-admin-card.types';

/**
 * Parameters for paginated user queries.
 */
export interface FindAllParams {
  page: number;
  limit: number;
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Allowed fields for updating a user profile.
 * Only safe fields are included — role and isActive are excluded
 * because they require admin-level operations.
 */
export interface UpdateUserInput {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/**
 * Fields accepted when the owner provisions a staff account from the admin UI
 * (TASK-333). `passwordHash` is already hashed by the service — a repository
 * that took a plaintext password would be one refactor away from storing it.
 */
export interface CreateStaffUserInput {
  email: string;
  passwordHash: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
}

/**
 * Result of a paginated user query.
 */
export interface PaginatedUsersResult {
  users: User[];
  total: number;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a user by ID.
   * Returns the user record or null if not found.
   *
   * Excludes soft-deleted users (`deletedAt IS NOT NULL`). `findFirst` is used
   * instead of `findUnique` because `deletedAt: null` is not part of a unique
   * index.
   */
  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  /**
   * Find a user by email address.
   * Returns the user record or null if not found. Excludes soft-deleted users
   * (their email is mangled on delete, but the guard is explicit for safety).
   */
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  /**
   * Find all users with pagination and optional filtering.
   * Supports filtering by role, active status, and text search
   * across email, firstName, and lastName fields.
   *
   * Returns the paginated user list and total count for pagination metadata.
   */
  async findAll(params: FindAllParams): Promise<PaginatedUsersResult> {
    const { page, limit, role, isActive, search } = params;
    const skip = (page - 1) * limit;

    // Allow-listed sort (TASK-147). The DTO `@IsIn` rejects unknown fields at
    // the API boundary; this fallback is a defensive default.
    const ALLOWED_SORT: Record<string, string> = {
      createdAt: 'createdAt',
      email: 'email',
    };
    const sortField = ALLOWED_SORT[params.sortBy ?? 'createdAt'] ?? 'createdAt';
    const sortOrder = params.sortOrder ?? 'desc';

    // Build the where clause from optional filters. Soft-deleted users
    // (tombstoned) must never appear in any admin listing.
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (role !== undefined) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortOrder },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  /**
   * Create a staff account from the admin UI (TASK-333/317).
   *
   * `emailVerifiedAt` is left null: the owner typed this address, nobody has
   * proven it, and stamping it verified here would launder an assumption into a
   * fact. The employee proves it through the normal TASK-342 flow.
   */
  create(data: CreateStaffUserInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /**
   * Change a user's role (TASK-317/334). Callers MUST run the last-admin guard
   * first — this method is deliberately dumb about policy.
   */
  updateRole(id: string, role: UserRole): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { role } });
  }

  /**
   * How many live, active ADMIN accounts exist (TASK-334).
   *
   * The input to every "you cannot remove the last admin" check. Counts only
   * rows that could actually sign in today — a deactivated or soft-deleted admin
   * is not a way back into the shop, so counting one would let the owner strip
   * the only working admin while the guard reported everything was fine.
   *
   * `excludeUserId` answers the question the callers actually ask: "if I
   * demote/deactivate/delete THIS one, is anybody left?"
   */
  countActiveAdmins(excludeUserId?: string): Promise<number> {
    return this.prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        isActive: true,
        deletedAt: null,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
    });
  }

  /**
   * Update a user's profile fields.
   * Only the fields provided in the data object will be updated.
   * Returns the updated user record.
   */
  update(id: string, data: UpdateUserInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Deactivate a user by setting isActive = false.
   * Returns the updated user record.
   */
  deactivate(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Activate a user by setting isActive = true.
   * Returns the updated user record.
   */
  activate(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * Soft-delete a user (TASK-104): stamp `deletedAt`, set `isActive = false`,
   * mangle the unique `email` to free the address for re-registration, and
   * preserve the original in `originalEmail` for audit. The row is kept so the
   * user's historical orders still resolve.
   *
   * The caller (service) builds `mangledEmail` and supplies the `originalEmail`.
   */
  softDelete(id: string, mangledEmail: string, originalEmail: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        email: mangledEmail,
        originalEmail,
      },
    });
  }

  // ─── Admin customer card (TASK-252) ────────────────────────────────────────
  //
  // These six reads power the enriched `GET /users/:id/admin-card` endpoint.
  // Every order-shaped read goes through `prisma.order` DIRECTLY here (never
  // through the order module) to keep this file disjoint from the concurrent
  // TASK-251 order-module work — the exact same direct-Prisma pattern
  // `DashboardRepository` already uses for its own metrics. Reviews, redeemed
  // coupons, and contact messages are likewise queried directly (none of those
  // modules exports a repository), so `user.module.ts` needs no new imports.

  /**
   * Lifetime value: sum of `Order.total` for PAID orders only. Deliberately has
   * NO `deletedAt` filter — an exact mirror of
   * `DashboardRepository.getTotalRevenue` — so per-customer LTV stays consistent
   * with the store-wide lifetime revenue figure (a soft-deleted order still
   * represents money the customer actually paid). This asymmetry with
   * `getOrderCount`/`getRecentOrders` (which DO filter `deletedAt: null`) is
   * intentional — see plan 135 "LTV" Design Decision.
   */
  async getLtv(userId: string): Promise<number> {
    const result = await this.prisma.order.aggregate({
      _sum: { total: true },
      where: { userId, paymentStatus: PaymentStatus.PAID },
    });
    return Number(result._sum.total ?? 0);
  }

  /**
   * Count of the customer's live (non-soft-deleted) orders. Filters
   * `deletedAt: null` so the count matches the visible order list the admin sees
   * when clicking through to `/orders` (mirrors `OrderRepository.findByUserId`'s
   * own filter without importing that file).
   */
  getOrderCount(userId: string): Promise<number> {
    return this.prisma.order.count({ where: { userId, deletedAt: null } });
  }

  /**
   * The customer's most recent live orders, newest first, capped at `limit`.
   * Same `deletedAt: null` filter as `getOrderCount`.
   */
  getRecentOrders(userId: string, limit: number): Promise<AdminCardOrderRow[]> {
    return this.prisma.order.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        total: true,
        createdAt: true,
      },
    });
  }

  /**
   * The customer's product reviews, newest first, capped at `limit`. The product
   * display name is joined in the same query (no second lookup / N+1), then
   * flattened to `AdminCardReviewRow`.
   */
  async getReviewsByUserId(userId: string, limit: number): Promise<AdminCardReviewRow[]> {
    const reviews = await this.prisma.review.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { product: { select: { name: true } } },
    });
    return reviews.map((review) => ({
      id: review.id,
      productId: review.productId,
      productName: review.product.name,
      rating: review.rating,
      comment: review.comment,
      isActive: review.isActive,
      createdAt: review.createdAt,
    }));
  }

  /**
   * The customer's redeemed coupons, newest first, capped at `limit`. The parent
   * discount's `code`/`type`/`value` are joined in the same query, then
   * flattened to `AdminCardCouponRow` (`redeemedAt` = `DiscountRedemption.createdAt`).
   */
  async getRedeemedCoupons(userId: string, limit: number): Promise<AdminCardCouponRow[]> {
    const redemptions = await this.prisma.discountRedemption.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { discount: { select: { code: true, type: true, value: true } } },
    });
    return redemptions.map((redemption) => ({
      id: redemption.id,
      code: redemption.discount.code,
      type: redemption.discount.type,
      value: redemption.discount.value,
      orderId: redemption.orderId,
      redeemedAt: redemption.createdAt,
    }));
  }

  /**
   * Contact-inbox messages matched by exact email string, newest first, capped
   * at `limit`. `ContactMessage` has no `userId` FK yet (TASK-256 will add one) —
   * this is a deliberate best-effort email-string match, forward-compatible with
   * a real `userId` join later without changing the response shape. See plan 135
   * "Contact-message matching caveat".
   */
  getContactMessagesByEmail(email: string, limit: number): Promise<ContactMessage[]> {
    return this.prisma.contactMessage.findMany({
      where: { email },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
