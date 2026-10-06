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
 *
 * TASK-566: rows are keyed by ADDRESS — `(scope, slug)` on each side. A bare
 * slug is the empty scope, which is what every single-namespace entity uses.
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
    it('reads the (entity, scope, oldSlug) unique key in the empty scope by default', async () => {
      const row = {
        id: 'id-1',
        entity: SlugRedirectEntity.PAGE,
        scope: '',
        oldSlug: 'old',
        newScope: '',
        newSlug: 'new',
      };
      mockPrisma.slugRedirect.findUnique.mockResolvedValue(row);

      const result = await repository.findRedirect(SlugRedirectEntity.PAGE, 'old');

      expect(mockPrisma.slugRedirect.findUnique).toHaveBeenCalledWith({
        where: {
          entity_scope_oldSlug: { entity: SlugRedirectEntity.PAGE, scope: '', oldSlug: 'old' },
        },
      });
      expect(result).toBe(row);
    });

    it('reads a namespaced address when a scope is given (TASK-566)', async () => {
      mockPrisma.slugRedirect.findUnique.mockResolvedValue(null);

      await repository.findRedirect(SlugRedirectEntity.PAGE, 'delivery', 'INFO');

      expect(mockPrisma.slugRedirect.findUnique).toHaveBeenCalledWith({
        where: {
          entity_scope_oldSlug: {
            entity: SlugRedirectEntity.PAGE,
            scope: 'INFO',
            oldSlug: 'delivery',
          },
        },
      });
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

    it('step 1 upserts (entity, scope, oldSlug: from) → to, a bare slug in the empty scope', async () => {
      const { tx, raw } = makeTx();

      await repository.recordRename(tx, SlugRedirectEntity.PAGE, 'B', 'C');

      expect(raw.slugRedirect.upsert).toHaveBeenCalledWith({
        where: {
          entity_scope_oldSlug: { entity: SlugRedirectEntity.PAGE, scope: '', oldSlug: 'B' },
        },
        create: {
          entity: SlugRedirectEntity.PAGE,
          scope: '',
          oldSlug: 'B',
          newScope: '',
          newSlug: 'C',
        },
        update: { newScope: '', newSlug: 'C' },
      });
    });

    it('step 2 repoints every OTHER row of this entity pointing at from', async () => {
      const { tx, raw } = makeTx();

      await repository.recordRename(tx, SlugRedirectEntity.CATEGORY, 'B', 'C');

      expect(raw.slugRedirect.updateMany).toHaveBeenCalledWith({
        where: {
          entity: SlugRedirectEntity.CATEGORY,
          newScope: '',
          newSlug: 'B',
          NOT: { scope: '', oldSlug: 'B' },
        },
        data: { newScope: '', newSlug: 'C' },
      });
    });

    it('step 3 deletes the (to → to) self-loop for this entity', async () => {
      const { tx, raw } = makeTx();

      await repository.recordRename(tx, SlugRedirectEntity.PRODUCT, 'B', 'C');

      expect(raw.slugRedirect.deleteMany).toHaveBeenCalledWith({
        where: {
          entity: SlugRedirectEntity.PRODUCT,
          scope: '',
          oldSlug: 'C',
          newScope: '',
          newSlug: 'C',
        },
      });
    });

    it('records a rename between two namespaced addresses (TASK-566)', async () => {
      const { tx, raw } = makeTx();

      await repository.recordRename(
        tx,
        SlugRedirectEntity.PAGE,
        { scope: 'LEGAL', slug: 'delivery' },
        { scope: 'INFO', slug: 'delivery' },
      );

      expect(raw.slugRedirect.upsert).toHaveBeenCalledWith({
        where: {
          entity_scope_oldSlug: {
            entity: SlugRedirectEntity.PAGE,
            scope: 'LEGAL',
            oldSlug: 'delivery',
          },
        },
        create: {
          entity: SlugRedirectEntity.PAGE,
          scope: 'LEGAL',
          oldSlug: 'delivery',
          newScope: 'INFO',
          newSlug: 'delivery',
        },
        update: { newScope: 'INFO', newSlug: 'delivery' },
      });
      // The collapse repoints aliases of the LEGAL address only — an INFO page
      // that happens to share the slug keeps its own aliases.
      expect(raw.slugRedirect.updateMany).toHaveBeenCalledWith({
        where: {
          entity: SlugRedirectEntity.PAGE,
          newScope: 'LEGAL',
          newSlug: 'delivery',
          NOT: { scope: 'LEGAL', oldSlug: 'delivery' },
        },
        data: { newScope: 'INFO', newSlug: 'delivery' },
      });
      expect(raw.slugRedirect.deleteMany).toHaveBeenCalledWith({
        where: {
          entity: SlugRedirectEntity.PAGE,
          scope: 'INFO',
          oldSlug: 'delivery',
          newScope: 'INFO',
          newSlug: 'delivery',
        },
      });
    });

    it('writes nothing when the address does not change', async () => {
      const { tx, calls } = makeTx();

      await repository.recordRename(
        tx,
        SlugRedirectEntity.PAGE,
        { scope: 'INFO', slug: 'x' },
        { scope: 'INFO', slug: 'x' },
      );

      expect(calls).toEqual([]);
    });

    it('never touches the non-transactional prisma client', async () => {
      const { tx } = makeTx();

      await repository.recordRename(tx, SlugRedirectEntity.PAGE, 'B', 'C');

      expect(mockPrisma.slugRedirect.findUnique).not.toHaveBeenCalled();
    });
  });

  // ─── recordRestoreRename (TASK-1828) ─────────────────────────────────────────

  describe('recordRestoreRename', () => {
    const deletedAt = new Date('2026-09-01T10:00:00.000Z');

    const makeRestoreTx = () => {
      const made = makeTx();
      const createMany = jest.fn().mockImplementation(() => {
        made.calls.push('createMany');
        return Promise.resolve({ count: 1 });
      });
      Object.assign(made.raw.slugRedirect, { createMany });
      return { ...made, createMany };
    };

    it('repoints only the aliases written while the native address was ours, then N → M, then the self-loop', async () => {
      const { tx, raw, calls, createMany } = makeRestoreTx();

      await repository.recordRestoreRename(tx, SlugRedirectEntity.PRODUCT, 'native', 'fresh', {
        deletedAt,
        redirectFrom: true,
      });

      expect(calls).toEqual(['updateMany', 'createMany', 'deleteMany']);
      expect(raw.slugRedirect.updateMany).toHaveBeenCalledWith({
        where: {
          entity: SlugRedirectEntity.PRODUCT,
          newScope: '',
          newSlug: 'native',
          updatedAt: { lte: deletedAt },
        },
        data: { newScope: '', newSlug: 'fresh' },
      });
      // Insert-only: a row a later holder of the native address wrote is theirs.
      expect(createMany).toHaveBeenCalledWith({
        data: [
          {
            entity: SlugRedirectEntity.PRODUCT,
            scope: '',
            oldSlug: 'native',
            newScope: '',
            newSlug: 'fresh',
          },
        ],
        skipDuplicates: true,
      });
      expect(raw.slugRedirect.deleteMany).toHaveBeenCalledWith({
        where: {
          entity: SlugRedirectEntity.PRODUCT,
          scope: '',
          oldSlug: 'fresh',
          newScope: '',
          newSlug: 'fresh',
        },
      });
      expect(raw.slugRedirect.upsert).not.toHaveBeenCalled();
    });

    it('does not redirect a native address someone else now lives on', async () => {
      const { tx, calls } = makeRestoreTx();

      await repository.recordRestoreRename(tx, SlugRedirectEntity.PRODUCT, 'native', 'fresh', {
        deletedAt,
        redirectFrom: false,
      });

      expect(calls).toEqual(['updateMany', 'deleteMany']);
    });

    it('writes nothing when the product comes back on its native address', async () => {
      const { tx, calls } = makeRestoreTx();

      await repository.recordRestoreRename(tx, SlugRedirectEntity.PRODUCT, 'native', 'native', {
        deletedAt,
        redirectFrom: true,
      });

      expect(calls).toEqual([]);
    });
  });
});
