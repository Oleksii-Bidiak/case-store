import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRepository, UpdateUserInput, FindAllParams } from './user.repository';
import { AuthRepository } from '../auth/auth.repository';
import { ReviewService } from '../review/review.service';
import { UserEntity, UserAdminCardEntity } from './entities';
import { UpdateProfileDto, UserListQueryDto } from './dto';
import { assertMayManage, type PermissionActor } from '../auth/permissions';
import {
  CUSTOMER_CARD_RECENT_ORDERS_LIMIT,
  CUSTOMER_CARD_REVIEWS_LIMIT,
  CUSTOMER_CARD_COUPONS_LIMIT,
  CUSTOMER_CARD_MESSAGES_LIMIT,
} from './user-admin-card.types';

/**
 * Pagination metadata returned alongside paginated results.
 */
interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Paginated response envelope for user lists.
 */
interface PaginatedUsersResponse {
  data: UserEntity[];
  meta: PaginationMeta;
}

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly authRepository: AuthRepository,
    private readonly reviewService: ReviewService,
  ) {}

  /**
   * Get the profile of the authenticated user.
   * Returns a UserEntity with sensitive fields stripped.
   * Throws NotFoundException if the user does not exist.
   */
  async getProfile(userId: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return UserEntity.fromPrisma(user);
  }

  /**
   * Update the profile of the authenticated user — firstName, lastName, phone.
   *
   * `email` is accepted in the DTO but may only repeat the address the account
   * already has, so a client that sends the whole profile back keeps working.
   * An actual change is refused (TASK-372) — see the comment on the guard below.
   *
   * Throws NotFoundException if the user does not exist.
   * Throws BadRequestException on an attempt to change the email address.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserEntity> {
    // Verify the user exists
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // The address is the login AND the password-reset channel, so changing it is
    // equivalent to handing over the account — it does not belong in a profile
    // edit. Refused rather than made to work: the dedicated flow (TASK-396)
    // proves the new address BEFORE applying it, requires the current password,
    // and warns the old address. This endpoint therefore never changes an email
    // in any design, which is why the refusal is permanent and not a stopgap.
    //
    // Refusing BEFORE any uniqueness lookup is deliberate: answering 409 "already
    // taken" here would turn a forbidden operation into an email-enumeration
    // oracle — anyone with a token could probe which addresses hold an account.
    if (dto.email !== undefined && dto.email !== user.email) {
      throw new BadRequestException(
        'Email cannot be changed here — use the dedicated address-change flow',
      );
    }

    // Build update input from DTO — only include provided fields
    const updateInput: UpdateUserInput = {};

    if (dto.email !== undefined) {
      updateInput.email = dto.email;
    }
    if (dto.firstName !== undefined) {
      updateInput.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      updateInput.lastName = dto.lastName;
    }
    if (dto.phone !== undefined) {
      updateInput.phone = dto.phone;
    }

    const updatedUser = await this.userRepository.update(userId, updateInput);

    return UserEntity.fromPrisma(updatedUser);
  }

  /**
   * Get a paginated list of users (admin-only).
   * Supports filtering by role, active status, and text search.
   * Returns a paginated response with metadata.
   */
  async findAll(query: UserListQueryDto): Promise<PaginatedUsersResponse> {
    const params: FindAllParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      role: query.role,
      isActive: query.isActive,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    };

    const { users, total } = await this.userRepository.findAll(params);

    const totalPages = Math.ceil(total / params.limit);

    return {
      data: users.map((user) => UserEntity.fromPrisma(user)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
      },
    };
  }

  /**
   * Get a CUSTOMER by ID (admin surface).
   *
   * Scoped through `findCustomerById` since TASK-476: a service account answers
   * 404 here and is read on `/api/admin/staff/:id` instead, behind `staff:read`.
   * Same answer for a staff id and a missing one, so `customers:read` cannot be
   * used to probe for administrators.
   */
  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findCustomerById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return UserEntity.fromPrisma(user);
  }

  /**
   * Assemble the enriched admin "customer card" for a user (admin-only, TASK-252):
   * profile + lifetime value + order count + recent orders + reviews + redeemed
   * coupons + email-matched contact messages.
   *
   * One `findById` lookup runs first — it is unavoidable (a 404 must be raised
   * before any enrichment work, and the contact-message read needs the user's
   * email). Everything after it is a single parallel `Promise.all` batch of six
   * independent reads, with no waterfall of dependent queries — mirroring
   * `DashboardRepository.getSummary()`'s assembly style.
   *
   * @throws NotFoundException when the user does not exist (or is soft-deleted).
   */
  async getAdminCard(id: string): Promise<UserAdminCardEntity> {
    const user = await this.userRepository.findCustomerById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [ltv, orderCount, recentOrders, reviews, redeemedCoupons, contactMessages] =
      await Promise.all([
        this.userRepository.getLtv(id),
        this.userRepository.getOrderCount(id),
        this.userRepository.getRecentOrders(id, CUSTOMER_CARD_RECENT_ORDERS_LIMIT),
        this.userRepository.getReviewsByUserId(id, CUSTOMER_CARD_REVIEWS_LIMIT),
        this.userRepository.getRedeemedCoupons(id, CUSTOMER_CARD_COUPONS_LIMIT),
        this.userRepository.getContactMessagesByEmail(user.email, CUSTOMER_CARD_MESSAGES_LIMIT),
      ]);

    return UserAdminCardEntity.fromParts(UserEntity.fromPrisma(user), {
      ltv,
      orderCount,
      recentOrders,
      reviews,
      redeemedCoupons,
      contactMessages,
    });
  }

  // `createUser`, `setUserPassword` and `updateUserRole` moved to `StaffService`
  // in TASK-476, with their routes: provisioning an account, setting somebody
  // else's password and changing a role are three of the four doors that decide
  // who runs the shop, and they now go through the level rule
  // (`auth/permissions/access-level.ts`) on `/api/admin/staff`.
  //
  // `assertNotLastAdmin` is gone rather than moved — see the note where
  // `countActiveAdmins` used to be in `UserRepository`.

  /**
   * Deactivate a user by setting isActive = false (admin-only).
   *
   * Banning a user also revokes all of their refresh tokens so existing
   * sessions cannot outlive the ban (the access token still works until it
   * expires — at most JWT_EXPIRATION, 15m — but no new tokens can be minted).
   *
   * And it withdraws what they wrote (TASK-589). The owner's decision 7(г) asked
   * whether a ban hides ratings as well as reviews; measured during planning, it
   * hid NEITHER — the account could not log in while its texts stayed on the
   * storefront and its one-star ratings stayed in every average. An operator
   * banning an abuser reasonably believes they have dealt with the abuse.
   *
   * TASK-476 narrowed WHO this can be done to, and nothing else about it. The
   * lookup is customer-scoped, so the `customers:write` holder who could once
   * switch off an administrator from here now gets a 404; the level rule runs on
   * top as the same assertion the staff surface uses, so all four doors read
   * alike even though this one can only ever see level 0.
   *
   * @param id    the target customer to deactivate
   * @param actor the caller as the guard resolved them from the database
   * @throws ForbiddenException when the caller targets their own account
   * @throws NotFoundException when no CUSTOMER with this id exists
   */
  async deactivateUser(id: string, actor: PermissionActor): Promise<UserEntity> {
    if (id === actor.id) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    const user = await this.userRepository.findCustomerById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    assertMayManage(actor, user);

    const deactivatedUser = await this.userRepository.deactivate(id);

    // Kill every active session for the banned user (idempotent — revokes only
    // non-revoked tokens).
    await this.authRepository.revokeAllUserTokens(id);

    // …and take down what they wrote, ratings included (TASK-589).
    await this.reviewService.hideAuthor(id);

    return UserEntity.fromPrisma(deactivatedUser);
  }

  /**
   * Soft-delete a user (admin-only, TASK-104).
   *
   * Stamps `deletedAt`, sets `isActive = false`, mangles the unique `email`
   * (prefixing `deleted:<id>:`) to free the address for re-registration, and
   * preserves the original in `originalEmail` for audit. All refresh tokens are
   * revoked so existing sessions cannot outlive the deletion. The row is kept so
   * the user's historical orders still resolve.
   *
   * Customer-scoped since TASK-476: deleting a service account is a personnel
   * decision and belongs on `/api/admin/staff`, where the level rule decides who
   * may reach whom. `@OwnerOnly()` stays on the route regardless — this task
   * widens nobody's power.
   *
   * @param id    the target customer to delete
   * @param actor the caller as the guard resolved them from the database
   * @throws ForbiddenException when the caller targets their own account
   * @throws NotFoundException when no CUSTOMER with this id exists
   */
  async deleteUser(id: string, actor: PermissionActor): Promise<UserEntity> {
    if (id === actor.id) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    const user = await this.userRepository.findCustomerById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    assertMayManage(actor, user);

    const mangledEmail = `deleted:${user.id}:${user.email}`;

    const deleted = await this.userRepository.softDelete(id, mangledEmail, user.email);

    // Kill every active session for the deleted user.
    await this.authRepository.revokeAllUserTokens(id);

    return UserEntity.fromPrisma(deleted);
  }

  /**
   * Activate a customer account (admin surface).
   *
   * Takes the actor and runs the same assertion as its mirror image. Restoring an
   * account looks harmless next to banning one, which is precisely why the pair
   * drifted before: `deactivate` had a self-targeting guard and `activate` had
   * nothing at all, so un-banning was the unchecked half of the same decision.
   *
   * @throws NotFoundException when no CUSTOMER with this id exists
   */
  async activateUser(id: string, actor: PermissionActor): Promise<UserEntity> {
    const user = await this.userRepository.findCustomerById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    assertMayManage(actor, user);

    const activatedUser = await this.userRepository.activate(id);

    // The mirror of the ban (TASK-589). Whether the restored account's RATINGS
    // count again is decided by the email gate, not by this call — see
    // ReviewService.unhideAuthor.
    await this.reviewService.unhideAuthor(id);

    return UserEntity.fromPrisma(activatedUser);
  }
}
