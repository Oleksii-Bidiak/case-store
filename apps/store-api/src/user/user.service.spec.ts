import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UserRepository, UpdateUserInput } from './user.repository';
import { UserService } from './user.service';
import { UserEntity, UserAdminCardEntity } from './entities';
import { UpdateProfileDto, UserListQueryDto } from './dto';
import { AuthRepository } from '../auth/auth.repository';

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
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get(UserRepository) as jest.Mocked<UserRepository>;
  });

  const ADMIN_ID = 'admin-uuid-1';

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

    it('should throw ConflictException when email is already taken by another user', async () => {
      const dtoWithEmail: UpdateProfileDto = {
        email: 'taken@example.com',
      };
      const existingOtherUser = {
        ...mockUser,
        id: 'other-user-id',
        email: 'taken@example.com',
      };

      repository.findById.mockResolvedValue(mockUser);
      repository.findByEmail.mockResolvedValue(existingOtherUser);

      await expect(service.updateProfile('user-uuid-1', dtoWithEmail)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('should allow user to keep their own email without conflict', async () => {
      const dtoWithSameEmail: UpdateProfileDto = {
        email: 'test@example.com', // same as mockUser.email
      };
      const updatedUser = {
        ...mockUser,
        updatedAt: new Date('2026-05-05T12:00:00.000Z'),
      };

      repository.findById.mockResolvedValue(mockUser);
      repository.findByEmail.mockResolvedValue(mockUser); // same user
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
      repository.findById.mockResolvedValue(mockUser);

      const result = await service.findById('user-uuid-1');

      expect(result).toBeInstanceOf(UserEntity);
      expect(result.id).toBe('user-uuid-1');
      expect(result.email).toBe('test@example.com');
      expect(repository.findById).toHaveBeenCalledWith('user-uuid-1');
    });

    it('should throw NotFoundException when user is not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(repository.findById).toHaveBeenCalledWith('nonexistent-id');
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
        isActive: true,
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
      repository.findById.mockResolvedValue(null);

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
      repository.findById.mockResolvedValue(mockUser);
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
      repository.findById.mockResolvedValue(mockUser);

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
      repository.findById.mockResolvedValue(mockUser);
      repository.deactivate.mockResolvedValue(mockDeactivatedUser);

      const result = await service.deactivateUser('user-uuid-2', ADMIN_ID);

      expect(result).toBeInstanceOf(UserEntity);
      expect(result.isActive).toBe(false);
      expect(repository.findById).toHaveBeenCalledWith('user-uuid-2');
      expect(repository.deactivate).toHaveBeenCalledWith('user-uuid-2');
    });

    it('should revoke all of the banned user refresh tokens after deactivation', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.deactivate.mockResolvedValue(mockDeactivatedUser);

      await service.deactivateUser('user-uuid-2', ADMIN_ID);

      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('user-uuid-2');
    });

    it('should revoke tokens even when the user is already deactivated (idempotent re-ban)', async () => {
      repository.findById.mockResolvedValue(mockDeactivatedUser);
      repository.deactivate.mockResolvedValue(mockDeactivatedUser);

      await service.deactivateUser('user-uuid-2', ADMIN_ID);

      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('user-uuid-2');
    });

    it('should throw ForbiddenException when an admin tries to deactivate their own account', async () => {
      await expect(service.deactivateUser(ADMIN_ID, ADMIN_ID)).rejects.toThrow(
        new ForbiddenException('Cannot deactivate your own account'),
      );

      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.deactivate).not.toHaveBeenCalled();
      expect(authRepositoryMock.revokeAllUserTokens).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user is not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.deactivateUser('nonexistent-id', ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.deactivate).not.toHaveBeenCalled();
    });
  });

  // ─── activateUser ───────────────────────────────────────────────────────────

  describe('activateUser', () => {
    it('should set isActive to true and return UserEntity', async () => {
      repository.findById.mockResolvedValue(mockDeactivatedUser);
      repository.activate.mockResolvedValue({
        ...mockDeactivatedUser,
        isActive: true,
      });

      const result = await service.activateUser('user-uuid-2');

      expect(result).toBeInstanceOf(UserEntity);
      expect(result.isActive).toBe(true);
      expect(repository.findById).toHaveBeenCalledWith('user-uuid-2');
      expect(repository.activate).toHaveBeenCalledWith('user-uuid-2');
    });

    it('should throw NotFoundException when user is not found', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.activateUser('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(repository.activate).not.toHaveBeenCalled();
    });
  });

  // ─── deleteUser (soft-delete, TASK-104) ──────────────────────────────────────

  describe('deleteUser', () => {
    it('should soft-delete with a mangled email, preserve the original, and revoke tokens', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.softDelete.mockResolvedValue({
        ...mockUser,
        email: `deleted:${mockUser.id}:${mockUser.email}`,
        isActive: false,
      });

      const result = await service.deleteUser('user-uuid-1', 'admin-uuid-1');

      expect(repository.softDelete).toHaveBeenCalledWith(
        'user-uuid-1',
        `deleted:${mockUser.id}:${mockUser.email}`,
        mockUser.email,
      );
      expect(authRepositoryMock.revokeAllUserTokens).toHaveBeenCalledWith('user-uuid-1');
      expect(result).toBeInstanceOf(UserEntity);
    });

    it('should throw ForbiddenException when an admin deletes their own account', async () => {
      await expect(service.deleteUser('admin-uuid-1', 'admin-uuid-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when the user does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.deleteUser('missing', 'admin-uuid-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('should not expose deletedAt or originalEmail on the returned entity', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.softDelete.mockResolvedValue({
        ...mockUser,
        email: `deleted:${mockUser.id}:${mockUser.email}`,
        isActive: false,
        deletedAt: new Date(),
        originalEmail: mockUser.email,
      });

      const result = await service.deleteUser('user-uuid-1', 'admin-uuid-1');

      expect(result).not.toHaveProperty('deletedAt');
      expect(result).not.toHaveProperty('originalEmail');
    });
  });
});
