import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { OrderListQueryDto } from './order-list-query.dto';

// Mirrors the global ValidationPipe behaviour from `main.ts` (transform +
// `enableImplicitConversion: true`) — the status transform must read the
// ORIGINAL query value from `obj` (see AdminOrderListQueryDto spec).
const toDto = (query: Record<string, unknown>): OrderListQueryDto =>
  plainToInstance(OrderListQueryDto, query, { enableImplicitConversion: true });

describe('OrderListQueryDto — status transform (TASK-217)', () => {
  it('resolves a single value to a one-element array', () => {
    expect(toDto({ status: 'PENDING' }).status).toEqual(['PENDING']);
  });

  it('splits a comma-separated string into a status array', () => {
    // The storefront «Скасовані» tab: one request, two statuses.
    expect(toDto({ status: 'CANCELLED,REFUNDED' }).status).toEqual(['CANCELLED', 'REFUNDED']);
  });

  it('tolerates repeated query params (?status=a&status=b)', () => {
    expect(toDto({ status: ['PENDING', 'SHIPPED'] }).status).toEqual(['PENDING', 'SHIPPED']);
  });

  it('trims whitespace and drops empty segments', () => {
    expect(toDto({ status: ' PENDING , ,SHIPPED,' }).status).toEqual(['PENDING', 'SHIPPED']);
  });

  it('resolves an absent status to undefined (no filter — all statuses)', () => {
    expect(toDto({}).status).toBeUndefined();
  });

  it('resolves an empty / whitespace-only status to undefined', () => {
    expect(toDto({ status: '' }).status).toBeUndefined();
    expect(toDto({ status: ' , ' }).status).toBeUndefined();
  });
});

describe('OrderListQueryDto — status validation (TASK-217)', () => {
  it('accepts a single valid status', async () => {
    expect(await validate(toDto({ status: 'PENDING' }))).toHaveLength(0);
  });

  it('accepts the four «Активні» statuses as one CSV', async () => {
    const errors = await validate(toDto({ status: 'PENDING,CONFIRMED,PROCESSING,SHIPPED' }));
    expect(errors).toHaveLength(0);
  });

  it('accepts an absent status (all statuses)', async () => {
    const errors = await validate(toDto({}));
    expect(errors.some((e) => e.property === 'status')).toBe(false);
  });

  it('rejects a lone invalid status', async () => {
    const errors = await validate(toDto({ status: 'BOGUS' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects a CSV containing an invalid status', async () => {
    const errors = await validate(toDto({ status: 'PENDING,BOGUS' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  it('rejects more statuses than the enum has values', async () => {
    const tooMany = [...Object.values(OrderStatus), 'PENDING'].join(',');
    const errors = await validate(toDto({ status: tooMany }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});

describe('OrderListQueryDto — pagination is unchanged (TASK-217)', () => {
  it('still coerces and validates page + limit next to a multi-status filter', async () => {
    const dto = toDto({ status: 'CANCELLED,REFUNDED', page: '2', limit: '20' });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(20);
  });

  it('still rejects a limit above 100', async () => {
    const errors = await validate(toDto({ limit: '101' }));
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
