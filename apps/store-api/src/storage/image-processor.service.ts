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
  /**
   * Pixel dimensions and byte size OF THE RETURNED BUFFER — the ≤2000px WebP we
   * actually store, never the file the operator picked (TASK-441).
   *
   * They come free: `sharp` already reports them from the encode that produced
   * the buffer, so `resolveWithObject` costs nothing over `toBuffer()`. Carrying
   * them here is what lets the media library record real numbers instead of the
   * zeros its backfill had to write for pre-existing rows, and it is the reason
   * the library does not need a second decode pass of its own.
   */
  width: number;
  height: number;
  bytes: number;
}

/** What {@link ImageProcessor.probe} reports about an undecoded buffer. */
export interface ImageProbe {
  /** `'gif'`, `'png'`, `'jpeg'`, `'webp'`, … — sniffed from the bytes. */
  format: string;
  width: number;
  height: number;
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
 * decoded frame. A 10000×10000 PNG of one flat colour is ~100 KB on the wire and
 * 400 MB once decoded, and it passes every byte gate we have.
 *
 * WHY 60 AND NOT 100 Mpx (TASK-586). At 4 B/px this is ~240 MB of decoded frame
 * against the 640 MB `mem_limit` the API container runs under
 * (`docker-compose.prod.yml`), which leaves room for the process itself and for
 * {@link IMAGE_DECODE_CONCURRENCY} to be raised later. The earlier 100 Mpx put a
 * single decode at ~400 MB, and that number was reasoned about in isolation — one
 * decode, no baseline RSS, no second request.
 *
 * It does not cut into real photographs. The ceiling only ever applies to a file
 * that already fits the 20 MB byte cap, and 60 Mpx clears every 48/50 Mpx phone
 * and camera sensor that produces one. JPEG barely touches the figure anyway —
 * libvips shrinks it on load, decoding straight to a fraction of the frame. The
 * formats that really do allocate the whole thing are PNG and WebP, which is to
 * say: bombs, not cameras.
 */
export const MAX_INPUT_PIXELS = 60_000_000;

/**
 * How many uploads may be decoded at the same time in one process (TASK-586).
 *
 * WHY A SEMAPHORE AND NOT `sharp.concurrency()`. They solve different problems
 * and only one of them is ours: `sharp.concurrency(n)` caps the libvips threads
 * used INSIDE one operation, while the memory that matters is one decoded frame
 * PER operation. Node runs `toBuffer` on the libuv threadpool, four wide by
 * default, so four concurrent uploads mean four frames resident at once —
 * ~960 MB at this ceiling, inside a 640 MB container, which is an OOM kill of
 * the whole process rather than a failed request.
 *
 * One at a time makes the worst case arithmetic instead of luck:
 * {@link MAX_INPUT_PIXELS} × 4 B/px, once. Uploads are an operator action a
 * handful at a time, and the admin panel already sends one file per request
 * (see the queue in `use-image-upload-queue.ts`), so serialising costs nothing
 * anybody will notice — the second upload waits out the first decode, which is
 * under a second for a real photo.
 */
export const IMAGE_DECODE_CONCURRENCY = 1;

/**
 * Wraps the `sharp` image library behind an injectable so callers
 * ({@link ProductImageService}) stay free of the image toolkit and can mock this
 * in unit tests. Lives in the storage module alongside {@link LocalDiskStorageService}.
 */
@Injectable()
export class ImageProcessor {
  /** Decode slots in use, bounded by {@link IMAGE_DECODE_CONCURRENCY}. */
  private inFlight = 0;

  /** Callers parked until a slot frees up, served first-come-first-served. */
  private readonly waiting: Array<() => void> = [];

  /**
   * Re-encode an uploaded image to WebP and derive a base64 LQIP from it.
   *
   * Serialised through {@link IMAGE_DECODE_CONCURRENCY} — see the constant for
   * why the bound belongs here and not in `sharp.concurrency()`. A caller that
   * arrives while a decode is running waits for it rather than allocating a
   * second frame beside it.
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
    await this.acquireDecodeSlot();
    try {
      return await this.encode(buffer);
    } finally {
      this.releaseDecodeSlot();
    }
  }

  /**
   * Take a decode slot, waiting for one if they are all busy.
   *
   * A slot is HANDED OVER on release rather than freed and re-taken: if
   * {@link releaseDecodeSlot} decremented the counter and the woken caller
   * incremented it again, a third caller arriving in between would see a free
   * slot that is already spoken for and the bound would quietly exceed itself.
   */
  private async acquireDecodeSlot(): Promise<void> {
    if (this.inFlight < IMAGE_DECODE_CONCURRENCY) {
      this.inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private releaseDecodeSlot(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.inFlight -= 1;
    }
  }

  private async encode(buffer: Buffer): Promise<ProcessedImage> {
    // `resolveWithObject` rather than a bare `toBuffer()`: sharp hands back the
    // encoded frame's width/height/size from the encode it just did, so the
    // dimensions cost nothing and cannot disagree with the bytes we store.
    // Measuring them afterwards with a second `sharp(webp).metadata()` would be
    // a second decode AND a second source of truth.
    const { data: webp, info } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    const lqip = await sharp(webp)
      .resize({ width: LQIP_WIDTH })
      .webp({ quality: LQIP_QUALITY })
      .toBuffer();

    return {
      webp,
      blurDataUrl: `data:image/webp;base64,${lqip.toString('base64')}`,
      width: info.width,
      height: info.height,
      bytes: info.size,
    };
  }

  /**
   * Sniff format AND dimensions from a buffer's own bytes in one metadata read,
   * or null when it is not a decodable image (TASK-441).
   *
   * Exists for the animated-GIF passthrough, the one path that stores client
   * bytes verbatim: it needs the format gate {@link detectFormat} provides AND
   * the dimensions the media library records, and reading the header twice to
   * get them would be two chances to disagree.
   */
  async probe(buffer: Buffer): Promise<ImageProbe | null> {
    try {
      const { format, width, height } = await sharp(buffer).metadata();
      if (!format) {
        return null;
      }
      return { format, width: width ?? 0, height: height ?? 0 };
    } catch {
      return null;
    }
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
