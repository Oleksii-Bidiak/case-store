import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Result of pre-processing one uploaded raster image.
 *
 * - `webp` — the input re-encoded to WebP (quality-capped) to shrink the served
 *   payload. This buffer is what gets written to storage.
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

/** Target width (px) of the LQIP — small enough to inline, large enough to hint. */
const LQIP_WIDTH = 16;

/** WebP quality for the LQIP — low, since it is only ever shown blurred. */
const LQIP_QUALITY = 40;

/**
 * Wraps the `sharp` image library behind an injectable so callers
 * ({@link ProductImageService}) stay free of the image toolkit and can mock this
 * in unit tests. Lives in the storage module alongside {@link LocalDiskStorageService}.
 */
@Injectable()
export class ImageProcessor {
  /**
   * Re-encode an uploaded image to WebP and derive a base64 LQIP from it.
   * The two encodes run concurrently. Callers must guard animated formats
   * (e.g. GIF) upstream — animation is lost when flattened to a single WebP.
   */
  async process(buffer: Buffer): Promise<ProcessedImage> {
    const [webp, lqip] = await Promise.all([
      sharp(buffer).webp({ quality: WEBP_QUALITY }).toBuffer(),
      sharp(buffer).resize({ width: LQIP_WIDTH }).webp({ quality: LQIP_QUALITY }).toBuffer(),
    ]);

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
