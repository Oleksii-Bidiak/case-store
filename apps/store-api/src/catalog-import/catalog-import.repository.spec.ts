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
