import { PageKind } from '@prisma/client';
import {
  HUB_ROUTES,
  HUB_SLUGS,
  PAGE_ROOT_PATHS,
  hubRouteForSlug,
  revalidatePathsForPage,
} from './hub-routes';

describe('hub routes (TASK-435)', () => {
  it('pins the six hub slugs and their storefront routes', () => {
    // This list is mirrored in the storefront (shared/config/hub-pages.ts) and in
    // the panel; all three move together. A sixth-hub rename that only lands here
    // should fail loudly rather than silently orphan a HUB row.
    expect(HUB_ROUTES).toEqual({
      categories: '/categories',
      blog: '/blog',
      legal: '/legal',
      contact: '/contact',
      info: '/info',
      promo: '/promo',
    });
    expect(HUB_SLUGS).toHaveLength(6);
  });

  it('resolves a hub slug to its route and anything else to null', () => {
    expect(hubRouteForSlug('promo')).toBe('/promo');
    expect(hubRouteForSlug('privacy-policy')).toBeNull();
  });

  describe('revalidatePathsForPage', () => {
    it('purges the legal hub and the document for a LEGAL page', () => {
      expect(revalidatePathsForPage(PageKind.LEGAL, 'privacy-policy')).toEqual([
        '/legal',
        '/legal/privacy-policy',
      ]);
    });

    it('purges the info hub and the document for an INFO page', () => {
      // `/info` matters even for a page nobody links from it: the hub's "Про нас"
      // block renders the `about` page's body inline.
      expect(revalidatePathsForPage(PageKind.INFO, 'about')).toEqual(['/info', '/info/about']);
    });

    it('purges only the described route for a HUB row — it has no page of its own', () => {
      expect(revalidatePathsForPage(PageKind.HUB, 'blog')).toEqual(['/blog']);
    });

    it('purges nothing for a HUB row with an unknown slug (no dead path invented)', () => {
      // create/update reject such a row, so this is the belt to that braces.
      expect(revalidatePathsForPage(PageKind.HUB, 'not-a-hub')).toEqual([]);
    });
  });

  it('lists every root path a page can surface on for the scheduler', () => {
    // Deduplicated: `/legal` and `/info` are both page hubs AND hub routes.
    expect(PAGE_ROOT_PATHS).toEqual([
      '/legal',
      '/info',
      '/categories',
      '/blog',
      '/contact',
      '/promo',
    ]);
  });
});
