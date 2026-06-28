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

    it('defaults to createdAt desc when no sort is provided (TASK-147)', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      expect(prismaMock.user.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'desc',
      });
    });

    it('sorts by an allow-listed field + order (TASK-147)', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        sortBy: 'email',
        sortOrder: 'asc',
      });

      expect(prismaMock.user.findMany.mock.calls[0][0].orderBy).toEqual({
        email: 'asc',
      });
    });

    it('falls back to createdAt for an unknown sort field (TASK-147)', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({
        page: 1,
        limit: 20,
        sortBy: "name'; DROP TABLE users;--",
        sortOrder: 'asc',
      });

      expect(prismaMock.user.findMany.mock.calls[0][0].orderBy).toEqual({
        createdAt: 'asc',
      });
    });

    // ── isActive filter (TASK-150 B5) ──
    it('constrains where.isActive to true when isActive: true', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, isActive: true });

      expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ isActive: true, deletedAt: null }),
      );
      expect(prismaMock.user.count.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('constrains where.isActive to false when isActive: false', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20, isActive: false });

      expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ isActive: false, deletedAt: null }),
      );
    });

    it('omits where.isActive entirely when isActive is undefined (all statuses)', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await repository.findAll({ page: 1, limit: 20 });

      expect(prismaMock.user.findMany.mock.calls[0][0].where).not.toHaveProperty('isActive');
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
