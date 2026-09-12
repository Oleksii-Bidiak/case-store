import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ProductListQueryDto,
  parseSpecFilters,
  serializeSpecFilters,
  MAX_SPEC_FACETS,
  MAX_SPEC_VALUES_PER_FACET,
} from './product-list-query.dto';

/**
 * Unit tests for the `specs` facet parser (TASK-191-D, extended to multi-value
 * by TASK-414 / owner decision B-10). The DTO keeps `specs` a plain string on
 * the wire (so it maps to a normal query param); the service parses it into the
 * requested facets, ignoring malformed input rather than rejecting it.
 */
describe('parseSpecFilters (specs facet param)', () => {
  it('parses a well-formed single key:value pair (the legacy form)', () => {
    expect(parseSpecFilters('material:Силікон')).toEqual([
      { key: 'material', values: ['Силікон'] },
    ]);
  });

  it('parses several values inside one facet (OR within a facet)', () => {
    expect(parseSpecFilters('material:Силікон,TPU')).toEqual([
      { key: 'material', values: ['Силікон', 'TPU'] },
    ]);
  });

  it('parses several facets (AND between facets)', () => {
    expect(parseSpecFilters('material:Силікон,TPU;case-type:Накладка')).toEqual([
      { key: 'material', values: ['Силікон', 'TPU'] },
      { key: 'case-type', values: ['Накладка'] },
    ]);
  });

  it('splits the key on the first colon only (a value may contain colons)', () => {
    expect(parseSpecFilters('ratio:16:9')).toEqual([{ key: 'ratio', values: ['16:9'] }]);
  });

  it('trims surrounding whitespace on keys and values', () => {
    expect(parseSpecFilters(' material : Силікон , TPU ')).toEqual([
      { key: 'material', values: ['Силікон', 'TPU'] },
    ]);
  });

  it('de-duplicates repeated values within a facet', () => {
    expect(parseSpecFilters('material:TPU,TPU,Силікон')).toEqual([
      { key: 'material', values: ['TPU', 'Силікон'] },
    ]);
  });

  it('MERGES a repeated key rather than emitting two AND-ed facets', () => {
    // Two AND-ed conditions on the same definition can never both match
    // (@@unique([productId, definitionId])), so merging is the only reading
    // that is not silently empty.
    expect(parseSpecFilters('material:Силікон;material:TPU')).toEqual([
      { key: 'material', values: ['Силікон', 'TPU'] },
    ]);
  });

  it('skips malformed chunks instead of rejecting the whole param', () => {
    expect(parseSpecFilters('material;:Силікон;form:;case-type:Накладка')).toEqual([
      { key: 'case-type', values: ['Накладка'] },
    ]);
  });

  it('returns an empty list for missing, empty or wholly malformed input', () => {
    expect(parseSpecFilters(undefined)).toEqual([]);
    expect(parseSpecFilters('')).toEqual([]);
    expect(parseSpecFilters('material')).toEqual([]);
    expect(parseSpecFilters(':Силікон')).toEqual([]);
    expect(parseSpecFilters('material:')).toEqual([]);
  });

  it('discards facets past MAX_SPEC_FACETS instead of failing', () => {
    const raw = Array.from({ length: MAX_SPEC_FACETS + 3 }, (_, i) => `k${i}:v`).join(';');

    const parsed = parseSpecFilters(raw);

    expect(parsed).toHaveLength(MAX_SPEC_FACETS);
    expect(parsed.map((facet) => facet.key)).toEqual(
      Array.from({ length: MAX_SPEC_FACETS }, (_, i) => `k${i}`),
    );
  });

  it('discards values past MAX_SPEC_VALUES_PER_FACET instead of failing', () => {
    const values = Array.from({ length: MAX_SPEC_VALUES_PER_FACET + 5 }, (_, i) => `v${i}`);

    const parsed = parseSpecFilters(`material:${values.join(',')}`);

    expect(parsed[0].values).toHaveLength(MAX_SPEC_VALUES_PER_FACET);
    expect(parsed[0].values).toEqual(values.slice(0, MAX_SPEC_VALUES_PER_FACET));
  });
});

describe('serializeSpecFilters', () => {
  it('round-trips the multi-value form', () => {
    const raw = 'material:Силікон,TPU;case-type:Накладка';

    expect(serializeSpecFilters(parseSpecFilters(raw))).toBe(raw);
  });

  it('is undefined when nothing is filtered (so the cache key omits the field)', () => {
    expect(serializeSpecFilters([])).toBeUndefined();
  });
});

/**
 * Reproduces the global ValidationPipe behaviour (`transform` +
 * `enableImplicitConversion: true`): the raw query string is Boolean-coerced
 * BEFORE any `@Transform` runs, and `Boolean('false')` is `true`. Every boolean
 * filter on this DTO must therefore derive its value from the ORIGINAL string
 * via `obj[key]` (TASK-179 / TASK-230 / TASK-414).
 */
describe('ProductListQueryDto — boolean transforms under enableImplicitConversion', () => {
  const toDto = (query: Record<string, unknown>): ProductListQueryDto =>
    plainToInstance(ProductListQueryDto, query, { enableImplicitConversion: true });

  describe.each(['onSale', 'inStock', 'outOfStock', 'isActive'] as const)('%s', (field) => {
    it('coerces "true" to boolean true', () => {
      expect(toDto({ [field]: 'true' })[field]).toBe(true);
    });

    it('coerces "false" to boolean false (not the truthy-string trap)', () => {
      expect(toDto({ [field]: 'false' })[field]).toBe(false);
    });

    it('leaves the field undefined when the param is absent', () => {
      expect(toDto({})[field]).toBeUndefined();
    });

    it('treats an unrecognised value as no filter (undefined)', () => {
      expect(toDto({ [field]: 'banana' })[field]).toBeUndefined();
    });

    it('passes class-validator for each of true / false / absent', async () => {
      for (const query of [{ [field]: 'true' }, { [field]: 'false' }, {}]) {
        const errors = await validate(toDto(query));
        expect(errors.filter((error) => error.property === field)).toHaveLength(0);
      }
    });
  });
});

describe('ProductListQueryDto — specs length cap', () => {
  const toDto = (query: Record<string, unknown>): ProductListQueryDto =>
    plainToInstance(ProductListQueryDto, query, { enableImplicitConversion: true });

  it('accepts a realistic full-width multi-facet param', async () => {
    const raw = Array.from(
      { length: MAX_SPEC_FACETS },
      (_, i) => `facet-${i}:Силікон,Пластик,Шкіра`,
    ).join(';');

    const errors = await validate(toDto({ specs: raw }));

    expect(raw.length).toBeLessThanOrEqual(600);
    expect(errors.filter((error) => error.property === 'specs')).toHaveLength(0);
  });

  it('rejects a specs param longer than the cap', async () => {
    const errors = await validate(toDto({ specs: `material:${'a'.repeat(600)}` }));

    expect(errors.filter((error) => error.property === 'specs')).toHaveLength(1);
  });
});
