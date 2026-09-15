import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { AdminOrderExportQueryDto, AdminOrderListQueryDto } from './admin-order-list-query.dto';

// Mirrors the global ValidationPipe behaviour from `main.ts` (transform +
// `enableImplicitConversion: true`) — transforms must read the ORIGINAL query
// value from `obj` (see ProductCardsQueryDto / ProductListQueryDto specs).
const toDto = (query: Record<string, unknown>): AdminOrderListQueryDto =>
  plainToInstance(AdminOrderListQueryDto, query, { enableImplicitConversion: true });

describe('AdminOrderListQueryDto — unpaidInTransit boolean transform (TASK-248)', () => {
  it('resolves ?unpaidInTransit=true to boolean true', () => {
    expect(toDto({ unpaidInTransit: 'true' }).unpaidInTransit).toBe(true);
  });

  it('resolves ?unpaidInTransit=false to boolean false (not true)', () => {
    expect(toDto({ unpaidInTransit: 'false' }).unpaidInTransit).toBe(false);
  });

  it('leaves unpaidInTransit undefined when the param is absent', () => {
    expect(toDto({}).unpaidInTransit).toBeUndefined();
  });

  it('coerces an already-boolean value through unchanged', () => {
    expect(toDto({ unpaidInTransit: true }).unpaidInTransit).toBe(true);
    expect(toDto({ unpaidInTransit: false }).unpaidInTransit).toBe(false);
  });
});

describe('AdminOrderListQueryDto — status transform (TASK-250)', () => {
  it('resolves a single value to a one-element array', () => {
    expect(toDto({ status: 'PENDING' }).status).toEqual(['PENDING']);
  });

  it('splits a comma-separated string into a status array', () => {
    expect(toDto({ status: 'CONFIRMED,PROCESSING' }).status).toEqual(['CONFIRMED', 'PROCESSING']);
  });

  it('tolerates repeated query params (?status=a&status=b)', () => {
    expect(toDto({ status: ['CONFIRMED', 'PROCESSING'] }).status).toEqual([
      'CONFIRMED',
      'PROCESSING',
    ]);
  });

  it('trims whitespace and drops empty segments', () => {
    expect(toDto({ status: ' CONFIRMED , ,PROCESSING,' }).status).toEqual([
      'CONFIRMED',
      'PROCESSING',
    ]);
  });

  it('resolves an absent status to undefined (no filter — all statuses)', () => {
    expect(toDto({}).status).toBeUndefined();
  });

  it('resolves an empty / whitespace-only status to undefined', () => {
    expect(toDto({ status: '' }).status).toBeUndefined();
    expect(toDto({ status: ' , ' }).status).toBeUndefined();
  });
});

describe('AdminOrderListQueryDto — status validation (TASK-250)', () => {
  it('accepts a single valid status', async () => {
    const errors = await validate(toDto({ status: 'PENDING' }));
    expect(errors).toHaveLength(0);
  });

  it('accepts a well-formed multi-status CSV', async () => {
    const errors = await validate(toDto({ status: 'CONFIRMED,PROCESSING' }));
    expect(errors).toHaveLength(0);
  });

  it('accepts an absent status (all statuses)', async () => {
    const errors = await validate(toDto({}));
    expect(errors.some((e) => e.property === 'status')).toBe(false);
  });

  it('rejects a CSV containing an invalid status', async () => {
    const errors = await validate(toDto({ status: 'CONFIRMED,BOGUS' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects more statuses than the enum has values', async () => {
    const tooMany = [...Object.values(OrderStatus), 'PENDING'].join(',');
    const errors = await validate(toDto({ status: tooMany }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});

describe('AdminOrderListQueryDto — inherited fields survive OmitType (TASK-250)', () => {
  it('still validates pagination + admin-only fields', async () => {
    const dto = toDto({
      status: 'PENDING',
      page: 2,
      limit: 20,
      userId: '550e8400-e29b-41d4-a716-446655440000',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      sortBy: 'total',
      sortOrder: 'asc',
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(20);
    expect(dto.sortBy).toBe('total');
    expect(dto.sortOrder).toBe('asc');
  });

  it('rejects an out-of-range page inherited from the base DTO', async () => {
    const errors = await validate(toDto({ page: 0 }));
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejects a non-allow-listed sortBy', async () => {
    const errors = await validate(toDto({ sortBy: 'bogus' }));
    expect(errors.some((e) => e.property === 'sortBy')).toBe(true);
  });
});

describe('AdminOrderListQueryDto — payment + overdue filters (TASK-425)', () => {
  it('accepts a valid payment status and payment method', async () => {
    const dto = toDto({
      paymentStatus: PaymentStatus.FAILED,
      paymentMethod: PaymentMethod.ONLINE,
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.paymentStatus).toBe(PaymentStatus.FAILED);
    expect(dto.paymentMethod).toBe(PaymentMethod.ONLINE);
  });

  it('rejects an unknown payment status', async () => {
    const errors = await validate(toDto({ paymentStatus: 'BOGUS' }));
    expect(errors.some((e) => e.property === 'paymentStatus')).toBe(true);
  });

  it('rejects an unknown payment method', async () => {
    const errors = await validate(toDto({ paymentMethod: 'BITCOIN' }));
    expect(errors.some((e) => e.property === 'paymentMethod')).toBe(true);
  });

  it('resolves ?pendingOverdue=true to boolean true', () => {
    expect(toDto({ pendingOverdue: 'true' }).pendingOverdue).toBe(true);
  });

  it('resolves ?pendingOverdue=false to boolean false (not true)', () => {
    // The same `Boolean('false') === true` trap `unpaidInTransit` guards against:
    // without reading the ORIGINAL value, turning the chip OFF would turn it on.
    expect(toDto({ pendingOverdue: 'false' }).pendingOverdue).toBe(false);
  });

  it('leaves pendingOverdue undefined when the param is absent', () => {
    expect(toDto({}).pendingOverdue).toBeUndefined();
  });
});

/**
 * The four derived-mark filters (TASK-470 / 471).
 *
 * Each repeats the `Boolean('false') === true` guard the rest of this DTO lives
 * by, and each is tested for it individually rather than in a loop: a
 * copy-pasted transform that quietly reads `value` instead of `obj` looks
 * identical to its neighbours and fails only in the one direction nobody clicks
 * on purpose — turning the chip OFF turns it on.
 */
describe.each([
  ['hasDebt'],
  ['awaitingPayment'],
  ['reservationExpired'],
  ['hasUnavailableItems'],
] as const)('AdminOrderListQueryDto — %s boolean transform (TASK-470/471)', (param) => {
  it(`resolves ?${param}=true to boolean true`, () => {
    expect(toDto({ [param]: 'true' })[param]).toBe(true);
  });

  it(`resolves ?${param}=false to boolean false (not true)`, () => {
    expect(toDto({ [param]: 'false' })[param]).toBe(false);
  });

  it('leaves it undefined when the param is absent', () => {
    expect(toDto({})[param]).toBeUndefined();
  });

  it('passes an already-boolean value through unchanged', () => {
    expect(toDto({ [param]: true })[param]).toBe(true);
    expect(toDto({ [param]: false })[param]).toBe(false);
  });

  it('validates clean when set', async () => {
    expect(await validate(toDto({ [param]: 'true' }))).toHaveLength(0);
  });
});

describe('AdminOrderListQueryDto — the marks compose (TASK-470/471)', () => {
  it('accepts two mark filters at once', async () => {
    // Independent booleans rather than one `?mark=` enum precisely so this is
    // expressible: "delivered, unpaid AND missing a position" is one question an
    // operator asks, not two.
    const dto = toDto({ hasDebt: 'true', hasUnavailableItems: 'true' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.hasDebt).toBe(true);
    expect(dto.hasUnavailableItems).toBe(true);
  });
});

describe('AdminOrderExportQueryDto (TASK-425)', () => {
  const toExportDto = (query: Record<string, unknown>): AdminOrderExportQueryDto =>
    plainToInstance(AdminOrderExportQueryDto, query, { enableImplicitConversion: true });

  it('keeps every list FILTER', async () => {
    const dto = toExportDto({
      status: 'CONFIRMED,PROCESSING',
      search: 'ABC12345',
      userId: '550e8400-e29b-41d4-a716-446655440000',
      dateFrom: '2026-01-01',
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.ON_DELIVERY,
      pendingOverdue: 'true',
      unpaidInTransit: 'true',
      // TASK-470 / 471: the export's promise is "the rows you are looking at",
      // so a mark filter that narrowed the screen and not the file would hand the
      // operator a spreadsheet that silently disagrees with it.
      hasDebt: 'true',
      awaitingPayment: 'true',
      reservationExpired: 'true',
      hasUnavailableItems: 'true',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.hasDebt).toBe(true);
    expect(dto.awaitingPayment).toBe(true);
    expect(dto.reservationExpired).toBe(true);
    expect(dto.hasUnavailableItems).toBe(true);
    expect(dto.status).toEqual(['CONFIRMED', 'PROCESSING']);
    expect(dto.search).toBe('ABC12345');
    expect(dto.paymentStatus).toBe(PaymentStatus.PAID);
    expect(dto.paymentMethod).toBe(PaymentMethod.ON_DELIVERY);
    expect(dto.pendingOverdue).toBe(true);
    expect(dto.unpaidInTransit).toBe(true);
  });

  it('drops pagination and sorting — the export is the whole selection', async () => {
    const dto = toExportDto({ page: 3, limit: 50, sortBy: 'total', sortOrder: 'asc' });

    // OmitType removes the DECORATED properties, and the app's ValidationPipe runs
    // `whitelist + forbidNonWhitelisted` (main.ts) — so a caller who pages or sorts
    // an export is refused outright rather than handed a file that is neither the
    // page they asked for nor the whole selection.
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    const rejected = errors.map((e) => e.property);
    expect(rejected).toEqual(expect.arrayContaining(['page', 'limit', 'sortBy', 'sortOrder']));
  });

  it('still rejects an invalid filter', async () => {
    const errors = await validate(toExportDto({ status: 'BOGUS' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
