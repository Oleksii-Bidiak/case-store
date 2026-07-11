import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, SlugRedirectEntity } from '@prisma/client';
import { PrismaService } from '../prisma';
import { SlugRedirectRepository } from './slug-redirect.repository';

/**
 * Unit spec for the thin DB executor (TASK-285-C). Asserts `recordRename`
 * issues exactly the 3 documented statements, in order, with the exact
 * where/data shapes — NOT the algorithm's correctness (that is the pure
 * reducer's exhaustively-tested job; the int-spec proves the statements
 * against real Postgres).
 */
describe('SlugRedirectRepository', () => {
  let repository: SlugRedirectRepository;

  const mockPrisma = {
    slugRedirect: {
      findUnique: jest.fn(),
    },
  };

  const makeTx = () => {
    const calls: string[] = [];
    const tx = {
      slugRedirect: {
        upsert: jest.fn().mockImplementation(() => {
          calls.push('upsert');
          return Promise.resolve({});
        }),
        updateMany: jest.fn().mockImplementation(() => {
          calls.push('updateMany');
          return Promise.resolve({ count: 0 });
        }),
        deleteMany: jest.fn().mockImplementation(() => {
          calls.push('deleteMany');
          return Promise.resolve({ count: 0 });
        }),
      },
    };
    return { tx: tx as unknown as Prisma.TransactionClient, raw: tx, calls };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SlugRedirectRepository, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    repository = module.get(SlugRedirectRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findRedirect', () => {
    it('reads the (entity, oldSlug) unique key and returns the row', async () => {
      const row = {
        id: 'id-1',
        entity: SlugRedirectEntity.PAGE,
        oldSlug: 'old',
        newSlug: 'new',
      };
      mockPrisma.slugRedirect.findUnique.mockResolvedValue(row);

      const result = await repository.findRedirect(SlugRedirectEntity.PAGE, 'old');

      expect(mockPrisma.slugRedirect.findUnique).toHaveBeenCalledWith({
        where: { entity_oldSlug: { entity: SlugRedirectEntity.PAGE, oldSlug: 'old' } },
      });
      expect(result).toBe(row);
    });

    it('returns null when no redirect row exists', async () => {
      mockPrisma.slugRedirect.findUnique.mockResolvedValue(null);

      await expect(
        repository.findRedirect(SlugRedirectEntity.PRODUCT, 'missing'),
      ).resolves.toBeNull();
    });
  });

  describe('recordRename', () => {
    it('issues exactly upsert → updateMany → deleteMany, in order, on the supplied tx', async () => {
      const { tx, raw, calls } = makeTx();

      await repository.recordRename(tx, SlugRedirectEntity.BLOG_POST, 'from-slug', 'to-slug');

      expect(calls).toEqual(['upsert', 'updateMany', 'deleteMany']);
      expect(raw.slugRedirect.upsert).toHaveBeenCalledTimes(1);
      expect(raw.slugRedirect.updateMany).toHaveBeenCalledTimes(1);
      expect(raw.slugRedirect.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('step 1 upserts (entity, oldSlug: from) → newSlug: to', async () => {
      const { tx, raw } = makeTx();

      await repository.recordRename(tx, SlugRedirectEntity.PAGE, 'B', 'C');

      expect(raw.slugRedirect.upsert).toHaveBeenCalledWith({
        where: { entity_oldSlug: { entity: SlugRedirectEntity.PAGE, oldSlug: 'B' } },
        create: { entity: SlugRedirectEntity.PAGE, oldSlug: 'B', newSlug: 'C' },
        update: { newSlug: 'C' },
      });
    });

    it('step 2 repoints every OTHER row of this entity pointing at from', async () => {
      const { tx, raw } = makeTx();

      await repository.recordRename(tx, SlugRedirectEntity.CATEGORY, 'B', 'C');

      expect(raw.slugRedirect.updateMany).toHaveBeenCalledWith({
        where: { entity: SlugRedirectEntity.CATEGORY, newSlug: 'B', oldSlug: { not: 'B' } },
        data: { newSlug: 'C' },
      });
    });

    it('step 3 deletes the (oldSlug: to, newSlug: to) self-loop for this entity', async () => {
      const { tx, raw } = makeTx();

      await repository.recordRename(tx, SlugRedirectEntity.PRODUCT, 'B', 'C');

      expect(raw.slugRedirect.deleteMany).toHaveBeenCalledWith({
        where: { entity: SlugRedirectEntity.PRODUCT, oldSlug: 'C', newSlug: 'C' },
      });
    });

    it('never touches the non-transactional prisma client', async () => {
      const { tx } = makeTx();

      await repository.recordRename(tx, SlugRedirectEntity.PAGE, 'B', 'C');

      expect(mockPrisma.slugRedirect.findUnique).not.toHaveBeenCalled();
    });
  });
});
