import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminOrderExportQueryDto, AdminOrderListQueryDto } from './admin-order-list-query.dto';

// Mirrors the global ValidationPipe (transform + `enableImplicitConversion: true`).
const toDto = (query: Record<string, unknown>): AdminOrderListQueryDto =>
  plainToInstance(AdminOrderListQueryDto, query, { enableImplicitConversion: true });

const errorsFor = async (query: Record<string, unknown>, field: string) =>
  (await validate(toDto(query))).filter((e) => e.property === field);

describe('AdminOrderListQueryDto — deliveryMethod filter (TASK-648)', () => {
  it('resolves a single value to a one-element array', () => {
    expect(toDto({ deliveryMethod: 'PICKUP' }).deliveryMethod).toEqual(['PICKUP']);
  });

  it('splits a comma-separated value, trimming and dropping empty segments', () => {
    expect(toDto({ deliveryMethod: ' PICKUP, ,COURIER,' }).deliveryMethod).toEqual([
      'PICKUP',
      'COURIER',
    ]);
  });

  it('accepts repeated params (?deliveryMethod=a&deliveryMethod=b)', () => {
    expect(toDto({ deliveryMethod: ['NOVA_POSHTA', 'OTHER'] }).deliveryMethod).toEqual([
      'NOVA_POSHTA',
      'OTHER',
    ]);
  });

  it('resolves an absent or blank value to undefined (no filter)', () => {
    expect(toDto({}).deliveryMethod).toBeUndefined();
    expect(toDto({ deliveryMethod: ' , ' }).deliveryMethod).toBeUndefined();
  });

  it('validates every known method', async () => {
    expect(
      await errorsFor({ deliveryMethod: 'NOVA_POSHTA,PICKUP,COURIER,OTHER' }, 'deliveryMethod'),
    ).toHaveLength(0);
  });

  it('rejects an unknown method', async () => {
    expect(await errorsFor({ deliveryMethod: 'PICKUP,UKRPOSHTA' }, 'deliveryMethod')).toHaveLength(
      1,
    );
  });

  it('is inherited by the export query', () => {
    const dto = plainToInstance(
      AdminOrderExportQueryDto,
      { deliveryMethod: 'OTHER', pickupPointId: '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11' },
      { enableImplicitConversion: true },
    );
    expect(dto.deliveryMethod).toEqual(['OTHER']);
    expect(dto.pickupPointId).toBe('6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11');
  });
});

describe('AdminOrderListQueryDto — pickupPointId filter (TASK-648)', () => {
  it('accepts a uuid', async () => {
    expect(
      await errorsFor({ pickupPointId: '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11' }, 'pickupPointId'),
    ).toHaveLength(0);
  });

  it("accepts a seed-style uuid that is not RFC-4122 v4 ('loose', like userId)", async () => {
    expect(
      await errorsFor({ pickupPointId: '00000000-0000-0000-0000-000000000001' }, 'pickupPointId'),
    ).toHaveLength(0);
  });

  it('rejects a non-uuid', async () => {
    expect(await errorsFor({ pickupPointId: 'shop-1' }, 'pickupPointId')).toHaveLength(1);
  });
});
