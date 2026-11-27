import { Test, TestingModule } from '@nestjs/testing';
import { AttributeType } from '@prisma/client';
import { CatalogImportRepository } from './catalog-import.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The XLSX import's colour definition (TASK-487).
 *
 * `ensureAttributeDefinitions` deliberately types every column it meets as TEXT
 * and leaves it non-filterable — the source columns mix "до 20м" with "5", so
 * inferring a type would reject real values, and an operator promotes the ones
 * worth filtering on afterwards. Colour is the documented exception, and these
 * cases pin why: a TEXT definition is never offered as a facet at all, so
 * leaving colour to that default meant importing a catalogue whose «дизайн»
 * column filled in swatches nobody could filter by.
 */
describe('CatalogImportRepository — the colour definition (TASK-487)', () => {
  let repo: CatalogImportRepository;

  const definition = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prismaMock = { attributeDefinition: definition };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogImportRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(CatalogImportRepository);
    definition.create.mockResolvedValue({ id: 'def-new' });
    definition.update.mockResolvedValue({ id: 'def-existing' });
  });

  it('creates it as a FILTERABLE SELECT, not as the TEXT default', async () => {
    definition.findUnique.mockResolvedValue(null);

    expect(await repo.ensureColorDefinition('cat-1', ['Чорний', 'Білий'])).toBe('def-new');

    expect(definition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: 'cat-1',
          key: 'color',
          label: 'Колір',
          type: AttributeType.SELECT,
          isFilterable: true,
          options: ['Білий', 'Чорний'],
        }),
      }),
    );
  });

  it('promotes an existing TEXT colour definition instead of creating a second one', async () => {
    definition.findUnique.mockResolvedValue({ id: 'def-existing', options: null });

    expect(await repo.ensureColorDefinition('cat-1', ['Чорний'])).toBe('def-existing');

    expect(definition.create).not.toHaveBeenCalled();
    expect(definition.update).toHaveBeenCalledWith({
      where: { id: 'def-existing' },
      data: { type: AttributeType.SELECT, isFilterable: true, options: ['Чорний'] },
    });
  });

  it('MERGES the option list — a later file must not un-pick earlier colours', async () => {
    // The admin spec editor renders a SELECT as a closed dropdown. Replacing the
    // list with this run's colours would make every colour the previous import
    // introduced unpickable, while products still carry it.
    definition.findUnique.mockResolvedValue({
      id: 'def-existing',
      options: ['Червоний', 'Чорний'],
    });

    await repo.ensureColorDefinition('cat-1', ['Білий', 'Чорний']);

    const [{ data }] = definition.update.mock.calls[0];
    expect(data.options).toEqual(['Білий', 'Червоний', 'Чорний']);
  });

  it('ignores blank colours from the file', async () => {
    definition.findUnique.mockResolvedValue(null);

    await repo.ensureColorDefinition('cat-1', ['  ', 'Чорний', '']);

    const [{ data }] = definition.create.mock.calls[0];
    expect(data.options).toEqual(['Чорний']);
  });

  it('survives an options column that is not an array', async () => {
    definition.findUnique.mockResolvedValue({ id: 'def-existing', options: 'nonsense' });

    await repo.ensureColorDefinition('cat-1', ['Чорний']);

    const [{ data }] = definition.update.mock.calls[0];
    expect(data.options).toEqual(['Чорний']);
  });
});

/**
 * A spec write scoped to some definitions (TASK-2608).
 *
 * `setSpecValues` is replace-all, which is right when the whole spec set is applied and
 * wrong when the operator unticked one half of it: the file's columns («Характеристики»)
 * and the colour («Колір / дизайн») are separate review decisions that land in the same
 * table. The scope narrows the delete to the definitions actually being written, so the
 * unticked half stays as it was.
 */
describe('CatalogImportRepository — scoped spec writes (TASK-2608)', () => {
  let repo: CatalogImportRepository;

  const value = {
    deleteMany: jest.fn((args: unknown) => ({ op: 'deleteMany', args })),
    createMany: jest.fn((args: unknown) => ({ op: 'createMany', args })),
  };
  const prismaMock = {
    productAttributeValue: value,
    $transaction: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CatalogImportRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    repo = module.get(CatalogImportRepository);
  });

  it('still replaces every spec value when no scope is given', async () => {
    await repo.setSpecValues('p-1', [{ definitionId: 'def-1', value: 'TPU' }]);

    expect(value.deleteMany).toHaveBeenCalledWith({ where: { productId: 'p-1' } });
  });

  it('deletes only the definitions it writes with `only`', async () => {
    await repo.setSpecValues('p-1', [{ definitionId: 'def-color', value: 'Чорний' }], {
      only: ['def-color'],
    });

    expect(value.deleteMany).toHaveBeenCalledWith({
      where: { productId: 'p-1', definitionId: { in: ['def-color'] } },
    });
  });

  it('leaves the excluded definitions alone with `except`', async () => {
    await repo.setSpecValues('p-1', [{ definitionId: 'def-1', value: 'TPU' }], {
      except: ['def-color'],
    });

    expect(value.deleteMany).toHaveBeenCalledWith({
      where: { productId: 'p-1', definitionId: { notIn: ['def-color'] } },
    });
  });
});

/**
 * The colour definitions a category already has (TASK-2608).
 *
 * Needed for the categories whose rows carry no colour in this file: the import still has
 * to know the existing colour definition to scope a spec write around an unticked colour.
 * Lookup only — a category the file says nothing about must not gain a definition, nor
 * have its options touched.
 */
describe('CatalogImportRepository — finding existing colour definitions (TASK-2608)', () => {
  let repo: CatalogImportRepository;

  const definition = { findMany: jest.fn(), create: jest.fn(), update: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogImportRepository,
        { provide: PrismaService, useValue: { attributeDefinition: definition } },
      ],
    }).compile();
    repo = module.get(CatalogImportRepository);
  });

  it('looks them up in one query keyed by category, creating nothing', async () => {
    definition.findMany.mockResolvedValue([{ id: 'def-color', categoryId: 'cat-1' }]);

    const found = await repo.findColorDefinitions(['cat-1', 'cat-2']);

    expect(found).toEqual(new Map([['cat-1', 'def-color']]));
    expect(definition.findMany).toHaveBeenCalledTimes(1);
    expect(definition.findMany).toHaveBeenCalledWith({
      where: { categoryId: { in: ['cat-1', 'cat-2'] }, key: 'color' },
      select: { id: true, categoryId: true },
    });
    expect(definition.create).not.toHaveBeenCalled();
    expect(definition.update).not.toHaveBeenCalled();
  });

  it('skips the query for no categories', async () => {
    expect(await repo.findColorDefinitions([])).toEqual(new Map());
    expect(definition.findMany).not.toHaveBeenCalled();
  });
});
