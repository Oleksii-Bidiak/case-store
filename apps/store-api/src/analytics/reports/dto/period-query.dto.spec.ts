import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PeriodQueryDto } from './period-query.dto';

function errorsOf(query: Record<string, unknown>): string[] {
  const dto = plainToInstance(PeriodQueryDto, query, { enableImplicitConversion: true });
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);
}

describe('PeriodQueryDto (TASK-685)', () => {
  it('accepts no query at all (the default preset applies)', () => {
    expect(errorsOf({})).toEqual([]);
  });

  it.each(['7d', '30d', '90d', 'this-month', 'last-month', 'custom'])(
    'accepts preset %s',
    (preset) => {
      expect(errorsOf({ preset })).toEqual([]);
    },
  );

  it('rejects an unknown preset', () => {
    expect(errorsOf({ preset: '365d' })).toEqual(['preset']);
  });

  it('accepts days and rejects anything that is not YYYY-MM-DD', () => {
    expect(errorsOf({ preset: 'custom', from: '2026-08-01', to: '2026-08-31' })).toEqual([]);
    expect(errorsOf({ preset: 'custom', from: '2026-08-01T00:00:00Z', to: '1/9/2026' })).toEqual([
      'from',
      'to',
    ]);
  });

  it('rejects unknown query parameters', () => {
    expect(errorsOf({ days: 30 })).toEqual(['days']);
  });
});
