import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UserRepository, UpdateUserInput, FindAllParams } from './user.repository';
import { AuthRepository } from '../auth/auth.repository';
import { AuthService } from '../auth/auth.service';
import { UserEntity, UserAdminCardEntity } from './entities';
import { UpdateProfileDto, UserListQueryDto, CreateUserDto } from './dto';
import { hashPassword } from '../common/security';
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
    private readonly authService: AuthService,
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
   * Get a user by ID (admin-only).
   * Returns a UserEntity with sensitive fields stripped.
   * Throws NotFoundException if the user does not exist.
   */
  async findById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(id);

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
    const user = await this.userRepository.findById(id);

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

  /**
   * Provision a staff account from the admin UI (owner-only, TASK-333/317).
   *
   * The reason this endpoint exists: hiring someone used to require a developer
   * with shell access to run `scripts/create-admin.ts` on the server. A kadrova
   * operation that routes through an engineer is a permanent bottleneck — and
   * the script only ever makes ADMINs, so "hire a blog editor" meant handing out
   * full access to orders, prices and customer data.
   *
   * @throws ConflictException when the email is already taken
   */
  async createUser(dto: CreateUserDto): Promise<UserEntity> {
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already taken');
    }

    const passwordHash = await hashPassword(dto.password);

    const created = await this.userRepository.create({
      email: dto.email,
      passwordHash,
      role: dto.role,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    return UserEntity.fromPrisma(created);
  }

  /**
   * Reset someone else's password (owner-only, TASK-333).
   *
   * Routed through {@link AuthService.setPassword} so an owner-initiated reset
   * is byte-for-byte the same operation as a self-service one: same hash
   * parameters, same session revocation, same lockout clearing. A second
   * implementation here would be the one that eventually forgets to revoke the
   * old sessions — and "the owner reset the password of a compromised account"
   * is exactly when that matters.
   *
   * @throws NotFoundException when the target user does not exist
   */
  async setUserPassword(id: string, newPassword: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.authService.setPassword(id, newPassword);

    return UserEntity.fromPrisma(user);
  }

  /**
   * Change a user's role (owner-only, TASK-317/334).
   *
   * @throws ForbiddenException when the caller targets their own account, or
   *         when the change would leave the shop with no working admin
   * @throws NotFoundException when the target user does not exist
   */
  async updateUserRole(id: string, role: UserRole, adminId: string): Promise<UserEntity> {
    // Self-demotion is the single most effective way to lock yourself out, and
    // it is never what someone means to do. Mirrors the self-ban guard below.
    if (id === adminId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === role) {
      return UserEntity.fromPrisma(user);
    }

    if (user.role === UserRole.ADMIN) {
      await this.assertNotLastAdmin(id, 'demote');
    }

    const updated = await this.userRepository.updateRole(id, role);

    // A demoted employee must not keep a working session: their access token
    // still carries the old role for up to 15 minutes, and although
    // PermissionGuard re-reads the role from the database on every admin
    // request (so the token buys nothing there), revoking is what stops them
    // silently refreshing into a new one.
    await this.authRepository.revokeAllUserTokens(id);

    return UserEntity.fromPrisma(updated);
  }

  /**
   * Refuse an operation that would leave the shop without a single admin who
   * can actually sign in (TASK-334).
   *
   * Deactivating, deleting or demoting the last ADMIN locks the owner out of
   * their own shop, and the only way back is shell access to the production
   * database (`scripts/create-admin.ts`). The self-targeting guards are not
   * enough on their own: two admins can lock each other out, and an owner who
   * created a second admin and then deleted the first would hit exactly this.
   */
  private async assertNotLastAdmin(id: string, operation: string): Promise<void> {
    const remaining = await this.userRepository.countActiveAdmins(id);

    if (remaining === 0) {
      throw new ForbiddenException(
        `Cannot ${operation} the last active administrator — the shop would have no way back in. ` +
          'Create another administrator first.',
      );
    }
  }

  /**
   * Deactivate a user by setting isActive = false (admin-only).
   *
   * Banning a user also revokes all of their refresh tokens so existing
   * sessions cannot outlive the ban (the access token still works until it
   * expires — at most JWT_EXPIRATION, 15m — but no new tokens can be minted).
   *
   * @param id      the target user to deactivate
   * @param adminId the calling admin's own id — an admin cannot ban themselves
   * @throws ForbiddenException when an admin targets their own account, or when
   *         the target is the last active administrator
   * @throws NotFoundException when the target user does not exist
   */
  async deactivateUser(id: string, adminId: string): Promise<UserEntity> {
    if (id === adminId) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      await this.assertNotLastAdmin(id, 'deactivate');
    }

    const deactivatedUser = await this.userRepository.deactivate(id);

    // Kill every active session for the banned user (idempotent — revokes only
    // non-revoked tokens).
    await this.authRepository.revokeAllUserTokens(id);

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
   * @param id      the target user to delete
   * @param adminId the calling admin's own id — an admin cannot delete themselves
   * @throws ForbiddenException when an admin targets their own account
   * @throws NotFoundException when the target user does not exist
   */
  async deleteUser(id: string, adminId: string): Promise<UserEntity> {
    if (id === adminId) {
      throw new ForbiddenException('Cannot delete your own account');
    }

    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      await this.assertNotLastAdmin(id, 'delete');
    }

    const mangledEmail = `deleted:${user.id}:${user.email}`;

    const deleted = await this.userRepository.softDelete(id, mangledEmail, user.email);

    // Kill every active session for the deleted user.
    await this.authRepository.revokeAllUserTokens(id);

    return UserEntity.fromPrisma(deleted);
  }

  /**
   * Activate a user by setting isActive = true (admin-only).
   * Throws NotFoundException if the user does not exist.
   */
  async activateUser(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activatedUser = await this.userRepository.activate(id);

    return UserEntity.fromPrisma(activatedUser);
  }
}
