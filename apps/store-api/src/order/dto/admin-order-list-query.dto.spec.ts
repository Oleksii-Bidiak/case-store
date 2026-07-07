import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { AdminOrderListQueryDto } from './admin-order-list-query.dto';

// Mirrors the global ValidationPipe behaviour from `main.ts` (transform +
// `enableImplicitConversion: true`) — see ProductCardsQueryDto spec (TASK-211)
// for why transforms must read the ORIGINAL query value from `obj`.
const toDto = (query: Record<string, unknown>): AdminOrderListQueryDto =>
  plainToInstance(AdminOrderListQueryDto, query, { enableImplicitConversion: true });

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
