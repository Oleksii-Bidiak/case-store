import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MoneyFlowEntriesQueryDto } from './money-flow-entries-query.dto';

function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(MoneyFlowEntriesQueryDto, query, { enableImplicitConversion: true });
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map(
    (e) => e.property,
  );
  return { dto, errors };
}

describe('MoneyFlowEntriesQueryDto (TASK-2395)', () => {
  it('accepts no query at all, with the first page of 50', () => {
    const { dto, errors } = parse({});
    expect(errors).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(50);
  });

  it('keeps the period fields of every report', () => {
    expect(parse({ preset: 'custom', from: '2026-08-01', to: '2026-08-31' }).errors).toEqual([]);
    expect(parse({ preset: '365d' }).errors).toEqual(['preset']);
  });

  it('converts page and limit from the query string', () => {
    const { dto, errors } = parse({ page: '3', limit: '500' });
    expect(errors).toEqual([]);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(500);
  });

  it.each([['0'], ['501'], ['1.5'], ['abc']])('rejects limit=%s', (limit) => {
    expect(parse({ limit }).errors).toEqual(['limit']);
  });

  it.each([['0'], ['-1'], ['abc']])('rejects page=%s', (page) => {
    expect(parse({ page }).errors).toEqual(['page']);
  });

  it('accepts every ledger kind and rejects anything else', () => {
    expect(parse({ kind: 'LIQPAY_REFUND' }).errors).toEqual([]);
    expect(parse({ kind: 'COD_NOVA_POSHTA' }).errors).toEqual([]);
    expect(parse({ kind: 'CASH' }).errors).toEqual(['kind']);
  });
});
