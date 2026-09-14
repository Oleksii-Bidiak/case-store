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
   * Find a CUSTOMER by id — the lookup every admin-facing `/api/users/:id` route
   * uses since TASK-476.
   *
   * THE SCOPE IS THE ENFORCEMENT. `/api/users` is the customer surface now, and
   * "refuses a staff target" is not a separate check that a future route could
   * forget: a service account simply does not resolve here, so reading one,
   * deactivating one or deleting one through this module answers 404. A staff
   * target and a missing id give the same answer on purpose — a `customers:read`
   * holder must not be able to probe for service accounts.
   *
   * Deliberately NOT used by `getProfile`/`updateProfile`: `/api/users/me` is how
   * staff read their own profile too, and scoping that to customers would lock
   * every manager out of their own account page.
   */
  findCustomerById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null, role: UserRole.CUSTOMER },
    });
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
   * One page of CUSTOMERS, with optional filtering and text search.
   *
   * CUSTOMER-ONLY SINCE TASK-476, AND ENFORCED HERE RATHER THAN AT THE
   * CONTROLLER. `role: CUSTOMER` is ANDed into every query in this method, so no
   * caller — no query string, no service, no future route — can widen this list
   * back into the service accounts. That is not hypothetical tidiness: until this
   * task the list was under `customers:read`, so an operator hired to phone
   * customers could enumerate every administrator, and `customers:write` next
   * door could switch one off. Staff live in `StaffRepository` now, behind
   * non-grantable keys.
   *
   * The `role` param survives and narrows WITHIN that scope, which means asking
   * for ADMIN here returns an empty page. That is the truth rather than an error:
   * there are no administrators among the customers.
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

    // `id` is appended as a last key so the sort is total (TASK-356). The
    // default sort is `createdAt`, which is NOT unique — a seed batch or a bulk
    // import writes many accounts on the same timestamp — and within a tie group
    // Postgres promises no order at all. Under LIMIT/OFFSET that means a page
    // boundary landing inside a tie can hand back the same account on two pages
    // while another is never returned, with the totals still adding up. Sorting
    // by `email` does not need the key (it is unique), but a total order that
    // depends on which column was picked is a footgun for the next field added.
    const orderBy: Prisma.UserOrderByWithRelationInput[] = [
      { [sortField]: sortOrder },
      { id: 'asc' },
    ];

    // Build the where clause from optional filters. Soft-deleted users
    // (tombstoned) must never appear in any admin listing, and the CUSTOMER scope
    // is the first clause rather than an overridable field — see the docblock.
    const and: Prisma.UserWhereInput[] = [{ role: UserRole.CUSTOMER }];

    if (role !== undefined) {
      and.push({ role });
    }

    if (isActive !== undefined) {
      and.push({ isActive });
    }

    // Multi-token search (TASK-406). One OR over the three columns can only
    // match the whole query INSIDE a single column, so «John Doe» — the way a
    // person is actually looked up — found nobody: no column holds both the
    // first and the last name. Split on whitespace and AND the tokens; each
    // token is still ORed across email/firstName/lastName, so a token may land
    // in a different column than its neighbour. Word order stops mattering as a
    // side effect («doe john» finds the same account), and a single-token query
    // behaves exactly as it did before.
    for (const token of search?.trim().split(/\s+/).filter(Boolean) ?? []) {
      and.push({
        OR: [
          { email: { contains: token, mode: 'insensitive' } },
          { firstName: { contains: token, mode: 'insensitive' } },
          { lastName: { contains: token, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.UserWhereInput = { deletedAt: null, AND: and };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  // `create`, `updateRole` and `countActiveAdmins` used to live here.
  //
  // The first two moved to `StaffRepository` in TASK-476 along with the routes
  // that called them: `/api/users` no longer mints accounts or changes roles.
  //
  // `countActiveAdmins` is GONE rather than moved, and so is `assertNotLastAdmin`
  // in the service. It answered "if I remove this one, is anybody left?" — a
  // weaker question than the one that matters, and one it could answer "yes" to
  // while an admin removed the owner. The replacement is the level rule in
  // `auth/permissions/access-level.ts`: OWNER is the maximum level and
  // `assertMayManage` requires strictly greater, so the owner cannot be demoted,
  // deactivated or deleted by anyone — the shop cannot be stranded because the one
  // account that can always sign in cannot be removed at all.

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
      textStatus: review.textStatus,
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
