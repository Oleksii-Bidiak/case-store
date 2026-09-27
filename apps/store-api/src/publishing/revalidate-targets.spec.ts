import { CATALOGUE_REVALIDATE_TARGET } from './revalidate-targets';

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
    expect(CATALOGUE_REVALIDATE_TARGET.tags).toEqual(['carousels']);
  });

  it('names no dynamic catalogue route — those render per request', () => {
    expect(CATALOGUE_REVALIDATE_TARGET.paths).not.toContain('/products');
  });
});
