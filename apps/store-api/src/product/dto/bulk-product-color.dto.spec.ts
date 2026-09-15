import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkProductColorDto, MAX_COLOR_LENGTH } from './bulk-product-color.dto';

/**
 * Validation contract of `PATCH /api/products/color` (TASK-487).
 *
 * The two rules worth pinning are the ones a reader would not guess from the
 * decorators alone: `null` is a MEANING (clear the colour) while `undefined` is
 * a mistake, and the value is trimmed BEFORE validation so a whitespace-only
 * colour is rejected rather than stored as a nameless swatch.
 */
const ID = '11111111-1111-4111-8111-111111111111';

async function errorsFor(payload: unknown): Promise<string[]> {
  const dto = plainToInstance(BulkProductColorDto, payload);
  const errors = await validate(dto);
  return errors.map((error) => error.property);
}

describe('BulkProductColorDto (TASK-487)', () => {
  it('accepts a colour on a list of ids', async () => {
    expect(await errorsFor({ ids: [ID], color: 'Чорний' })).toEqual([]);
  });

  it('accepts an explicit null — clearing is a real operation', async () => {
    expect(await errorsFor({ ids: [ID], color: null })).toEqual([]);
  });

  it('REJECTS an omitted color', async () => {
    // An absent field would otherwise be indistinguishable from "clear it",
    // which is a destructive default for a request that forgot the field.
    expect(await errorsFor({ ids: [ID] })).toEqual(['color']);
  });

  it('rejects a blank colour', async () => {
    expect(await errorsFor({ ids: [ID], color: '   ' })).toEqual(['color']);
    expect(await errorsFor({ ids: [ID], color: '' })).toEqual(['color']);
  });

  it('trims the colour it stores', async () => {
    const dto = plainToInstance(BulkProductColorDto, { ids: [ID], color: '  Чорний  ' });
    expect(dto.color).toBe('Чорний');
  });

  it('rejects a colour longer than the cap', async () => {
    expect(await errorsFor({ ids: [ID], color: 'я'.repeat(MAX_COLOR_LENGTH + 1) })).toEqual([
      'color',
    ]);
  });

  it('rejects an empty id list', async () => {
    expect(await errorsFor({ ids: [], color: 'Чорний' })).toEqual(['ids']);
  });

  it('rejects duplicate ids with a 400 rather than a confusing 404', async () => {
    // The all-or-nothing check compares found-vs-asked counts and Prisma's
    // `id: { in: }` collapses duplicates, so `[X, X]` would abort with a 404
    // naming no ids at all.
    expect(await errorsFor({ ids: [ID, ID], color: 'Чорний' })).toEqual(['ids']);
  });

  it('rejects a non-UUID id', async () => {
    expect(await errorsFor({ ids: ['not-a-uuid'], color: 'Чорний' })).toEqual(['ids']);
  });
});
