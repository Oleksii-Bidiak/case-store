import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductListQueryDto, parseSpecFilter } from './product-list-query.dto';

/**
 * Unit tests for the `specs` facet parser (TASK-191-D). The DTO keeps `specs` a
 * plain string on the wire (so it maps to a normal query param); the service
 * parses a single `key:value` pair, ignoring malformed input.
 */
describe('parseSpecFilter (specs facet param)', () => {
  it('parses a well-formed key:value pair', () => {
    expect(parseSpecFilter('material:Силікон')).toEqual({ key: 'material', value: 'Силікон' });
  });

  it('splits on the first colon only (value may contain colons)', () => {
    expect(parseSpecFilter('ratio:16:9')).toEqual({ key: 'ratio', value: '16:9' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseSpecFilter(' material : Силікон ')).toEqual({
      key: 'material',
      value: 'Силікон',
    });
  });

  it('ignores input with no colon', () => {
    expect(parseSpecFilter('material')).toBeUndefined();
  });

  it('ignores input with an empty key or value', () => {
    expect(parseSpecFilter(':Силікон')).toBeUndefined();
    expect(parseSpecFilter('material:')).toBeUndefined();
  });

  it('is undefined when omitted', () => {
    expect(parseSpecFilter(undefined)).toBeUndefined();
  });
});

/**
 * Reproduces the global ValidationPipe behaviour (`transform` +
 * `enableImplicitConversion: true`): the raw query string is Boolean-coerced
 * BEFORE any `@Transform` runs, and `Boolean('false')` is `true`. The DTO must
 * therefore derive `onSale` from the ORIGINAL string via `obj[key]`, otherwise
 * `?onSale=false` would wrongly filter to on-sale products (TASK-179).
 */
describe('ProductListQueryDto — onSale transform (TASK-179)', () => {
  const toDto = (query: Record<string, unknown>): ProductListQueryDto =>
    plainToInstance(ProductListQueryDto, query, { enableImplicitConversion: true });

  it('coerces "true" to boolean true', () => {
    expect(toDto({ onSale: 'true' }).onSale).toBe(true);
  });

  it('coerces "false" to boolean false (not the truthy-string trap)', () => {
    expect(toDto({ onSale: 'false' }).onSale).toBe(false);
  });

  it('leaves onSale undefined when the param is absent', () => {
    expect(toDto({}).onSale).toBeUndefined();
  });

  it('treats an unrecognised value as no filter (undefined)', () => {
    expect(toDto({ onSale: 'banana' }).onSale).toBeUndefined();
  });

  it('passes class-validator for each of true / false / absent', async () => {
    for (const query of [{ onSale: 'true' }, { onSale: 'false' }, {}]) {
      const errors = await validate(toDto(query));
      expect(errors.filter((e) => e.property === 'onSale')).toHaveLength(0);
    }
  });
});
