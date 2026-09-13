import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProductDto } from '../../product/dto/update-product.dto';
import { KEYWORDS_MAX_COUNT, KEYWORD_MAX_LENGTH, normalizeKeywords } from './seo-fields.decorator';

/**
 * The shared `keywords` / `ogImage` field contract (TASK-437).
 *
 * Exercised through `UpdateProductDto` because that is how the decorators are
 * actually used — the composed decorator has to survive `plainToInstance` +
 * `validate()` in the same order the global pipe runs them (transform first,
 * then validation), and a unit test of the bare function would not prove that.
 */

function dtoFor(patch: Record<string, unknown>): UpdateProductDto {
  return plainToInstance(UpdateProductDto, patch);
}

async function errorsFor(patch: Record<string, unknown>, property: string) {
  const errors = await validate(dtoFor(patch));
  return errors.filter((error) => error.property === property);
}

describe('normalizeKeywords', () => {
  it('trims every entry and drops the blanks', () => {
    expect(normalizeKeywords({ value: ['  magsafe ', '', '   ', 'чохол'] })).toEqual([
      'magsafe',
      'чохол',
    ]);
  });

  it('collapses case-insensitive duplicates, keeping the first spelling', () => {
    expect(normalizeKeywords({ value: ['MagSafe', 'magsafe', 'MAGSAFE'] })).toEqual(['MagSafe']);
  });

  it('passes a non-array through untouched so @IsArray reports the type error', () => {
    expect(normalizeKeywords({ value: 'magsafe' })).toBe('magsafe');
    expect(normalizeKeywords({ value: null })).toBeNull();
  });

  it('passes a non-string entry through so @IsString({ each }) reports it', () => {
    expect(normalizeKeywords({ value: ['ok', 42] })).toEqual(['ok', 42]);
  });
});

describe('keywords field', () => {
  it('accepts a normal tag list', async () => {
    expect(await errorsFor({ keywords: ['magsafe', 'ударостійкий'] }, 'keywords')).toHaveLength(0);
  });

  it('accepts an empty array — that is how the admin clears the tags', async () => {
    expect(await errorsFor({ keywords: [] }, 'keywords')).toHaveLength(0);
  });

  it('rejects more than the cap', async () => {
    const tooMany = Array.from({ length: KEYWORDS_MAX_COUNT + 1 }, (_, i) => `tag-${i}`);
    expect(await errorsFor({ keywords: tooMany }, 'keywords')).toHaveLength(1);
  });

  it('rejects a tag longer than the cap', async () => {
    const tooLong = 'x'.repeat(KEYWORD_MAX_LENGTH + 1);
    expect(await errorsFor({ keywords: [tooLong] }, 'keywords')).toHaveLength(1);
  });

  it('rejects a bare string — a comma-joined value is the client’s job to split', async () => {
    expect(await errorsFor({ keywords: 'magsafe,чохол' }, 'keywords')).toHaveLength(1);
  });

  it('rejects an explicit null instead of letting it reach Prisma', async () => {
    // `@IsOptional()` would skip every validator here and the `String[]` column
    // would answer with a 500. A list clears by being empty, never by being null.
    expect(await errorsFor({ keywords: null }, 'keywords')).toHaveLength(1);
  });

  it('still treats an absent field as "leave the stored tags alone"', async () => {
    expect(await errorsFor({}, 'keywords')).toHaveLength(0);
  });
});

describe('ogImage field', () => {
  it('accepts an https URL', async () => {
    expect(
      await errorsFor({ ogImage: 'https://cdn.example.com/og/case.jpg' }, 'ogImage'),
    ).toHaveLength(0);
  });

  it('accepts the TLD-less origin store-api itself serves in dev', async () => {
    expect(
      await errorsFor({ ogImage: 'http://localhost:3001/uploads/products/case-1.webp' }, 'ogImage'),
    ).toHaveLength(0);
  });

  it('accepts an explicit null — that is how the admin clears the override', async () => {
    expect(await errorsFor({ ogImage: null }, 'ogImage')).toHaveLength(0);
  });

  it.each([
    ['javascript:alert(1)', 'a script URL'],
    ['/uploads/products/case-1.webp', 'a bare relative path'],
    [
      'cdn.example.com/og/case.jpg',
      'a host with no scheme — Next would resolve it against our own origin',
    ],
    ['//cdn.example.com/og/case.jpg', 'a protocol-relative URL'],
    ['', 'an empty string — blank must be sent as null, not as ""'],
  ])('rejects %s (%s)', async (ogImage) => {
    expect(await errorsFor({ ogImage }, 'ogImage')).toHaveLength(1);
  });
});
