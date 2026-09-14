// Deep import, like `newsletter.controller.spec.ts`: the package barrel does not
// re-export the metadata-key constants.
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { UploadsController } from './uploads.controller';
import { MediaController } from '../media/media.controller';
import { ProductImageController } from '../product/product-image.controller';

/**
 * Every route that accepts a file is rate-limited beyond the global default
 * (TASK-586).
 *
 * WHY ONE SPEC FOR THREE CONTROLLERS. This is a single rule with three call
 * sites, and the failure it guards against is a new upload route being added
 * without the decorator — which no test living inside one controller's own spec
 * would notice. The list below is the rule; adding a fourth upload route means
 * adding a line here, and that is the intended friction.
 *
 * The limits are read as metadata rather than exercised through a request
 * because what can regress is the decorator being dropped or moved, not
 * `@nestjs/throttler` failing to count — which is tested upstream and, on a real
 * request, needs the Redis-backed storage this suite does not stand up.
 */
const UPLOAD_ROUTES: Array<{ name: string; target: object }> = [
  // Class-level: every route on this controller is an upload.
  { name: 'UploadsController (category/brand/banner/blog covers)', target: UploadsController },
  { name: 'MediaController.upload', target: MediaController.prototype.upload },
  { name: 'ProductImageController.upload', target: ProductImageController.prototype.upload },
];

describe('upload routes are rate-limited (TASK-586)', () => {
  it.each(UPLOAD_ROUTES)('$name carries an explicit @Throttle', ({ target }) => {
    // @Throttle stores the limit under `<THROTTLER_LIMIT><name>` — `default`
    // being the name of the single throttler configured in `buildThrottlerOptions`.
    const limit = Reflect.getMetadata(`${THROTTLER_LIMIT}default`, target);

    expect(limit).toBeDefined();
    // Below the global 100/min, or the decorator would be decoration only.
    expect(limit).toBeLessThan(100);
  });

  it('uses the same limit everywhere, so no route is quietly the loose one', () => {
    const limits = UPLOAD_ROUTES.map(({ target }) =>
      Reflect.getMetadata(`${THROTTLER_LIMIT}default`, target),
    );

    expect(new Set(limits).size).toBe(1);
    expect(limits[0]).toBe(20);
  });
});
