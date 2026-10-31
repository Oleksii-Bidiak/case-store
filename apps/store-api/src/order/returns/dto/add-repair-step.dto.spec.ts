import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AddRepairStepDto } from './add-repair-step.dto';

/** The DTO as the global ValidationPipe sees it: transformed, then validated. */
const parse = (body: Record<string, unknown>) => {
  const dto = plainToInstance(AddRepairStepDto, body);
  return { dto, errors: validateSync(dto) };
};

describe('AddRepairStepDto (TASK-2045)', () => {
  it.each(['ACCEPTED', 'SENT_TO_SERVICE', 'RETURNED_FROM_SERVICE', 'HANDED_TO_CUSTOMER'])(
    'accepts the step %s',
    (step) => {
      expect(parse({ step }).errors).toEqual([]);
    },
  );

  it('requires a step', () => {
    expect(parse({ note: 'x' }).errors).not.toEqual([]);
  });

  it('rejects a step outside the enum', () => {
    expect(parse({ step: 'IN_REPAIR' }).errors).not.toEqual([]);
  });

  it.each(['REPAIRED', 'UNREPAIRABLE'])('accepts the result %s', (result) => {
    expect(parse({ step: 'RETURNED_FROM_SERVICE', result }).errors).toEqual([]);
  });

  it('rejects a result outside the enum', () => {
    expect(parse({ step: 'RETURNED_FROM_SERVICE', result: 'BROKEN' }).errors).not.toEqual([]);
  });

  it.each([
    ['destination', 300],
    ['ttn', 64],
    ['note', 2000],
  ])('caps %s at %i characters', (field, max) => {
    expect(parse({ step: 'ACCEPTED', [field]: 'а'.repeat(max) }).errors).toEqual([]);
    expect(parse({ step: 'ACCEPTED', [field]: 'а'.repeat(max + 1) }).errors).not.toEqual([]);
  });

  it.each(['destination', 'ttn', 'note'])('trims %s and turns a blank one into null', (field) => {
    const trimmed = parse({ step: 'ACCEPTED', [field]: '  СЦ  ' }).dto as unknown as Record<
      string,
      unknown
    >;
    const blank = parse({ step: 'ACCEPTED', [field]: '   ' }).dto as unknown as Record<
      string,
      unknown
    >;
    expect(trimmed[field]).toBe('СЦ');
    expect(blank[field]).toBeNull();
  });

  it('rejects a waybill that is not a string', () => {
    expect(parse({ step: 'SENT_TO_SERVICE', ttn: 20450000000001 }).errors).not.toEqual([]);
  });
});
