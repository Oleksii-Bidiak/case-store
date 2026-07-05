import { plainToInstance } from 'class-transformer';
import { ProductListQueryDto } from './product-list-query.dto';

/**
 * Unit tests for the `specs` facet param transform (TASK-191-D). Mirrors the
 * documented Boolean-DTO gotcha: the transform reads the ORIGINAL query string
 * and parses a single `key:value` pair, ignoring malformed input.
 */
describe('ProductListQueryDto — specs facet transform', () => {
  const parse = (specs: unknown) =>
    plainToInstance(ProductListQueryDto, { specs }, { enableImplicitConversion: true }).specs;

  it('parses a well-formed key:value pair', () => {
    expect(parse('material:Силікон')).toEqual({ key: 'material', value: 'Силікон' });
  });

  it('splits on the first colon only (value may contain colons)', () => {
    expect(parse('ratio:16:9')).toEqual({ key: 'ratio', value: '16:9' });
  });

  it('ignores input with no colon', () => {
    expect(parse('material')).toBeUndefined();
  });

  it('ignores input with an empty key or value', () => {
    expect(parse(':Силікон')).toBeUndefined();
    expect(parse('material:')).toBeUndefined();
  });

  it('is undefined when omitted', () => {
    expect(parse(undefined)).toBeUndefined();
  });
});
