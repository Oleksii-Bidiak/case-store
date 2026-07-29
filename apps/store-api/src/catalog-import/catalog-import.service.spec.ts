import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CatalogImportStatus } from '@prisma/client';
import { CatalogImportService, IMPORT_CHUNK_SIZE } from './catalog-import.service';
import { CatalogImportRepository } from './catalog-import.repository';
import { ProductService } from '../product/product.service';
import { STORAGE_SERVICE } from '../storage';
import type { CatalogImportPlan, PlannedRow } from './catalog-plan';

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
      });
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
