import { parseSpecFilter } from './product-list-query.dto';

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
