import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UserRepository, UpdateUserInput } from './user.repository';
import { UserService } from './user.service';
import { UserEntity, UserAdminCardEntity } from './entities';
import { UpdateProfileDto, UserListQueryDto } from './dto';
import { AuthRepository } from '../auth/auth.repository';

import { ReviewService } from '../review/review.service';

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hash',
  firstName: 'John',
  lastName: 'Doe',
  phone: '+380991234567',
  role: 'CUSTOMER' as UserRole,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockAdminUser = {
  ...mockUser,
  id: 'admin-uuid-1',
  email: 'admin@example.com',
  role: 'ADMIN' as UserRole,
};

const mockDeactivatedUser = {
  ...mockUser,
  id: 'user-uuid-2',
  email: 'deactivated@example.com',
  isActive: false,
};

// ─── UserRepository mock ───────────────────────────────────────────────────────

const userRepositoryMock = {
  findById: jest.fn(),
  // TASK-476: every admin-facing read on this surface is customer-scoped, so the
  // staff half of the old user module cannot be reached through it. `findById`
  // survives for `/api/users/me`, which staff use too.
  findCustomerById: jest.fn(),
  findByEmail: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  activate: jest.fn(),
  softDelete: jest.fn(),
  // Admin customer card enrichment reads (TASK-252).
  getLtv: jest.fn(),
  getOrderCount: jest.fn(),
  getRecentOrders: jest.fn(),
  getReviewsByUserId: jest.fn(),
  getRedeemedCoupons: jest.fn(),
  getContactMessagesByEmail: jest.fn(),
};

// AuthRepository is injected into UserService so a ban can revoke all of the
// banned user's refresh tokens.
const authRepositoryMock = {
  revokeAllUserTokens: jest.fn(),
};

// ReviewService is injected so that banning an account also withdraws what it
// wrote (TASK-589). The check the owner asked for in decision 7(г) — «бан вже
// ховає відгуки, перевірити чи ховає оцінки» — measured that it hid NEITHER.
const reviewServiceMock = {
  hideAuthor: jest.fn(),
  unhideAuthor: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UserService', () => {
  let service: UserService;
  let repository: jest.Mocked<UserRepository>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: userRepositoryMock },
        { provide: AuthRepository, useValue: authRepositoryMock },
        { provide: ReviewService, useValue: reviewServiceMock },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get(UserRepository) as jest.Mocked<UserRepository>;
  });

  const ADMIN_ID = 'admin-uuid-1';

  /**
   * The caller, as `PermissionGuard` resolved them from the database (TASK-476).
   *
   * The service takes the whole actor now rather than just an id, because the
   * level rule needs `isOwner` and the role — and neither is in the JWT that used
   * to be the only thing these methods knew about their caller.
   */
  const adminActor = {
    id: ADMIN_ID,
    email: 'admin@example.com',
    role: 'ADMIN' as UserRole,
    isOwner: true,
    permissions: new Set<string>(),
  };

  // ─── getProfile ─────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return UserEntity when user is found', async () => {
      repository.findById.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-uuid-1');

      expect(result).toBeInstanceOf(UserEntity);
      expect(result.id).toBe('user-uuid-1');
      expect(result.email).toBe('test@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.phone).toBe('+380991234567');
      expect(result.role).toBe('CUSTOMER');
      expect(result.isActive).toBe(true);
      // Ensure sensitive fields are NOT present
      expect((result as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
      expect((result as unknown as Record<string, unknown>).refreshTokens).toBeUndefined();
      expect(repository.findById).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should throw NotFoundException when user is not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(repository.findById).toHaveBeenCalledWith('nonexistent-id');
    });
  });

  // ─── updateProfile ──────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    const updateDto: UpdateProfileDto = {
      firstName: 'Jane',
      phone: '+380997654321',
    };

    it('should update allowed fields and return UserEntity', async () => {
      const updatedUser = {
        ...mockUser,
        firstName: 'Jane',
        phone: '+380997654321',
        updatedAt: new Date('2026-05-05T12:00:00.000Z'),
      };
      repository.findById.mockResolvedValue(mockUser);
      repository.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile('user-uuid-1', updateDto);

      expect(result).toBeInstanceOf(UserEntity);
      expect(result.firstName).toBe('Jane');
      expect(result.phone).toBe('+380997654321');
      expect(repository.update).toHaveBeenCalledWith('user-uuid-1', {
        firstName: 'Jane',
        phone: '+380997654321',
      });
    });

    it('refuses to change the email address (TASK-372)', async () => {
      const dtoWithEmail: UpdateProfileDto = {
        email: 'someone-else@example.com',
      };

      repository.findById.mockResolvedValue(mockUser);

      await expect(service.updateProfile('user-uuid-1', dtoWithEmail)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('refuses the change WITHOUT looking the address up — no enumeration oracle', async () => {
      // The refusal must not depend on whether the address is taken: a 409 for
      // taken and a 400 for free would let anyone holding a token probe which
      // addresses hold an account. Both cases answer identically, and the
      // lookup that could tell them apart never runs.
      repository.findById.mockResolvedValue(mockUser);

      await expect(
        service.updateProfile('user-uuid-1', { email: 'free@example.com' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateProfile('user-uuid-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(BadRequestException);

      expect(repository.findByEmail).not.toHaveBeenCalled();
    });

    // Why an unchanged email is accepted rather than refused along with the rest:
    // a client that reads the profile and posts the whole object back is sending
    // the address it was given, not asking to change anything. Refusing that
    // would break honest callers to stop nothing.
    it('should allow user to keep their own email without conflict', async () => {
      const dtoWithSameEmail: UpdateProfileDto = {
        email: 'test@example.com', // same as mockUser.email
      };
      const updatedUser = {
        ...mockUser,
        updatedAt: new Date('2026-05-05T12:00:00.000Z'),
      };

      repository.findById.mockResolvedValue(mockUser);
      repository.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile('user-uuid-1', dtoWithSameEmail);

      expect(result).toBeInstanceOf(UserEntity);
      expect(repository.update).toHaveBeenCalledWith('user-uuid-1', {
        email: 'test@example.com',
      });
    });

    it('should not allow changing role through profile update', async () => {
      // The DTO does not have a role field, so we test that the service
      // only passes allowed fields to the repository
      const dto: UpdateProfileDto = {
        firstName: 'NewName',
      };
      const updatedUser = {
        ...mockUser,
        firstName: 'NewName',
      };

      repository.findById.mockResolvedValue(mockUser);
      repository.update.mockResolvedValue(updatedUser);

      await service.updateProfile('user-uuid-1', dto);

      // Verify the update call only contains safe fields (no role, no isActive)
      const updateInput = repository.update.mock.calls[0][1] as UpdateUserInput;
      expect(updateInput).not.toHaveProperty('role');
      expect(updateInput).not.toHaveProperty('isActive');
    });

    it('should throw NotFoundException when user is not found during update', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.updateProfile('nonexistent-id', updateDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  // ─── findAll (admin) ────────────────────────────────────────────────────────

  describe('findAll', () => {
    const query: UserListQueryDto = {
      page: 1,
      limit: 20,
    };

    const paginatedResult = {
      users: [mockUser, mockAdminUser],
      total: 2,
    };

    it('should return paginated results with meta', async () => {
      repository.findAll.mockResolvedValue(paginatedResult);

      const result = await service.findAll(query);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBeInstanceOf(UserEntity);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.totalPages).toBe(1);
      expect(repository.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        role: undefined,
        isActive: undefined,
        search: undefined,
      });
    });

    it('should calculate totalPages correctly for multiple pages', async () => {
      repository.findAll.mockResolvedValue({
        users: [mockUser],
        total: 42,
      });

      const result = await service.findAll({ ...query, limit: 20 });

      expect(result.meta.totalPages).toBe(3); // ceil(42/20) = 3
    });

    it('should pass filter parameters to repository', async () => {
      repository.findAll.mockResolvedValue({ users: [], total: 0 });

      const filterQuery: UserListQueryDto = {
        page: 2,
        limit: 10,
        role: UserRole.CUSTOMER,
        isActive: true,
        search: 'john',
      };

      await service.findAll(filterQuery);

      expect(repository.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        role: UserRole.CUSTOMER,
        isActive: true,
        search: 'john',
      });
    });

    it('forwards isActive: false unchanged to the repository (TASK-150 B5)', async () => {
      repository.findAll.mockResolvedValue({ users: [], total: 0 });

      await service.findAll({ page: 1, limit: 20, isActive: false });

      expect(repository.findAll).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    });
  });

  // ─── findById (admin) ───────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return UserEntity when user is found', async () => {
      repository.findCustomerById.mockResolvedValue(mockUser);

      const result = await service.findById('user-uuid-1');

      expect(result).toBeInstanceOf(UserEntity);
      expect(result.id).toBe('user-uuid-1');
      expect(result.email).toBe('test@example.com');
      expect(repository.findCustomerById).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should throw NotFoundException when user is not found', async () => {
      repository.findCustomerById.mockResolvedValue(null);

      await expect(service.findById('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(repository.findCustomerById).toHaveBeenCalledWith('nonexistent-id');
    });
  });

  // ─── getAdminCard (customer card, TASK-252) ───────────────────────────────────

  describe('getAdminCard', () => {
    const recentOrders = [
      {
        id: 'order-1',
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        total: 129.99,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const reviews = [
      {
        id: 'review-1',
        productId: 'prod-1',
        productName: 'iPhone 15 Pro Case',
        rating: 5,
        comment: 'Great!',
        textStatus: 'APPROVED',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const coupons = [
      {
        id: 'redemption-1',
        code: 'SUMMER20',
        type: 'PERCENT',
        value: 20,
        orderId: 'order-1',
        redeemedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const messages = [
      {
        id: 'message-1',
        name: 'John',
        phone: '+380991234567',
        email: 'test@example.com',
        topic: 'Order question',
        orderRef: null,
        message: 'When will my order ship?',
        status: 'NEW',
        adminNote: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    function stubEnrichmentReads() {
      repository.getLtv.mockResolvedValue(1299.5);
      repository.getOrderCount.mockResolvedValue(12);
      repository.getRecentOrders.mockResolvedValue(recentOrders as never);
      repository.getReviewsByUserId.mockResolvedValue(reviews as never);
      repository.getRedeemedCoupons.mockResolvedValue(coupons as never);
      repository.getContactMessagesByEmail.mockResolvedValue(messages as never);
    }

    it('throws NotFoundException and runs NO enrichment reads when the user is absent', async () => {
      repository.findCustomerById.mockResolvedValue(null);

      await expect(service.getAdminCard('missing')).rejects.toThrow(NotFoundException);

      // No wasted parallel work on a 404.
      expect(repository.getLtv).not.toHaveBeenCalled();
      expect(repository.getOrderCount).not.toHaveBeenCalled();
      expect(repository.getRecentOrders).not.toHaveBeenCalled();
      expect(repository.getReviewsByUserId).not.toHaveBeenCalled();
      expect(repository.getRedeemedCoupons).not.toHaveBeenCalled();
      expect(repository.getContactMessagesByEmail).not.toHaveBeenCalled();
    });

    it('calls all six enrichment reads with the correct arguments and assembles the card', async () => {
      repository.findCustomerById.mockResolvedValue(mockUser);
      stubEnrichmentReads();

      const result = await service.getAdminCard('user-uuid-1');

      expect(result).toBeInstanceOf(UserAdminCardEntity);
      expect(result.user).toBeInstanceOf(UserEntity);
      expect(result.user.id).toBe('user-uuid-1');
      // Sensitive fields must not leak through the nested user entity.
      expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined();

      expect(result.ltv).toBe(1299.5);
      expect(result.orderCount).toBe(12);
      expect(result.recentOrders).toEqual(recentOrders);
      expect(result.reviews).toEqual(reviews);
      expect(result.redeemedCoupons).toEqual(coupons);
      expect(result.contactMessages).toEqual([
        {
          id: 'message-1',
          topic: 'Order question',
          message: 'When will my order ship?',
          status: 'NEW',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      // Argument-shape assertions: userId for five reads, the user's email + limit
      // for the contact-message read.
      expect(repository.getLtv).toHaveBeenCalledWith('user-uuid-1');
      expect(repository.getOrderCount).toHaveBeenCalledWith('user-uuid-1');
      expect(repository.getRecentOrders).toHaveBeenCalledWith('user-uuid-1', 10);
      expect(repository.getReviewsByUserId).toHaveBeenCalledWith('user-uuid-1', 20);
      expect(repository.getRedeemedCoupons).toHaveBeenCalledWith('user-uuid-1', 20);
      expect(repository.getContactMessagesByEmail).toHaveBeenCalledWith('test@example.com', 20);
    });

    it('fans the six enrichment reads out in parallel (no waterfall)', async () => {
      repository.findCustomerById.mockResolvedValue(mockUser);

      // Each enrichment mock blocks until we release it. If the service awaited
      // them sequentially, only the first would be invoked before any resolves;
      // a parallel Promise.all invokes all six synchronously in the same tick.
      const releasers: Array<() => void> = [];
      const blocking = (value: unknown) =>
        jest.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              releasers.push(() => resolve(value));
            }),
        );

      repository.getLtv.mockImplementation(blocking(0));
      repository.getOrderCount.mockImplementation(blocking(0));
      repository.getRecentOrders.mockImplementation(blocking([]));
      repository.getReviewsByUserId.mockImplementation(blocking([]));
      repository.getRedeemedCoupons.mockImplementation(blocking([]));
      repository.getContactMessagesByEmail.mockImplementation(blocking([]));

      const promise = service.getAdminCard('user-uuid-1');

      // Let the synchronous portion of getAdminCard run up to the Promise.all.
      await Promise.resolve();

      // All six were invoked before ANY of them resolved — proving parallelism.
      expect(repository.getLtv).toHaveBeenCalledTimes(1);
      expect(repository.getOrderCount).toHaveBeenCalledTimes(1);
      expect(repository.getRecentOrders).toHaveBeenCalledTimes(1);
      expect(repository.getReviewsByUserId).toHaveBeenCalledTimes(1);
      expect(repository.getRedeemedCoupons).toHaveBeenCalledTimes(1);
      expect(repository.getContactMessagesByEmail).toHaveBeenCalledTimes(1);

      // Release all reads so the service can finish and we don't leak a pending promise.
      releasers.forEach((release) => release());
      await promise;
    });
  });

  // ─── deactivateUser ─────────────────────────────────────────────────────────

  describe('deactivateUser', () => {
    it('should set isActive to false and return UserEntity', async () => {
      repository.findCustomerById.mockResolvedValue(mockUser);
      repository.deactivate.mockResolvedValue(mockDeactivatedUser);

      const result = await service.deactivateUser('user-uuid-2', adminActor);

      expect(result).toBeInstanceOf(UserEntity);
      expect(result.isActive).toBe(false);
      expect(repository.findCustomerById).toHaveBeenCalledWith('user-uuid-2');
      expect(repository.deactivate).toHaveBeenCalledWith('user-uuid-2');
    });

    it('should revoke all of the banned user refresh tokens after deactivation', async () => {
      repository.findCustomerById.mockResolvedValue(mockUser);
      repository.deactivate.mockResolvedValue(mockDeactivatedUser);

      await service.deactivateUser('user-uuid-2', adminActor);

      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('user-uuid-2');
    });

    it('should revoke tokens even when the user is already deactivated (idempotent re-ban)', async () => {
      repository.findCustomerById.mockResolvedValue(mockDeactivatedUser);
      repository.deactivate.mockResolvedValue(mockDeactivatedUser);

      await service.deactivateUser('user-uuid-2', adminActor);

      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('user-uuid-2');
    });

    it('should throw ForbiddenException when an admin tries to deactivate their own account', async () => {
      await expect(service.deactivateUser(ADMIN_ID, adminActor)).rejects.toThrow(
        new ForbiddenException('Cannot deactivate your own account'),
      );

      expect(repository.findCustomerById).not.toHaveBeenCalled();
      expect(repository.deactivate).not.toHaveBeenCalled();
      expect(authRepositoryMock.revokeAllUserTokens).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user is not found', async () => {
      repository.findCustomerById.mockResolvedValue(null);

      await expect(service.deactivateUser('nonexistent-id', adminActor)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.deactivate).not.toHaveBeenCalled();
    });

    // TASK-589, answering the owner's 7(г). A ban used to leave the banned
    // account's reviews on the storefront AND its ratings in every average — so
    // the one action an operator reaches for against an abuser did nothing at all
    // about what the abuser wrote. The account could not log in; its words and
    // its one-star scores stayed exactly where they were.
    it('withdraws the banned account’s reviews and ratings as well as its sessions', async () => {
      repository.findCustomerById.mockResolvedValue(mockUser);
      repository.deactivate.mockResolvedValue(mockDeactivatedUser);

      await service.deactivateUser('user-uuid-2', adminActor);

      expect(reviewServiceMock.hideAuthor).toHaveBeenCalledWith('user-uuid-2');
    });

    it('does not touch the reviews of an account it refused to ban', async () => {
      repository.findCustomerById.mockResolvedValue(null);

      await expect(service.deactivateUser('nonexistent-id', adminActor)).rejects.toThrow(
        NotFoundException,
      );
      expect(reviewServiceMock.hideAuthor).not.toHaveBeenCalled();
    });
  });

  // ─── activateUser ───────────────────────────────────────────────────────────

  describe('activateUser', () => {
    it('should set isActive to true and return UserEntity', async () => {
      repository.findCustomerById.mockResolvedValue(mockDeactivatedUser);
      repository.activate.mockResolvedValue({
        ...mockDeactivatedUser,
        isActive: true,
      });

      const result = await service.activateUser('user-uuid-2', adminActor);

      expect(result).toBeInstanceOf(UserEntity);
      expect(result.isActive).toBe(true);
      expect(repository.findCustomerById).toHaveBeenCalledWith('user-uuid-2');
      expect(repository.activate).toHaveBeenCalledWith('user-uuid-2');
    });

    it('should throw NotFoundException when user is not found', async () => {
      repository.findCustomerById.mockResolvedValue(null);

      await expect(service.activateUser('nonexistent-id', adminActor)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.activate).not.toHaveBeenCalled();
    });

    it('gives a restored account its reviews back', async () => {
      // The mirror of the ban. Un-banning without this leaves the account able to
      // log in and post while everything it wrote before stays invisible — a
      // half-lifted punishment nobody can see the shape of.
      repository.findCustomerById.mockResolvedValue(mockDeactivatedUser);
      repository.activate.mockResolvedValue({ ...mockDeactivatedUser, isActive: true });

      await service.activateUser('user-uuid-2', adminActor);

      expect(reviewServiceMock.unhideAuthor).toHaveBeenCalledWith('user-uuid-2');
    });
  });

  // ─── deleteUser (soft-delete, TASK-104) ──────────────────────────────────────

  describe('deleteUser', () => {
    it('should soft-delete with a mangled email, preserve the original, and revoke tokens', async () => {
      repository.findCustomerById.mockResolvedValue(mockUser);
      repository.softDelete.mockResolvedValue({
        ...mockUser,
        email: `deleted:${mockUser.id}:${mockUser.email}`,
        isActive: false,
      });

      const result = await service.deleteUser('user-uuid-1', adminActor);

      expect(repository.softDelete).toHaveBeenCalledWith(
        'user-uuid-1',
        `deleted:${mockUser.id}:${mockUser.email}`,
        mockUser.email,
      );
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toBeInstanceOf(UserEntity);
    });

    it('should throw ForbiddenException when an admin deletes their own account', async () => {
      await expect(service.deleteUser('admin-uuid-1', adminActor)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the user does not exist', async () => {
      repository.findCustomerById.mockResolvedValue(null);

      await expect(service.deleteUser('missing', adminActor)).rejects.toThrow(NotFoundException);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('should not expose deletedAt or originalEmail on the returned entity', async () => {
      repository.findCustomerById.mockResolvedValue(mockUser);
      repository.softDelete.mockResolvedValue({
        ...mockUser,
        email: `deleted:${mockUser.id}:${mockUser.email}`,
        isActive: false,
        deletedAt: new Date(),
        originalEmail: mockUser.email,
      });

      const result = await service.deleteUser('user-uuid-1', adminActor);

      expect(result).not.toHaveProperty('deletedAt');
      expect(result).not.toHaveProperty('originalEmail');
    });
  });

  // ─── The customer scope of this surface (TASK-476) ──────────────────────────
  //
  // `createUser`, `setUserPassword`, `updateUserRole` and the last-admin guard
  // used to be tested here. They moved to `staff.service.spec.ts` with the code,
  // and the last-admin guard is gone entirely: the level rule replaces it with a
  // stronger invariant (the owner cannot be removed AT ALL), proved in
  // `access-level.spec.ts` and `staff.service.spec.ts`.
  //
  // What is tested here instead is the property that makes this module safe to
  // leave under `customers:read` / `customers:write`: a service account is not
  // reachable through any of it.

  describe('the customer scope', () => {
    it('reads, bans and deletes through the CUSTOMER-scoped lookup, never the bare one', async () => {
      repository.findCustomerById.mockResolvedValue(mockUser);
      repository.deactivate.mockResolvedValue(mockDeactivatedUser);
      repository.activate.mockResolvedValue(mockUser);
      repository.softDelete.mockResolvedValue({ ...mockUser, isActive: false });

      await service.findById('user-uuid-1');
      await service.deactivateUser('user-uuid-1', adminActor);
      await service.activateUser('user-uuid-1', adminActor);
      await service.deleteUser('user-uuid-1', adminActor);

      // `findById` is reserved for `/api/users/me`, which staff use too. If an
      // admin-facing method reaches for it, the staff/customer split has a hole.
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.findCustomerById).toHaveBeenCalledTimes(4);
    });

    it('answers 404 — not 403 — for a service account on every admin-facing door', async () => {
      // A staff row simply does not resolve here, so the answer is identical to
      // "no such id". Anything else would let a `customers:read` holder probe for
      // administrators one request at a time.
      repository.findCustomerById.mockResolvedValue(null);

      // Somebody else's staff account, so the self-targeting guards are not what
      // produces the refusal.
      const staffId = 'manager-uuid-9';

      await expect(service.findById(staffId)).rejects.toThrow(NotFoundException);
      await expect(service.getAdminCard(staffId)).rejects.toThrow(NotFoundException);
      await expect(service.deactivateUser(staffId, adminActor)).rejects.toThrow(NotFoundException);
      await expect(service.activateUser(staffId, adminActor)).rejects.toThrow(NotFoundException);
      await expect(service.deleteUser(staffId, adminActor)).rejects.toThrow(NotFoundException);

      expect(repository.deactivate).not.toHaveBeenCalled();
      expect(repository.activate).not.toHaveBeenCalled();
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('leaves /api/users/me on the unscoped lookup so staff can read their own profile', async () => {
      repository.findById.mockResolvedValue(mockAdminUser);

      const profile = await service.getProfile(mockAdminUser.id);

      expect(profile.role).toBe('ADMIN');
      expect(repository.findCustomerById).not.toHaveBeenCalled();
    });
  });
});
