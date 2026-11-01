import {
  CATALOGUE_REVALIDATE_TARGET,
  DEVICE_HUBS_REVALIDATE_TARGET,
  DEVICE_HUBS_TAG,
} from './revalidate-targets';

/**
 * The catalogue purge must name every PRERENDERED storefront page that bakes
 * catalogue data into its HTML. Those reads are axios (no Data Cache tag can
 * reach them), so a page missing from `paths` keeps serving the old products
 * until its time floor expires. TASK-563 added `/categories` and `/promo` to
 * the list when they started prefetching on the server.
 */
describe('CATALOGUE_REVALIDATE_TARGET', () => {
  it('purges every prerendered page that renders catalogue data', () => {
    expect(CATALOGUE_REVALIDATE_TARGET.paths).toEqual(
      expect.arrayContaining(['/', '/categories', '/promo']),
    );
  });

  it('keeps the carousels tag the homepage rails are fetched under', () => {
    expect(CATALOGUE_REVALIDATE_TARGET.tags).toContain('carousels');
  });

  it('purges the model hubs too — their product groups come from the catalogue (TASK-1954)', () => {
    expect(CATALOGUE_REVALIDATE_TARGET.tags).toEqual(['carousels', DEVICE_HUBS_TAG]);
  });

  it('names no dynamic catalogue route — those render per request', () => {
    expect(CATALOGUE_REVALIDATE_TARGET.paths).not.toContain('/products');
  });
});

describe('DEVICE_HUBS_REVALIDATE_TARGET', () => {
  it('purges only the model-hub tag', () => {
    expect(DEVICE_HUBS_TAG).toBe('device-hubs');
    expect(DEVICE_HUBS_REVALIDATE_TARGET).toEqual({ tags: ['device-hubs'] });
  });
});
