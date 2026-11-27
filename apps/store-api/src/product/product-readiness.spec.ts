import { Prisma } from '@prisma/client';
import { PUBLISH_BLOCKERS, publishBlockers } from './product-readiness';

const ready = {
  name: 'Clear MagSafe case',
  categoryId: 'category-uuid-1',
  price: new Prisma.Decimal('29.99'),
  imageCount: 1,
};

describe('publishBlockers (TASK-2573)', () => {
  it('returns no blockers for a ready product', () => {
    expect(publishBlockers(ready)).toEqual([]);
  });

  it('blocks a name that is empty after trimming', () => {
    expect(publishBlockers({ ...ready, name: '   ' })).toEqual(['name']);
  });

  it('blocks an empty category id', () => {
    expect(publishBlockers({ ...ready, categoryId: '' })).toEqual(['category']);
  });

  it('blocks a zero price, compared as a Decimal', () => {
    expect(publishBlockers({ ...ready, price: new Prisma.Decimal('0.00') })).toEqual(['price']);
  });

  it('accepts the smallest positive price, from a number or a string', () => {
    expect(publishBlockers({ ...ready, price: 0.01 })).toEqual([]);
    expect(publishBlockers({ ...ready, price: '0.01' })).toEqual([]);
  });

  it('blocks a product without photos', () => {
    expect(publishBlockers({ ...ready, imageCount: 0 })).toEqual(['photo']);
  });

  it('lists every blocker in the fixed order name, category, price, photo', () => {
    expect(publishBlockers({ name: '', categoryId: '', price: 0, imageCount: 0 })).toEqual([
      'name',
      'category',
      'price',
      'photo',
    ]);
  });

  it('exports the same order as the enum list', () => {
    expect(PUBLISH_BLOCKERS).toEqual(['name', 'category', 'price', 'photo']);
  });
});
