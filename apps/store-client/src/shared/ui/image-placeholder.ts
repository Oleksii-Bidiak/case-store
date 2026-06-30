/**
 * BLUR_PLACEHOLDER — a tiny inline base64 image used as the `blurDataURL` for
 * remote `next/image` instances in the storefront (`placeholder="blur"`).
 *
 * Why a single shared constant instead of per-image LQIP hashes?
 * `next/image` can auto-generate a blur hash only for *statically imported*
 * images. Our product images are runtime URLs from the API, so a `blurDataURL`
 * must be supplied explicitly. Generating a real per-image low-quality preview
 * requires the API to compute a downscaled base64 (`sharp`) at upload time and
 * store it on `ProductImage` — backend work deferred to TASK-091. Until then a
 * single neutral-grey shimmer gives layout-stable, soft fade-in without any
 * per-image work. When the API starts returning per-image previews, only this
 * value changes (constant → per-image) — no `<Image>` call-site changes.
 *
 * Encoded here: an 8x8 neutral-grey PNG (~matches the `muted` surface tone),
 * small enough to inline in the RSC/HTML payload (no extra network request).
 */
export const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGNkYGD4z0AEYBxVSF+FAP5FBAUlnYSfAAAAAElFTkSuQmCC";
