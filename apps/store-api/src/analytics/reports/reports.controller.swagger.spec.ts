import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { PermissionService } from '../../auth/permissions';
import { CatalogueReportService } from './catalogue-report.service';
import { MoneyFlowReportService } from './money-flow-report.service';
import { ProductsReportService } from './products-report.service';
import { RegistrationsReportService } from './registrations-report.service';
import { ReportsController } from './reports.controller';
import { SalesReportService } from './sales-report.service';

/**
 * OpenAPI contract of «Рух коштів» (TASK-2395) — what Orval generates the admin
 * hooks from. Built from the REAL controller, like
 * `admin-order-money.controller.swagger.spec.ts`.
 */
interface SchemaLike {
  type?: string;
  $ref?: string;
  enum?: string[];
  items?: SchemaLike;
  required?: string[];
  properties?: Record<string, SchemaLike>;
}

interface OperationLike {
  operationId?: string;
  parameters?: { name: string; in: string; schema?: SchemaLike }[];
  responses: Record<string, { content?: Record<string, { schema?: SchemaLike }> }>;
}

describe('ReportsController — money flow (OpenAPI contract, TASK-2395)', () => {
  let document: OpenAPIObject;
  let schemas: Record<string, SchemaLike>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: SalesReportService, useValue: {} },
        { provide: CatalogueReportService, useValue: {} },
        { provide: ProductsReportService, useValue: {} },
        { provide: RegistrationsReportService, useValue: {} },
        { provide: MoneyFlowReportService, useValue: {} },
        { provide: PermissionService, useValue: {} },
        { provide: PinoLogger, useValue: { setContext: jest.fn() } },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('probe').setVersion('1').build(),
    );
    schemas = (document.components?.schemas ?? {}) as Record<string, SchemaLike>;
  });

  const get = (path: string) =>
    (document.paths[path] as Record<string, OperationLike> | undefined)?.get as OperationLike;
  const okSchema = (operation: OperationLike) =>
    operation.responses['200'].content?.['application/json'].schema;

  it.each([
    ['/admin/analytics/reports/money-flow', 'getMoneyFlowReport'],
    ['/admin/analytics/reports/money-flow/entries', 'getMoneyFlowEntries'],
  ])('%s → %s, with 400/401/403 documented', (path, operationId) => {
    const operation = get(path);
    expect(operation.operationId).toBe(operationId);
    expect(Object.keys(operation.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );
  });

  it('answers the report in a typed { data } envelope with 8-row breakdown, totals and balances', () => {
    const envelope =
      schemas[okSchema(get('/admin/analytics/reports/money-flow'))!.$ref!.split('/').pop()!];
    expect(envelope.properties?.data.$ref).toBe('#/components/schemas/MoneyFlowReportEntity');

    const report = schemas.MoneyFlowReportEntity.properties ?? {};
    expect(report.period.$ref).toBe('#/components/schemas/ReportPeriodEntity');
    expect(report.rows.items?.$ref).toBe('#/components/schemas/MoneyFlowKindRowEntity');
    expect(report.totals.$ref).toBe('#/components/schemas/MoneyFlowTotalsEntity');
    expect(report.balances.$ref).toBe('#/components/schemas/MoneyBalancesEntity');

    const row = schemas.MoneyFlowKindRowEntity.properties ?? {};
    for (const key of ['grossKop', 'reversedKop', 'netKop', 'count', 'requestedKop']) {
      expect(row[key].type).toBe('integer');
    }
    expect(Object.keys(schemas.MoneyFlowTotalsEntity.properties ?? {})).toEqual([
      'inKop',
      'outKop',
      'netKop',
      'requestedOutKop',
    ]);
    expect(Object.keys(schemas.MoneyBalancesEntity.properties ?? {})).toEqual([
      'debt',
      'owedToCustomer',
    ]);
  });

  it('answers the register as { data: entries[], meta: { total, page, limit, totalPages } }', () => {
    const operation = get('/admin/analytics/reports/money-flow/entries');
    const envelope = schemas[okSchema(operation)!.$ref!.split('/').pop()!];
    expect(envelope.properties?.data.items?.$ref).toBe('#/components/schemas/MoneyFlowEntryEntity');
    const meta = schemas[envelope.properties!.meta.$ref!.split('/').pop()!];
    expect(Object.keys(meta.properties ?? {})).toEqual(['total', 'page', 'limit', 'totalPages']);

    const entry = schemas.MoneyFlowEntryEntity.properties ?? {};
    expect(entry.amountKop.type).toBe('integer');
    expect(entry.signedKop.type).toBe('integer');
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining([
        'occurredAt',
        'orderNumber',
        'isReversal',
        'requested',
        'legacy',
        'actorName',
      ]),
    );
    expect(operation.parameters?.map((p) => p.name)).toEqual(
      expect.arrayContaining(['preset', 'from', 'to', 'kind', 'page', 'limit']),
    );
  });
});
