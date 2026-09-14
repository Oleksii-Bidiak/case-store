import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Result of pre-processing one uploaded raster image.
 *
 * - `webp` — the input re-encoded to WebP (quality-capped) and shrunk to fit
 *   {@link MAX_DIMENSION} on its longest edge. This buffer is what gets written
 *   to storage; it is NOT the original resolution (TASK-439). Owners send photos
 *   straight off a phone — 3-20 MB, 12-50 Mpx — and storing those untouched is
 *   what made a 5 MB upload cap look necessary in the first place.
 * - `blurDataUrl` — a tiny blurred low-quality image placeholder (LQIP) as a
 *   `data:image/webp;base64,…` URI, persisted on the image row so the storefront
 *   can render `next/image` with `placeholder="blur"`.
 */
export interface ProcessedImage {
  webp: Buffer;
  blurDataUrl: string;
}

/** WebP quality for the served full-size render (higher = sharper, larger). */
const WEBP_QUALITY = 80;

/**
 * Longest edge (px) of the stored render. A product photo is never displayed
 * larger than this on either app, so pixels beyond it cost storage, bandwidth
 * and Next.js optimizer CPU without ever reaching a screen.
 */
const MAX_DIMENSION = 2000;

/** Target width (px) of the LQIP — small enough to inline, large enough to hint. */
const LQIP_WIDTH = 16;

/** WebP quality for the LQIP — low, since it is only ever shown blurred. */
const LQIP_QUALITY = 40;

/**
 * Hard ceiling on how many pixels `sharp` will decode out of an upload.
 *
 * WHY THIS IS SPELLED OUT RATHER THAN LEFT TO SHARP'S DEFAULT (TASK-583): sharp
 * ships a default of 0x3FFF² ≈ 268 Mpx, but a default is not a decision. A
 * global `sharp` config call anywhere in the process, or a version bump that
 * changes or drops that default, would silently remove our only guard against a
 * decompression bomb — and nothing about that would appear in a diff. Written
 * here, the ceiling is reviewable and moving it has to be done on purpose.
 *
 * {@link MAX_IMAGE_BYTES} does NOT make this redundant: a compression bomb is
 * precisely a small file that decodes huge, so a byte cap cannot bound the
 * decoded frame. 100 Mpx is ~400 MB decoded at 4 B/px, which still fits the
 * 640 MB `mem_limit` the API container runs under (`docker-compose.prod.yml`),
 * and sits far above any real camera image that can fit inside the 20 MB byte
 * cap — so it rejects bombs without ever rejecting a photo.
 */
export const MAX_INPUT_PIXELS = 100_000_000;

/**
 * Wraps the `sharp` image library behind an injectable so callers
 * ({@link ProductImageService}) stay free of the image toolkit and can mock this
 * in unit tests. Lives in the storage module alongside {@link LocalDiskStorageService}.
 */
@Injectable()
export class ImageProcessor {
  /**
   * Re-encode an uploaded image to WebP and derive a base64 LQIP from it.
   *
   * Order matters. `.rotate()` with no argument applies the EXIF orientation
   * tag, and it has to run BEFORE the metadata is dropped: `withMetadata()` is
   * deliberately never called anywhere here, so EXIF (including GPS coordinates
   * from a phone) does not survive into anything we serve. A photo shot in
   * portrait carries its rotation only in that tag — without this call it would
   * be stored, and displayed, on its side.
   *
   * The LQIP is derived from the finished WebP rather than from a second pass
   * over the original. The obvious alternative — one base pipeline, two
   * `clone()`s, `Promise.all` — does NOT do what it reads like: `clone()` copies
   * the queued options, and a second `resize()` on the clone *replaces* the
   * first instead of composing with it (sharp logs "ignoring previous resize
   * options"), so that branch re-decodes the full-resolution input a second
   * time. Measured on a 48 Mpx JPEG, the clone shape peaks at ~129 MB of
   * working set against ~65 MB for the shape below, which stays flat as the
   * input grows because the second decode only ever sees the ≤2000px render.
   * In a 640 MB container that difference is the whole point of TASK-439.
   *
   * Callers must guard animated formats (e.g. GIF) upstream — animation is lost
   * when flattened to a single WebP.
   */
  async process(buffer: Buffer): Promise<ProcessedImage> {
    const webp = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const lqip = await sharp(webp)
      .resize({ width: LQIP_WIDTH })
      .webp({ quality: LQIP_QUALITY })
      .toBuffer();

    return {
      webp,
      blurDataUrl: `data:image/webp;base64,${lqip.toString('base64')}`,
    };
  }

  /**
   * Sniff the real image format from the file's own bytes (`'gif'`, `'png'`,
   * `'jpeg'`, `'webp'`, …), or null when the buffer is not a decodable image.
   *
   * Callers MUST use this on any path that writes an upload through untouched:
   * the client-supplied Content-Type is a claim, not a fact, and a buffer that is
   * never re-encoded would otherwise land on disk exactly as uploaded.
   */
  async detectFormat(buffer: Buffer): Promise<string | null> {
    try {
      const { format } = await sharp(buffer).metadata();
      return format ?? null;
    } catch {
      return null;
    }
  }
}
