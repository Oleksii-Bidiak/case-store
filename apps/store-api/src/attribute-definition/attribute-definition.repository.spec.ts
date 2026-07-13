import { Test, TestingModule } from '@nestjs/testing';
import { AttributeType } from '@prisma/client';
import { AttributeDefinitionRepository } from './attribute-definition.repository';
import { PrismaService } from '../prisma';
import { CategoryRepository } from '../category';
import {
  ReorderDuplicateIdError,
  ReorderNotFoundError,
  ReorderStaleError,
} from '../common/reorder';

/**
 * Unit tests for the effective-definition resolution (TASK-191-B) and for the shared FLAT
 * reorder recipe this repository was moved onto (TASK-298). Prisma and CategoryRepository are
 * mocked, so these cover the JS-side logic — the leaf-overrides-ancestor rule for a same-`key`
 * collision, the append-on-create default, and the reorder's lock + validate + write sequence.
 */
describe('AttributeDefinitionRepository', () => {
  let repo: AttributeDefinitionRepository;

  const defFindMany = jest.fn();
  const catFindMany = jest.fn();
  const findAncestorIds = jest.fn();

  /**
   * ONE attributeDefinition delegate shared by the singleton and the transaction client:
   * `create` and `reorder` write through `tx.attributeDefinition`, the plain reads through
   * `this.prisma.attributeDefinition`, and the assertions do not care which.
   */
  const attributeDefinitionDelegate = {
    findMany: defFindMany,
    findUnique: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };

  const txMock = {
    attributeDefinition: attributeDefinitionDelegate,
    // `pg_advisory_xact_lock` — taken by `create` and by `reorder`.
    $executeRaw: jest.fn(),
  };

  const prismaMock = {
    attributeDefinition: attributeDefinitionDelegate,
    category: { findMany: catFindMany },
    productAttributeValue: { findMany: jest.fn() },
    $transaction: jest.fn((cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
  };

  const makeDef = (over: Partial<Record<string, unknown>>) => ({
    id: 'id',
    categoryId: 'cat',
    key: 'material',
    label: 'Material',
    type: AttributeType.TEXT,
    unit: null,
    options: null,
    isFilterable: false,
    sortOrder: 0,
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttributeDefinitionRepository,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CategoryRepository, useValue: { findAncestorIds } },
      ],
    }).compile();
    repo = module.get(AttributeDefinitionRepository);
  });

  // ─── findEffectiveForCategory (TASK-191-B) ──────────────────────────────────

  describe('findEffectiveForCategory', () => {
    it('returns own + ancestor definitions, with the deepest category winning a key collision', async () => {
      // Tree: grandparent(gp) → parent(p) → leaf. Query is on `leaf`.
      findAncestorIds.mockResolvedValue(['leaf', 'p', 'gp']);
      catFindMany.mockResolvedValue([
        { id: 'leaf', parentId: 'p' },
        { id: 'p', parentId: 'gp' },
        { id: 'gp', parentId: null },
      ]);
      // gp defines `material` (label "GP Material"); leaf overrides `material`
      // (label "Leaf Material"); p defines a distinct `color`.
      defFindMany.mockResolvedValue([
        makeDef({ id: 'd-gp', categoryId: 'gp', key: 'material', label: 'GP Material' }),
        makeDef({ id: 'd-leaf', categoryId: 'leaf', key: 'material', label: 'Leaf Material' }),
        makeDef({ id: 'd-p', categoryId: 'p', key: 'color', label: 'Color', sortOrder: 1 }),
      ]);

      const result = await repo.findEffectiveForCategory('leaf');

      const material = result.find((d) => d.key === 'material');
      const color = result.find((d) => d.key === 'color');
      expect(result).toHaveLength(2);
      expect(material?.id).toBe('d-leaf');
      expect(material?.label).toBe('Leaf Material');
      expect(color?.id).toBe('d-p');
    });

    it('orders the effective set by sortOrder then label', async () => {
      findAncestorIds.mockResolvedValue(['leaf']);
      catFindMany.mockResolvedValue([{ id: 'leaf', parentId: null }]);
      defFindMany.mockResolvedValue([
        makeDef({ id: 'b', categoryId: 'leaf', key: 'b', label: 'B', sortOrder: 2 }),
        makeDef({ id: 'a', categoryId: 'leaf', key: 'a', label: 'A', sortOrder: 1 }),
      ]);

      const result = await repo.findEffectiveForCategory('leaf');

      expect(result.map((d) => d.id)).toEqual(['a', 'b']);
    });

    it('returns an empty array when no ancestor declares any definition', async () => {
      findAncestorIds.mockResolvedValue(['leaf', 'p']);
      catFindMany.mockResolvedValue([
        { id: 'leaf', parentId: 'p' },
        { id: 'p', parentId: null },
      ]);
      defFindMany.mockResolvedValue([]);

      expect(await repo.findEffectiveForCategory('leaf')).toEqual([]);
    });
  });

  // ─── create: append to the category's bucket (TASK-298) ─────────────────────

  describe('create', () => {
    // Trap A: the admin editor sends no hand-typed `sortOrder`, so the old `?? 0` default
    // stacked every new template ON TOP OF the first one.
    it('APPENDS a new definition to the end of its category (max + 1), under the bucket lock', async () => {
      attributeDefinitionDelegate.aggregate.mockResolvedValue({ _max: { sortOrder: 3 } });
      attributeDefinitionDelegate.create.mockResolvedValue(makeDef({ id: 'd-new' }));

      await repo.create({ categoryId: 'cat', key: 'weight', label: 'Вага' });

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(attributeDefinitionDelegate.aggregate).toHaveBeenCalledWith({
        where: { categoryId: 'cat' },
        _max: { sortOrder: true },
      });
      expect(attributeDefinitionDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ categoryId: 'cat', key: 'weight', sortOrder: 4 }),
      });
    });

    it('starts the first definition of an empty category at slot 0', async () => {
      attributeDefinitionDelegate.aggregate.mockResolvedValue({ _max: { sortOrder: null } });
      attributeDefinitionDelegate.create.mockResolvedValue(makeDef({ id: 'd-new' }));

      await repo.create({ categoryId: 'cat', key: 'weight', label: 'Вага' });

      expect(attributeDefinitionDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 0 }),
      });
    });

    it('honours an EXPLICIT sortOrder instead of appending', async () => {
      attributeDefinitionDelegate.create.mockResolvedValue(makeDef({ id: 'd-new' }));

      await repo.create({ categoryId: 'cat', key: 'weight', label: 'Вага', sortOrder: 7 });

      expect(attributeDefinitionDelegate.aggregate).not.toHaveBeenCalled();
      expect(attributeDefinitionDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ sortOrder: 7 }),
      });
    });
  });

  // ─── reorder: the shared flat recipe (TASK-298) ─────────────────────────────

  describe('reorder', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('locks the category, writes index → sortOrder and returns the refreshed list', async () => {
      // 1st findMany = the in-tx snapshot; 2nd = the refreshed list, read in the SAME tx.
      defFindMany
        .mockResolvedValueOnce([{ id: a }, { id: b }])
        .mockResolvedValueOnce([
          makeDef({ id: b, sortOrder: 0 }),
          makeDef({ id: a, key: 'color', sortOrder: 1 }),
        ]);

      const result = await repo.reorder('cat', [b, a]);

      expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
      // Every write carries the categoryId guard — a foreign id can never be stolen in.
      expect(attributeDefinitionDelegate.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: b, categoryId: 'cat' },
        data: { sortOrder: 0 },
      });
      expect(attributeDefinitionDelegate.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: a, categoryId: 'cat' },
        data: { sortOrder: 1 },
      });
      expect(result.map((d) => d.id)).toEqual([b, a]);
    });

    it('rejects a duplicate id (DUPLICATE_ID) and writes nothing', async () => {
      defFindMany.mockResolvedValueOnce([{ id: a }, { id: b }]);

      await expect(repo.reorder('cat', [a, a])).rejects.toBeInstanceOf(ReorderDuplicateIdError);

      expect(attributeDefinitionDelegate.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an id that belongs to another category (NOT_FOUND) and writes nothing', async () => {
      defFindMany.mockResolvedValueOnce([{ id: a }]);

      await expect(repo.reorder('cat', [a, b])).rejects.toBeInstanceOf(ReorderNotFoundError);

      expect(attributeDefinitionDelegate.updateMany).not.toHaveBeenCalled();
    });

    // The whole point of TASK-298: a payload that does not name every template of the category
    // means another admin added one underneath the client — writing it would leave that row at
    // a stale, now-colliding slot. It is a 409, not a silent partial write.
    it('rejects a PARTIAL payload (STALE) when the category gained a template underneath', async () => {
      defFindMany.mockResolvedValueOnce([{ id: a }, { id: b }]);

      await expect(repo.reorder('cat', [a])).rejects.toBeInstanceOf(ReorderStaleError);

      expect(attributeDefinitionDelegate.updateMany).not.toHaveBeenCalled();
    });
  });
});
