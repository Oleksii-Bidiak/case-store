import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { PermissionService } from '../auth/permissions';
import { AdminOrderMoneyController } from './admin-order-money.controller';
import { OrderMoneyService } from './order-money.service';

/**
 * OpenAPI contract of the money door (R2 A3) — what Orval will generate the
 * admin hooks from in A4. Built from the REAL controller, like
 * `cart.controller.swagger.spec.ts`: stable operationIds, a typed `{ data }`
 * envelope, integer kopecks on the request bodies.
 */
interface SchemaLike {
  type?: string;
  $ref?: string;
  items?: SchemaLike;
  required?: string[];
  properties?: Record<string, SchemaLike>;
}

describe('AdminOrderMoneyController (OpenAPI contract, R2 A3)', () => {
  let document: OpenAPIObject;
  let schemas: Record<string, SchemaLike>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminOrderMoneyController],
      providers: [
        { provide: OrderMoneyService, useValue: {} },
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

  const operation = (path: string, method: 'get' | 'post') =>
    (document.paths[path] as Record<string, { operationId?: string; responses: unknown }>)[method];

  it.each([
    ['/admin/orders/{orderId}/money', 'get', 'adminOrderMoneyControllerGet'],
    ['/admin/orders/{orderId}/money/in', 'post', 'adminOrderMoneyControllerRecordReceipt'],
    ['/admin/orders/{orderId}/money/out', 'post', 'adminOrderMoneyControllerRecordPayout'],
    [
      '/admin/orders/{orderId}/money/entries/{entryId}/reversal',
      'post',
      'adminOrderMoneyControllerReverseEntry',
    ],
    [
      '/admin/orders/{orderId}/money/entries/{entryId}/void',
      'post',
      'adminOrderMoneyControllerVoidEntry',
    ],
  ] as const)('%s %s → %s', (path, method, operationId) => {
    expect(operation(path, method).operationId).toBe(operationId);
  });

  it('answers a typed { data: OrderMoneyEntity } envelope', () => {
    expect(schemas.AdminOrderMoneyResponse.properties?.data.$ref).toBe(
      '#/components/schemas/OrderMoneyEntity',
    );
    const money = schemas.OrderMoneyEntity.properties ?? {};
    expect(money.totals.$ref).toBe('#/components/schemas/OrderMoneyTotalsEntity');
    expect(money.entries.items?.$ref).toBe('#/components/schemas/OrderMoneyEntryEntity');
    expect(money.returns.items?.$ref).toBe('#/components/schemas/OrderMoneyReturnEntity');
    expect(Object.keys(money)).toEqual(
      expect.arrayContaining([
        'updatedAt',
        'allowedInKinds',
        'refundablePayments',
        'outWithoutReturnMaxKop',
      ]),
    );
  });

  it('takes integer kopecks and a required lock token on every write', () => {
    for (const dto of ['RecordMoneyInDto', 'RecordMoneyOutDto']) {
      expect(schemas[dto].properties?.amountKop.type).toBe('integer');
      expect(schemas[dto].required).toEqual(
        expect.arrayContaining(['kind', 'amountKop', 'expectedUpdatedAt']),
      );
    }
    expect(schemas.MoneyCorrectionDto.required).toEqual(['reason', 'expectedUpdatedAt']);
  });
});
