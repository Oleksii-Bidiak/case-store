import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductCardsQueryDto, PRODUCT_CARDS_MAX_IDS } from './product-cards-query.dto';

// Mirrors the global ValidationPipe behaviour from `main.ts` (transform +
// `enableImplicitConversion: true`) — see UserListQueryDto spec (TASK-150 B5)
// for why transforms must read the ORIGINAL query value.

const UUID_A = '550e8400-e29b-41d4-a716-446655440000';
const UUID_B = '660e8400-e29b-41d4-a716-446655440001';

const toDto = (query: Record<string, unknown>): ProductCardsQueryDto =>
  plainToInstance(ProductCardsQueryDto, query, { enableImplicitConversion: true });

describe('ProductCardsQueryDto — ids transform (TASK-211)', () => {
  it('splits a comma-separated string into an id array', () => {
    expect(toDto({ ids: `${UUID_A},${UUID_B}` }).ids).toEqual([UUID_A, UUID_B]);
  });

  it('accepts a single id', () => {
    expect(toDto({ ids: UUID_A }).ids).toEqual([UUID_A]);
  });

  it('tolerates repeated query params (?ids=a&ids=b)', () => {
    expect(toDto({ ids: [UUID_A, UUID_B] }).ids).toEqual([UUID_A, UUID_B]);
  });

  it('trims whitespace and drops empty segments', () => {
    expect(toDto({ ids: ` ${UUID_A} , ,${UUID_B},` }).ids).toEqual([UUID_A, UUID_B]);
  });

  it('validates: a well-formed CSV passes', async () => {
    const errors = await validate(toDto({ ids: `${UUID_A},${UUID_B}` }));
    expect(errors).toHaveLength(0);
  });

  it('validates: rejects an empty / absent ids param', async () => {
    for (const query of [{}, { ids: '' }, { ids: ' , ' }]) {
      const errors = await validate(toDto(query));
      expect(errors.some((e) => e.property === 'ids')).toBe(true);
    }
  });

  it('validates: rejects non-UUID entries', async () => {
    const errors = await validate(toDto({ ids: `${UUID_A},not-a-uuid` }));
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });

  it(`validates: rejects more than ${PRODUCT_CARDS_MAX_IDS} ids`, async () => {
    const tooMany = Array.from(
      { length: PRODUCT_CARDS_MAX_IDS + 1 },
      // Vary the last hex digits to keep every entry a distinct valid v4 UUID.
      (_, i) => `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(2, '0')}`,
    ).join(',');

    const errors = await validate(toDto({ ids: tooMany }));
    expect(errors.some((e) => e.property === 'ids')).toBe(true);
  });
});
