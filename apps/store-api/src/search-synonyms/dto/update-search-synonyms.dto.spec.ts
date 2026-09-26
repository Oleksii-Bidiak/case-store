import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  SYNONYM_GROUPS_MAX,
  SYNONYM_TERMS_MAX,
  UpdateSearchSynonymsDto,
  normalizeSynonymTerms,
} from './update-search-synonyms.dto';

async function check(body: unknown) {
  // Same transform options as the global ValidationPipe in main.ts.
  const dto = plainToInstance(UpdateSearchSynonymsDto, body, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors };
}

/** Every constraint message, flattened through the nested groups. */
function messages(errors: Awaited<ReturnType<typeof validate>>): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...messages(error.children ?? []),
  ]);
}

describe('normalizeSynonymTerms', () => {
  it('trims, lowercases, drops blanks and de-duplicates, keeping order', () => {
    expect(normalizeSynonymTerms(['  Чохол ', 'CASE', '', 'чохол', 'cases'])).toEqual([
      'чохол',
      'case',
      'cases',
    ]);
  });

  it('leaves non-strings for the validator to reject', () => {
    expect(normalizeSynonymTerms(['a', 5])).toEqual(['a', 5]);
    expect(normalizeSynonymTerms('not an array')).toBe('not an array');
  });
});

describe('UpdateSearchSynonymsDto (TASK-559)', () => {
  it('accepts a list and stores the normalised terms', async () => {
    const { dto, errors } = await check({
      groups: [{ terms: ['Айфон', ' iPhone '] }, { terms: ['чохол', 'case'] }],
    });

    expect(errors).toEqual([]);
    expect(dto.groups.map((g) => g.terms)).toEqual([
      ['айфон', 'iphone'],
      ['чохол', 'case'],
    ]);
  });

  it('accepts an empty list (restore the defaults)', async () => {
    const { errors } = await check({ groups: [] });
    expect(errors).toEqual([]);
  });

  it('rejects a group that is one word once duplicates are folded', async () => {
    const { errors } = await check({ groups: [{ terms: ['Чохол', 'чохол '] }] });
    expect(messages(errors).join(' ')).toMatch(/at least 2 different words/);
  });

  it.each([['type-c'], ["пам'ять"], ['two words'], ['a.b']])(
    'rejects %j — not a single word the engine could match',
    async (term) => {
      const { errors } = await check({ groups: [{ terms: [term, 'ok'] }] });
      expect(messages(errors).join(' ')).toMatch(/single word/);
    },
  );

  it('rejects a non-string term', async () => {
    const { errors } = await check({ groups: [{ terms: ['ok', 5] }] });
    expect(messages(errors).join(' ')).toMatch(/must be text/);
  });

  it('rejects too many words in one group', async () => {
    const terms = Array.from({ length: SYNONYM_TERMS_MAX + 1 }, (_, i) => `слово${i}`);
    const { errors } = await check({ groups: [{ terms }] });
    expect(messages(errors).join(' ')).toMatch(/at most 20 words/);
  });

  it('rejects too many groups', async () => {
    const groups = Array.from({ length: SYNONYM_GROUPS_MAX + 1 }, (_, i) => ({
      terms: [`a${i}`, `b${i}`],
    }));
    const { errors } = await check({ groups });
    expect(messages(errors).join(' ')).toMatch(/At most 300 synonym groups/);
  });

  it('rejects a term longer than the cap', async () => {
    const { errors } = await check({ groups: [{ terms: ['a'.repeat(41), 'ok'] }] });
    expect(messages(errors).join(' ')).toMatch(/at most 40 characters/);
  });

  it('rejects unknown fields (whitelist)', async () => {
    const { errors } = await check({ groups: [{ terms: ['a', 'b'], id: 'x' }] });
    expect(errors.length).toBeGreaterThan(0);
  });
});
