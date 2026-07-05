import { Test, TestingModule } from '@nestjs/testing';
import { AttributeType } from '@prisma/client';
import { AttributeDefinitionRepository } from './attribute-definition.repository';
import { PrismaService } from '../prisma';
import { CategoryRepository } from '../category';

/**
 * Unit tests for the effective-definition resolution (TASK-191-B). Prisma and
 * CategoryRepository are mocked, so these cover the JS dedup/override logic —
 * the leaf-overrides-ancestor rule for a same-`key` collision.
 */
describe('AttributeDefinitionRepository — findEffectiveForCategory', () => {
  let repo: AttributeDefinitionRepository;
  const defFindMany = jest.fn();
  const catFindMany = jest.fn();
  const findAncestorIds = jest.fn();

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
        {
          provide: PrismaService,
          useValue: {
            attributeDefinition: { findMany: defFindMany },
            category: { findMany: catFindMany },
          },
        },
        { provide: CategoryRepository, useValue: { findAncestorIds } },
      ],
    }).compile();
    repo = module.get(AttributeDefinitionRepository);
  });

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
