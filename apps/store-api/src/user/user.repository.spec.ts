import { UserRepository } from './user.repository';
import { PrismaService } from '../prisma';

// ─── Mock PrismaService ──────────────────────────────────────────────────────

const prismaMock = {
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

describe('UserRepository (soft-delete behaviour)', () => {
  let repository: UserRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new UserRepository(prismaMock as unknown as PrismaService);
  });

  describe('findById', () => {
    it('should exclude soft-deleted users via deletedAt: null', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await repository.findById('user-1');

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', deletedAt: null },
      });
    });
  });

  describe('findByEmail', () => {
    it('should exclude soft-deleted users', async () => {
      prismaMock.user.findFirst.mockResolvedValue(null);

      await repository.findByEmail('user@example.com');

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'user@example.com', deletedAt: null },
      });
    });
  });

  describe('findAll', () => {
    it('should always constrain the where clause with deletedAt: null', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      const findManyArgs = prismaMock.user.findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual(expect.objectContaining({ deletedAt: null }));
      const countArgs = prismaMock.user.count.mock.calls[0][0];
      expect(countArgs.where).toEqual(expect.objectContaining({ deletedAt: null }));
    });
  });

  describe('softDelete', () => {
    it('should stamp deletedAt, disable the user, mangle email, and store originalEmail', async () => {
      prismaMock.user.update.mockResolvedValue({ id: 'user-1' });

      await repository.softDelete('user-1', 'deleted:user-1:user@example.com', 'user@example.com');

      const updateArgs = prismaMock.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'user-1' });
      expect(updateArgs.data.isActive).toBe(false);
      expect(updateArgs.data.email).toBe('deleted:user-1:user@example.com');
      expect(updateArgs.data.originalEmail).toBe('user@example.com');
      expect(updateArgs.data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
