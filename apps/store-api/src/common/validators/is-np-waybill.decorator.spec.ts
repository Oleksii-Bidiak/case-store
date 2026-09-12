import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOrderDetailsDto } from '../../order/dto/update-order-details.dto';
import { normalizeWaybill, waybillDigits } from './is-np-waybill.decorator';

/**
 * `@IsNovaPoshtaWaybill()` on the ТТН field (AD-ORD-18, TASK-426).
 *
 * The field carried only `@MaxLength(64)`, so `123` was an acceptable waybill —
 * and saving one on a SHIPPED order emails the customer their tracking notice, so
 * the typo leaves the building.
 */

function dtoFor(trackingNumber: unknown): UpdateOrderDetailsDto {
  return plainToInstance(UpdateOrderDetailsDto, { trackingNumber });
}

async function waybillErrors(trackingNumber: unknown) {
  const errors = await validate(dtoFor(trackingNumber));
  return errors.filter((error) => error.property === 'trackingNumber');
}

describe('waybillDigits / normalizeWaybill', () => {
  it.each([
    ['20450000000001', '20450000000001'],
    ['2045 0000 0000 01', '20450000000001'],
    ['2045-0000-0000-01', '20450000000001'],
    ['  20450000000001  ', '20450000000001'],
  ])('reduces %s to %s', (input, expected) => {
    expect(normalizeWaybill({ value: input })).toBe(expected);
  });

  it('turns a cleared field into null rather than an empty string', () => {
    expect(normalizeWaybill({ value: '' })).toBeNull();
    expect(normalizeWaybill({ value: '   ' })).toBeNull();
  });

  it('leaves a value that is not waybill-shaped alone, so the rule can refuse it', () => {
    // Normalising this would delete the operator's note and let the leftover
    // digits pass as a waybill — the guard exists precisely to prevent that.
    expect(normalizeWaybill({ value: '2045 0000 0000 01 — перевірити' })).toBe(
      '2045 0000 0000 01 — перевірити',
    );
  });

  it('leaves a non-string value alone so @IsString still reports it', () => {
    expect(normalizeWaybill({ value: 20450000000001 })).toBe(20450000000001);
  });

  it('counts digits, not characters', () => {
    expect(waybillDigits('2045 0000 0000 01')).toHaveLength(14);
    expect(waybillDigits('--------------')).toHaveLength(0);
  });
});

describe('UpdateOrderDetailsDto.trackingNumber', () => {
  it.each([
    ['20450000000001', 'the plain 14 digits NP issues'],
    ['2045 0000 0000 01', 'pasted out of the courier interface with spaces'],
    ['2045-0000-0000-01', 'typed with dashes'],
  ])('accepts %s (%s)', async (waybill) => {
    expect(await waybillErrors(waybill)).toHaveLength(0);
  });

  it.each([
    ['123', 'the three digits @MaxLength(64) waved through'],
    ['2045000000000', 'thirteen digits — one short'],
    ['204500000000012', 'fifteen digits — one too many'],
    ['--------------', 'fourteen separators and no waybill at all'],
    ['перевірю пізніше', 'a note where a number belongs'],
    ['2045 0000 0000 01 — перевірити', 'a waybill with a note appended'],
  ])('rejects %s (%s)', async (waybill) => {
    expect((await waybillErrors(waybill)).length).toBeGreaterThan(0);
  });

  it('explains the rule rather than just failing', async () => {
    const [error] = await waybillErrors('123');
    expect(Object.values(error.constraints ?? {}).join('; ')).toContain('14 digits');
  });

  // Clearing the ТТН stays legal: `null` is how an operator removes a waybill
  // they saved by mistake, and @IsOptional skips the rule for it.
  it.each([[null], [undefined], ['']])('accepts %p as "cleared"', async (waybill) => {
    expect(await waybillErrors(waybill)).toHaveLength(0);
  });

  it('normalises a pasted waybill before it reaches the repository', () => {
    expect(dtoFor('2045 0000 0000 01').trackingNumber).toBe('20450000000001');
  });
});
