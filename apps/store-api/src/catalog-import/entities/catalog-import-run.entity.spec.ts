import { CatalogImportStatus, type CatalogImportRun } from '@prisma/client';
import { CatalogImportRunEntity } from './catalog-import-run.entity';

function prismaRun(over: Partial<CatalogImportRun> = {}): CatalogImportRun {
  return {
    id: 'run-1',
    filename: 'catalog.xlsx',
    status: CatalogImportStatus.APPLIED,
    totalRows: 3,
    createCount: 1,
    updateCount: 2,
    missingCount: 0,
    errorCount: 0,
    appliedRows: 3,
    failures: null,
    error: null,
    actorEmail: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    appliedAt: new Date('2026-11-01T00:05:00Z'),
    plan: null,
    ...over,
  } as CatalogImportRun;
}

describe('CatalogImportRunEntity.fromPrisma — failures (TASK-2626)', () => {
  // A run applied before the column existed has NULL there: the history must read it as
  // "not recorded", not as "nothing failed".
  it('maps a run recorded before failures existed to null', () => {
    expect(CatalogImportRunEntity.fromPrisma(prismaRun()).failures).toBeNull();
  });

  it('passes the recorded failures through', () => {
    const failures = [{ sourceSku: 'A1', rowNumber: 4, name: 'Чохол', reason: 'boom' }];

    expect(CatalogImportRunEntity.fromPrisma(prismaRun({ failures })).failures).toEqual(failures);
  });
});
