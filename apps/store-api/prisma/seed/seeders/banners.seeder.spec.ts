import { MAX_ACTIVE_PROMO_TILES } from '../../../src/banners/banners.errors';
import { banners } from '../data/content/banners.data';
import { promoTilesToDemote } from './banners.seeder';

/**
 * A re-seed on a stand where an admin already published promo tiles must not
 * throw halfway through the run (the seed is not one transaction) and must not
 * leave the storefront over the API's promo-tile limit either: the seed's own
 * tiles give way, the admin's are never touched.
 */
describe('promoTilesToDemote', () => {
  const seededActive = banners.filter((b) => b.placement === 'PROMO_TILE' && b.state !== 'DRAFT');

  it('keeps every seeded tile when nothing else is active', () => {
    expect(promoTilesToDemote(banners, 0)).toEqual(new Set());
  });

  it('demotes the scheduled tile first, then published ones from the highest sortOrder', () => {
    const others = MAX_ACTIVE_PROMO_TILES - seededActive.length + 2;
    expect(promoTilesToDemote(banners, others)).toEqual(new Set(['promo-tile-3', 'promo-tile-2']));
  });

  it('demotes every seeded tile when the admin already fills the limit', () => {
    const demoted = promoTilesToDemote(banners, MAX_ACTIVE_PROMO_TILES);
    expect(demoted).toEqual(new Set(seededActive.map((b) => b.slot)));
  });

  it('never leaves more active tiles than the limit', () => {
    for (let others = 0; others <= MAX_ACTIVE_PROMO_TILES; others++) {
      const kept = seededActive.length - promoTilesToDemote(banners, others).size;
      expect(kept + others).toBeLessThanOrEqual(Math.max(MAX_ACTIVE_PROMO_TILES, others));
    }
  });
});
