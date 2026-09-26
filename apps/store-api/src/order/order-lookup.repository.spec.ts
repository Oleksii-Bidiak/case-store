import { OrderLookupRepository, orderNumberIdRange } from './order-lookup.repository';

/**
 * TASK-625: the public lookup must be able to walk the primary-key index.
 * `id: { startsWith }` compiles to `id LIKE 'prefix%'`, which a btree under the
 * database's default (non-C) collation cannot use — a seq scan of `orders` on
 * every public request. A `[prefix, successor)` range can.
 */
describe('orderNumberIdRange', () => {
  it('bounds an 8-hex prefix by its successor', () => {
    expect(orderNumberIdRange('abcdef01')).toEqual({ gte: 'abcdef01', lt: 'abcdef02' });
  });

  it('steps 9 → a inside the hex alphabet (":" would sort as punctuation)', () => {
    expect(orderNumberIdRange('abcdef09')).toEqual({ gte: 'abcdef09', lt: 'abcdef0a' });
  });

  it('carries past f', () => {
    expect(orderNumberIdRange('abcdef0f')).toEqual({ gte: 'abcdef0f', lt: 'abcdef10' });
    expect(orderNumberIdRange('0fffffff')).toEqual({ gte: '0fffffff', lt: '10000000' });
  });

  it('leaves the top prefix open-ended (no successor exists)', () => {
    expect(orderNumberIdRange('ffffffff')).toEqual({ gte: 'ffffffff' });
  });
});

describe('OrderLookupRepository.findByNumberAndPhone', () => {
  it('queries the id as a range, not a LIKE', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new OrderLookupRepository({ order: { findMany } } as never);

    await repository.findByNumberAndPhone('abcdef01', '380501234567');

    const { where } = findMany.mock.calls[0][0];
    expect(where.id).toEqual({ gte: 'abcdef01', lt: 'abcdef02' });
    expect(where.OR).toEqual([{ guestPhone: '380501234567' }, { user: { phone: '380501234567' } }]);
    expect(where.deletedAt).toBeNull();
  });
});
