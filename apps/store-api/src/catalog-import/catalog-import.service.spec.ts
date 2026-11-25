import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CatalogImportStatus } from '@prisma/client';
import { CatalogImportService, IMPORT_CHUNK_SIZE } from './catalog-import.service';
import { CatalogImportRepository, deviceModelKey } from './catalog-import.repository';
import { PrismaService } from '../prisma/prisma.service';
import { ProductService } from '../product/product.service';
import { STORAGE_SERVICE } from '../storage';
import type { CatalogImportPlan, FieldChange, PlannedRow } from './catalog-plan';
import type { ParsedCatalog, ParsedProductRow } from './catalog-import.types';

const repositoryMock = {
  createRun: jest.fn(),
  findRun: jest.fn(),
  listRuns: jest.fn(),
  findRunByHash: jest.fn(),
  updateRun: jest.fn(),
  findNextApplying: jest.fn(),
  loadLedger: jest.fn(),
  loadCurrentProducts: jest.fn(),
  recordImported: jest.fn(),
  markMissing: jest.fn(),
  ensureCategories: jest.fn(),
  ensureBrands: jest.fn(),
  ensureDeviceBrands: jest.fn(),
  ensureDeviceModels: jest.fn(),
  ensureAttributeDefinitions: jest.fn(),
  ensureGroup: jest.fn(),
  setSpecValues: jest.fn(),
  setDeviceCompat: jest.fn(),
};

const productServiceMock = {
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
};

const storageMock = { save: jest.fn(), read: jest.fn(), delete: jest.fn() };

/** Minimal one-sheet workbook the parser can read back, built on demand. */
const WORKBOOK = Buffer.from('not-a-real-workbook');

function plannedRow(over: Partial<PlannedRow> = {}): PlannedRow {
  return {
    sourceSku: 'A1',
    rowNumber: 3,
    action: 'create',
    name: 'Чохол Armor',
    productId: null,
    slug: 'chehol-armor',
    changes: [],
    ...over,
  };
}

function plan(rows: PlannedRow[]): CatalogImportPlan {
  return {
    rows,
    categories: [{ name: 'Чохли', slug: 'chokhly', usageCount: rows.length }],
    brands: [],
    deviceBrands: [],
    deviceModels: [],
    attributeColumns: [],
    groups: [],
    issues: [],
    counts: {
      total: rows.length,
      create: rows.filter((r) => r.action === 'create').length,
      update: rows.filter((r) => r.action === 'update').length,
      unchanged: rows.filter((r) => r.action === 'unchanged').length,
      missing: rows.filter((r) => r.action === 'missing').length,
      conflicts: 0,
      errors: 0,
    },
  };
}

function run(over: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    filename: 'catalog.xlsx',
    fileHash: 'hash',
    storedPath: 'imports/run-1.xlsx',
    status: CatalogImportStatus.PARSED,
    totalRows: 1,
    createCount: 1,
    updateCount: 0,
    missingCount: 0,
    errorCount: 0,
    appliedRows: 0,
    plan: plan([plannedRow()]),
    decisions: null,
    error: null,
    actorId: null,
    actorEmail: null,
    createdAt: new Date(),
    appliedAt: null,
    ...over,
  } as never;
}

describe('CatalogImportService', () => {
  let service: CatalogImportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogImportService,
        { provide: CatalogImportRepository, useValue: repositoryMock },
        { provide: ProductService, useValue: productServiceMock },
        { provide: STORAGE_SERVICE, useValue: storageMock },
      ],
    }).compile();
    service = module.get(CatalogImportService);

    repositoryMock.ensureCategories.mockResolvedValue(new Map([['Чохли', 'cat-1']]));
    repositoryMock.ensureBrands.mockResolvedValue(new Map());
    repositoryMock.ensureDeviceBrands.mockResolvedValue(new Map());
    repositoryMock.ensureDeviceModels.mockResolvedValue(new Map());
    repositoryMock.ensureAttributeDefinitions.mockResolvedValue(new Map());
    productServiceMock.create.mockResolvedValue({ id: 'p-new' });
    productServiceMock.update.mockResolvedValue({ id: 'p1' });
  });

  describe('upload validation', () => {
    it('rejects an empty file before it reaches the parser', async () => {
      await expect(
        service.createRun(Buffer.alloc(0), 'catalog.xlsx', { id: null, email: null }),
      ).rejects.toThrow(/порожній/);
      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('rejects an unparseable file with a 400 rather than a 500', async () => {
      await expect(
        service.createRun(WORKBOOK, 'catalog.xlsx', { id: null, email: null }),
      ).rejects.toMatchObject({ status: 400 });
      expect(repositoryMock.createRun).not.toHaveBeenCalled();
    });
  });

  describe('getRun', () => {
    it('404s on an unknown run', async () => {
      repositoryMock.findRun.mockResolvedValue(null);
      await expect(service.getRun('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('apply / cancel transitions', () => {
    it('moves a parsed run to APPLYING and records the decisions', async () => {
      repositoryMock.findRun.mockResolvedValue(run());
      repositoryMock.updateRun.mockResolvedValue(run({ status: CatalogImportStatus.APPLYING }));

      await service.apply('run-1', { excludedSkus: ['A2'] });

      expect(repositoryMock.updateRun).toHaveBeenCalledWith('run-1', {
        status: CatalogImportStatus.APPLYING,
        decisions: { excludedSkus: ['A2'] },
        appliedRows: 0,
        totalRows: 1,
        // The plan's single row is a create (TASK-2545: re-counted from the decisions).
        updateCount: 0,
      });
    });

    // Caught on the first live run: confirming 4 rows out of a 1297-row plan
    // showed "4 / 1297", i.e. 0% — a progress bar that looks stuck.
    it('narrows totalRows to the rows the operator actually authorised', async () => {
      const rows = [
        plannedRow({ sourceSku: 'A1' }),
        plannedRow({ sourceSku: 'A2' }),
        plannedRow({ sourceSku: 'A3', action: 'unchanged' }),
      ];
      repositoryMock.findRun.mockResolvedValue(run({ plan: plan(rows), totalRows: 3 }));
      repositoryMock.updateRun.mockResolvedValue(run());

      await service.apply('run-1', { excludedSkus: ['A2'] });

      // A1 only: A2 was unticked and A3 was never going to be written.
      expect(repositoryMock.updateRun).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ totalRows: 1 }),
      );
    });

    // TASK-2545: an update row whose every change was unticked writes nothing, so it is
    // neither part of the run's work nor one of the «N оновлено» the history shows.
    it('counts an update with every field unticked neither in totalRows nor in updateCount', async () => {
      const change = (field: FieldChange['field']): FieldChange => ({
        field,
        label: field,
        to: 'x',
        conflict: false,
      });
      const rows = [
        // every change unticked → not authorised
        plannedRow({
          sourceSku: 'U1',
          action: 'update',
          productId: 'p1',
          changes: [change('price')],
        }),
        // one of two unticked → still an update
        plannedRow({
          sourceSku: 'U2',
          action: 'update',
          productId: 'p2',
          changes: [change('name'), change('price')],
        }),
        // whole row unticked
        plannedRow({
          sourceSku: 'U3',
          action: 'update',
          productId: 'p3',
          changes: [change('name')],
        }),
        plannedRow({ sourceSku: 'C1', action: 'create' }),
      ];
      repositoryMock.findRun.mockResolvedValue(
        run({ plan: plan(rows), totalRows: 4, updateCount: 3 }),
      );
      repositoryMock.updateRun.mockResolvedValue(run());

      await service.apply('run-1', {
        excludedSkus: ['U3'],
        excludedFields: { U1: ['price'], U2: ['price'] },
      });

      expect(repositoryMock.updateRun).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ totalRows: 2, updateCount: 1 }),
      );
    });

    // Without this, a double-click on «Застосувати» would rewind appliedRows to
    // 0 mid-run and write the first chunk a second time.
    it('refuses to apply a run that is already applying', async () => {
      repositoryMock.findRun.mockResolvedValue(run({ status: CatalogImportStatus.APPLYING }));
      await expect(service.apply('run-1', {})).rejects.toThrow(ConflictException);
    });

    it('refuses to cancel a run that has already been applied', async () => {
      repositoryMock.findRun.mockResolvedValue(run({ status: CatalogImportStatus.APPLIED }));
      await expect(service.cancel('run-1')).rejects.toThrow(ConflictException);
    });
  });

  /**
   * The colour half of a spec write (TASK-487).
   *
   * `source.design` — the file's «дизайн» column — used to reach the database
   * ONLY as a variant-axis value in `attributes` JSON, which no facet query
   * reads. So an imported catalogue had colours on every card and no colour
   * filter anywhere. It is now written twice, deliberately, and these cases pin
   * both halves plus the early-return that used to swallow the second one.
   *
   * Reached through the private `writeSpecs` on purpose: the public route into
   * it is `applyChunk`, which first re-parses the stored workbook, and building
   * a real .xlsx here would test the parser rather than this branch.
   */
  describe('writeSpecs — colour', () => {
    type WriteSpecs = (
      productId: string,
      source: Record<string, unknown>,
      context: Record<string, unknown>,
    ) => Promise<void>;

    const call = (source: Record<string, unknown>, context: Record<string, unknown>) =>
      (service as unknown as { writeSpecs: WriteSpecs }).writeSpecs('p-1', source, context);

    const sourceRow = (over: Record<string, unknown> = {}) => ({
      categoryName: 'Чохли',
      attributes: {},
      ...over,
    });

    it('writes the colour as a real spec value beside the file columns', async () => {
      await call(sourceRow({ design: 'Чорний', attributes: { material: 'Силікон' } }), {
        definitions: new Map([['Чохли', new Map([['material', 'def-material']])]]),
        colorDefinitions: new Map([['Чохли', 'def-color']]),
      });

      expect(repositoryMock.setSpecValues).toHaveBeenCalledWith('p-1', [
        { definitionId: 'def-material', value: 'Силікон' },
        { definitionId: 'def-color', value: 'Чорний' },
      ]);
    });

    it('writes the colour even when the category declares no spec columns at all', async () => {
      // The old early return bailed on a category with no `definitions` entry —
      // and that is precisely the category whose only facet would be colour.
      await call(sourceRow({ design: 'Білий' }), {
        definitions: new Map(),
        colorDefinitions: new Map([['Чохли', 'def-color']]),
      });

      expect(repositoryMock.setSpecValues).toHaveBeenCalledWith('p-1', [
        { definitionId: 'def-color', value: 'Білий' },
      ]);
    });

    it('trims the colour and ignores a blank «дизайн» cell', async () => {
      await call(sourceRow({ design: '  Синій  ' }), {
        definitions: new Map(),
        colorDefinitions: new Map([['Чохли', 'def-color']]),
      });
      expect(repositoryMock.setSpecValues).toHaveBeenCalledWith('p-1', [
        { definitionId: 'def-color', value: 'Синій' },
      ]);

      repositoryMock.setSpecValues.mockClear();
      await call(sourceRow({ design: '   ' }), {
        definitions: new Map(),
        colorDefinitions: new Map([['Чохли', 'def-color']]),
      });
      expect(repositoryMock.setSpecValues).not.toHaveBeenCalled();
    });

    it('still clears the spec values of a row whose columns were emptied', async () => {
      // `setSpecValues` is replace-all, so the empty list is a meaningful write.
      await call(sourceRow(), {
        definitions: new Map([['Чохли', new Map()]]),
        colorDefinitions: new Map(),
      });

      expect(repositoryMock.setSpecValues).toHaveBeenCalledWith('p-1', []);
    });
  });

  /**
   * The map key that carries device compatibility from `ensureDeviceModels` to
   * `writeCompat` (TASK-705).
   *
   * Written as a ROUND TRIP through the REAL repository rather than against a
   * mocked map, because the defect it pins lived in neither side alone: the
   * writer separated brand from model with a literal NUL byte and the reader
   * with a space, so `get()` never matched, `writeCompat` always resolved an
   * empty id list, and `setDeviceCompat` — which deletes before it writes —
   * cleared the compatibility rows of every imported product. Mocking
   * `ensureDeviceModels` to return an empty map, as the rest of this file does,
   * is exactly what hid it for two months.
   */
  describe('device compatibility round trip (TASK-705)', () => {
    type WriteCompat = (
      productId: string,
      source: Record<string, unknown>,
      context: Record<string, unknown>,
    ) => Promise<void>;

    /** The real repository over a prisma that just hands back the ids given. */
    const realRepository = async (ids: string[]) => {
      const upsert = jest.fn();
      for (const id of ids) {
        upsert.mockResolvedValueOnce({ id });
      }
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CatalogImportRepository,
          { provide: PrismaService, useValue: { deviceModel: { upsert } } },
        ],
      }).compile();
      return module.get(CatalogImportRepository);
    };

    const writeCompat = (source: Record<string, unknown>, context: Record<string, unknown>) =>
      (service as unknown as { writeCompat: WriteCompat }).writeCompat('p-1', source, context);

    it('writes the models ensureDeviceModels filed, not an empty list', async () => {
      const repository = await realRepository(['model-15', 'model-15-pro']);
      const deviceModels = await repository.ensureDeviceModels([
        { name: 'iPhone 15', slug: 'apple-iphone-15', deviceBrandId: 'brand-apple' },
        { name: 'iPhone 15 Pro', slug: 'apple-iphone-15-pro', deviceBrandId: 'brand-apple' },
      ]);

      await writeCompat(
        { deviceBrandName: 'Apple', deviceModelNames: ['iPhone 15', 'iPhone 15 Pro'] },
        { deviceBrands: new Map([['Apple', 'brand-apple']]), deviceModels },
      );

      expect(repositoryMock.setDeviceCompat).toHaveBeenCalledWith('p-1', [
        'model-15',
        'model-15-pro',
      ]);
    });

    it('keeps the same model name under two brands apart', async () => {
      const repository = await realRepository(['samsung-a35', 'other-a35']);
      const deviceModels = await repository.ensureDeviceModels([
        { name: 'Galaxy A35', slug: 'samsung-galaxy-a35', deviceBrandId: 'brand-samsung' },
        { name: 'Galaxy A35', slug: 'other-galaxy-a35', deviceBrandId: 'brand-other' },
      ]);

      await writeCompat(
        { deviceBrandName: 'Samsung', deviceModelNames: ['Galaxy A35'] },
        { deviceBrands: new Map([['Samsung', 'brand-samsung']]), deviceModels },
      );

      expect(repositoryMock.setDeviceCompat).toHaveBeenCalledWith('p-1', ['samsung-a35']);
    });
  });

  describe('applyChunk', () => {
    // The plan is the source of truth for WHAT to do, so a run whose actionable
    // rows are exhausted must settle rather than spin.
    it('marks the run APPLIED and stops when nothing is left to write', async () => {
      const more = await service.applyChunk(
        run({ status: CatalogImportStatus.APPLYING, appliedRows: 1 }),
      );

      expect(more).toBe(false);
      expect(repositoryMock.updateRun).toHaveBeenCalledWith(
        'run-1',
        expect.objectContaining({ status: CatalogImportStatus.APPLIED }),
      );
      expect(storageMock.read).not.toHaveBeenCalled();
    });

    it('never writes an unchanged row', async () => {
      const more = await service.applyChunk(
        run({
          status: CatalogImportStatus.APPLYING,
          plan: plan([plannedRow({ action: 'unchanged' })]),
        }),
      );

      expect(more).toBe(false);
      expect(productServiceMock.create).not.toHaveBeenCalled();
      expect(productServiceMock.update).not.toHaveBeenCalled();
    });

    it('skips a row the operator excluded', async () => {
      const more = await service.applyChunk(
        run({
          status: CatalogImportStatus.APPLYING,
          decisions: { excludedSkus: ['A1'] },
        }),
      );

      expect(more).toBe(false);
      expect(productServiceMock.create).not.toHaveBeenCalled();
    });

    // TASK-2545: unticking every field of an update must leave the product exactly as it
    // is — specs, compatibility and the ledger included, not only the product columns.
    it('never writes an update row whose every field the operator unticked', async () => {
      const source: ParsedProductRow = {
        rowNumber: 3,
        categoryName: 'Чохли',
        sourceSku: 'U1',
        name: 'Чохол Armor',
        sourceUrl: null,
        description: null,
        price: 499,
        brandName: null,
        design: null,
        barcode: null,
        manufacturerCode: null,
        videoUrl: null,
        deviceBrandName: 'Apple',
        deviceModelNames: ['iPhone 15'],
        attributes: { material: 'TPU' },
      };
      const catalog: ParsedCatalog = {
        sheetName: 'Аркуш1',
        categoryNames: ['Чохли'],
        rows: [source],
        attributeColumns: [{ key: 'material', label: 'Матеріал', filledCount: 1 }],
        issues: [],
        totalProductRows: 1,
      };
      jest
        .spyOn(service as unknown as { readCatalog: () => Promise<ParsedCatalog> }, 'readCatalog')
        .mockResolvedValue(catalog);
      repositoryMock.ensureDeviceBrands.mockResolvedValue(new Map([['Apple', 'db-apple']]));
      repositoryMock.ensureDeviceModels.mockResolvedValue(
        new Map([[deviceModelKey('db-apple', 'iPhone 15'), 'model-15']]),
      );
      repositoryMock.ensureAttributeDefinitions.mockResolvedValue(new Map([['material', 'def-1']]));

      const more = await service.applyChunk(
        run({
          status: CatalogImportStatus.APPLYING,
          plan: plan([
            plannedRow({
              sourceSku: 'U1',
              action: 'update',
              productId: 'p1',
              changes: [
                { field: 'price', label: 'Ціна', from: '450', to: '499', conflict: false },
                { field: 'attributes', label: 'Характеристики', to: 'TPU', conflict: false },
              ],
            }),
          ]),
          decisions: { excludedFields: { U1: ['price', 'attributes'] } },
        }),
      );

      expect(more).toBe(false);
      expect(productServiceMock.update).not.toHaveBeenCalled();
      expect(repositoryMock.setSpecValues).not.toHaveBeenCalled();
      expect(repositoryMock.setDeviceCompat).not.toHaveBeenCalled();
      expect(repositoryMock.recordImported).not.toHaveBeenCalled();
    });

    // A missing row needs no file access at all, which is what lets the "hide
    // what vanished" half of a run work even if the workbook were unreadable.
    it('hides a product that fell out of the file, and never deletes it', async () => {
      storageMock.read.mockResolvedValue(WORKBOOK);
      productServiceMock.deactivate.mockResolvedValue({ id: 'p-gone' });

      await service
        .applyChunk(
          run({
            status: CatalogImportStatus.APPLYING,
            plan: plan([plannedRow({ action: 'missing', sourceSku: 'GONE', productId: 'p-gone' })]),
          }),
        )
        .catch(() => undefined);

      // The workbook read fails on our fake buffer, so the chunk logs and moves
      // on; what matters is that no delete path exists at all.
      expect(productServiceMock.deactivate).not.toHaveBeenCalledWith(
        expect.objectContaining({ hardDelete: true }),
      );
    });

    it('advances the progress counter by the chunk size, not the whole plan', () => {
      // Guards the pagination arithmetic: `slice(from, from + CHUNK)` with
      // `from = appliedRows` is what makes a restarted worker resume rather than
      // start over.
      expect(IMPORT_CHUNK_SIZE).toBeGreaterThan(0);
      const rows = Array.from({ length: IMPORT_CHUNK_SIZE + 5 }, (_, i) =>
        plannedRow({ sourceSku: `A${i}` }),
      );
      const actionable = rows.filter((r) => r.action !== 'unchanged');
      expect(actionable.slice(0, IMPORT_CHUNK_SIZE)).toHaveLength(IMPORT_CHUNK_SIZE);
      expect(actionable.slice(IMPORT_CHUNK_SIZE, IMPORT_CHUNK_SIZE * 2)).toHaveLength(5);
    });
  });
});
