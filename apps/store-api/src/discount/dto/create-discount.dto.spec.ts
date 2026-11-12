import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDiscountDto } from './create-discount.dto';
import { UpdateDiscountDto } from './update-discount.dto';

// Mirrors the global ValidationPipe in main.ts (transform + implicit conversion).
async function errorsFor<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(cls, body, { enableImplicitConversion: true });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
}

const base = { code: 'SUMMER10', type: 'PERCENT', value: 10 };

describe('CreateDiscountDto — minSpend (TASK-797)', () => {
  it('rejects minSpend: null (was new Prisma.Decimal(null) → 500 in the service)', async () => {
    expect(await errorsFor(CreateDiscountDto, { ...base, minSpend: null })).toContain('minSpend');
  });

  it('accepts an omitted minSpend (no minimum)', async () => {
    expect(await errorsFor(CreateDiscountDto, base)).toEqual([]);
  });

  it('accepts a numeric minSpend', async () => {
    expect(await errorsFor(CreateDiscountDto, { ...base, minSpend: 500 })).toEqual([]);
  });
});

describe('UpdateDiscountDto — minSpend', () => {
  it('still accepts minSpend: null on update (clears the minimum)', async () => {
    expect(await errorsFor(UpdateDiscountDto, { minSpend: null })).toEqual([]);
  });
});

describe('CreateDiscountDto — money ceiling (TASK-1984)', () => {
  const fixed = { ...base, type: 'FIXED' };

  it('accepts the largest amount Decimal(10, 2) holds', async () => {
    expect(
      await errorsFor(CreateDiscountDto, {
        ...fixed,
        value: 99_999_999.99,
        minSpend: 99_999_999.99,
      }),
    ).toEqual([]);
  });

  it('refuses an amount above it instead of overflowing the column', async () => {
    const errors = await errorsFor(CreateDiscountDto, {
      ...fixed,
      value: 100_000_000,
      minSpend: 100_000_000,
    });
    expect(errors).toEqual(expect.arrayContaining(['value', 'minSpend']));
  });
});
