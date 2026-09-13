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
 * Encoded here: an 8x8 neutral-grey PNG (`#f1f5f9`, the `muted` surface tone),
 * small enough to inline in the RSC/HTML payload (no extra network request).
 *
 * TASK-415 — the previous value was a CORRUPT PNG and that is what produced the
 * "black overlay" on cards: the base64 decoded to 78 bytes where the file needs
 * 79 (the IDAT CRC was one byte short, and its zlib stream failed its own adler
 * check), so no decoder could read it. `next/image` does not draw `blurDataURL`
 * directly — it inlines it into an SVG filter chain whose `feFlood` is opaque
 * black and is composited OUT of the blurred image. With a decodable image that
 * flood is masked away; with an undecodable one there is nothing to mask, so the
 * placeholder paints a solid black rectangle over the whole image box until the
 * real image swaps in (and again on any repaint of it — e.g. returning to the
 * tab via alt+tab). Consequence: if this constant is ever regenerated, VERIFY IT
 * DECODES (chunk CRCs + `zlib.inflateSync` of IDAT) — an invalid data URI fails
 * loudly on screen, not silently.
 */
export const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP4+PUnVsQwtCQAyfG3wc1ajbAAAAAASUVORK5CYII=";
