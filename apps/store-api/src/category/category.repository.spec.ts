import { Test, TestingModule } from '@nestjs/testing';
import { CategoryRepository } from './category.repository';
import { PrismaService } from '../prisma';

/**
 * Unit tests for the recursive traversal helpers added in TASK-236
 * (`findSubtreeIds` / `findAncestorIds`). Prisma's `$queryRaw` is mocked, so
 * these cover the JS wrapper contract — self-id inclusion, de-duplication, and
 * the graceful non-existent-id fallback. The SQL correctness itself (siblings
 * must not leak, real recursion at depth) is proven end-to-end against a real
 * Postgres tree in `test/category.repository.int-spec.ts`.
 */
describe('CategoryRepository — subtree/ancestor traversal (TASK-236)', () => {
  let repo: CategoryRepository;
  const queryRaw = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRepository,
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();
    repo = module.get(CategoryRepository);
  });

  describe('findSubtreeIds', () => {
    it('returns self + all descendant ids for a 3-level tree', async () => {
      // root → child → grandchild (as the recursive CTE would yield)
      queryRaw.mockResolvedValue([{ id: 'root' }, { id: 'child' }, { id: 'grandchild' }]);

      const ids = await repo.findSubtreeIds('root');

      expect(new Set(ids)).toEqual(new Set(['root', 'child', 'grandchild']));
    });

    it('returns [categoryId] for a leaf with no children', async () => {
      queryRaw.mockResolvedValue([{ id: 'leaf' }]);

      expect(await repo.findSubtreeIds('leaf')).toEqual(['leaf']);
    });

    it('returns [categoryId] (no throw) for a non-existent category', async () => {
      // The CTE base row is empty when the id does not exist.
      queryRaw.mockResolvedValue([]);

      expect(await repo.findSubtreeIds('ghost')).toEqual(['ghost']);
    });

    it('de-duplicates and always includes the self id', async () => {
      queryRaw.mockResolvedValue([{ id: 'root' }, { id: 'child' }, { id: 'root' }]);

      const ids = await repo.findSubtreeIds('root');

      expect(ids).toHaveLength(2);
      expect(new Set(ids)).toEqual(new Set(['root', 'child']));
    });
  });

  describe('findAncestorIds', () => {
    it('returns self + all ancestor ids up to the root', async () => {
      queryRaw.mockResolvedValue([{ id: 'grandchild' }, { id: 'child' }, { id: 'root' }]);

      const ids = await repo.findAncestorIds('grandchild');

      expect(new Set(ids)).toEqual(new Set(['grandchild', 'child', 'root']));
    });

    it('returns [categoryId] for a root category (no parent)', async () => {
      queryRaw.mockResolvedValue([{ id: 'root' }]);

      expect(await repo.findAncestorIds('root')).toEqual(['root']);
    });

    it('returns [categoryId] (no throw) for a non-existent category', async () => {
      queryRaw.mockResolvedValue([]);

      expect(await repo.findAncestorIds('ghost')).toEqual(['ghost']);
    });
  });
});
