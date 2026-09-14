import sharp from 'sharp';
import { ImageProcessor } from './image-processor.service';

/**
 * Build a real, tiny raster image buffer to feed the processor. Using `sharp`
 * to synthesise a solid-colour PNG keeps the fixture self-contained and avoids
 * committing a binary blob, while still exercising the real encode path.
 */
async function makeFixture(
  format: 'png' | 'jpeg' = 'png',
  width = 64,
  height = 48,
): Promise<Buffer> {
  const img = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 30, g: 120, b: 210 },
    },
  });
  return format === 'png' ? img.png().toBuffer() : img.jpeg().toBuffer();
}

/**
 * A 12 MP JPEG that does NOT compress away to nothing.
 *
 * The solid-colour fixture above is useless for size assertions: a 4000×3000
 * flat blue encodes to a couple of kilobytes whether it was downscaled or not,
 * so a byte budget over it would pass even if the resize stopped happening. The
 * gaussian noise gives the encoder real work — this fixture lands at ~88 KB
 * once shrunk to 2000px and at ~1.5 MB if it is served at full resolution, so
 * the budget below actually fails when the resize regresses.
 */
async function makePhotoFixture(width = 4000, height = 3000): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 30, g: 120, b: 210 },
      noise: { type: 'gaussian', mean: 128, sigma: 10 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

describe('ImageProcessor', () => {
  let processor: ImageProcessor;

  beforeEach(() => {
    processor = new ImageProcessor();
  });

  it('re-encodes the input to a valid WebP buffer', async () => {
    const input = await makeFixture('png');

    const { webp } = await processor.process(input);

    expect(Buffer.isBuffer(webp)).toBe(true);
    const meta = await sharp(webp).metadata();
    expect(meta.format).toBe('webp');
  });

  it('returns a base64 WebP data URI for the blur placeholder', async () => {
    const input = await makeFixture('jpeg');

    const { blurDataUrl } = await processor.process(input);

    expect(blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    const base64 = blurDataUrl.replace(/^data:image\/webp;base64,/, '');
    expect(base64.length).toBeGreaterThan(0);
    // Decodes back to a real WebP that is much smaller than the source width.
    const lqip = Buffer.from(base64, 'base64');
    const meta = await sharp(lqip).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBeLessThanOrEqual(20);
  });

  it('produces a compact LQIP relative to the full-size WebP', async () => {
    const input = await makeFixture('png', 400, 400);

    const { webp, blurDataUrl } = await processor.process(input);
    const lqip = Buffer.from(blurDataUrl.replace(/^data:image\/webp;base64,/, ''), 'base64');

    expect(lqip.byteLength).toBeLessThan(webp.byteLength);
  });

  // ─── Downscaling (TASK-439) ───────────────────────────────────────────────
  // The reason the upload cap could go from 5 MB to 20 MB: what arrives is no
  // longer what gets stored.

  describe('downscaling', () => {
    it('shrinks a 12 MP photo to the 2000px cap and a sane payload', async () => {
      const input = await makePhotoFixture(4000, 3000);

      const { webp } = await processor.process(input);

      const meta = await sharp(webp).metadata();
      expect(meta.format).toBe('webp');
      // `fit: 'inside'` on a square box → the LONGEST edge lands on the cap and
      // the aspect ratio is kept, so 4:3 becomes 2000×1500, never 2000×2000.
      expect(meta.width).toBe(2000);
      expect(meta.height).toBe(1500);
      expect(webp.byteLength).toBeLessThanOrEqual(400 * 1024);
    });

    it('leaves an image already under the cap at its original size', async () => {
      // `withoutEnlargement` — a small logo must not be upscaled to 2000px, which
      // would cost bytes to add blur that was never in the source.
      const input = await makeFixture('png', 64, 48);

      const { webp } = await processor.process(input);

      const meta = await sharp(webp).metadata();
      expect(meta.width).toBe(64);
      expect(meta.height).toBe(48);
    });
  });

  // ─── EXIF (TASK-439) ──────────────────────────────────────────────────────

  describe('EXIF handling', () => {
    it('applies the EXIF orientation tag instead of storing the photo on its side', async () => {
      // Orientation 6 = "rotate 90° clockwise when displaying". A phone shooting
      // in portrait writes LANDSCAPE pixels plus this tag; strip the tag without
      // acting on it and the photo is stored sideways forever.
      const input = await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 30, g: 120, b: 210 } },
      })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();

      // Guard the fixture itself: without a real orientation tag this test would
      // pass vacuously and prove nothing about `.rotate()`.
      const fixtureMeta = await sharp(input).metadata();
      expect(fixtureMeta.orientation).toBe(6);
      expect(fixtureMeta.width).toBe(400);
      expect(fixtureMeta.height).toBe(300);

      const { webp } = await processor.process(input);

      // Landscape pixels in, PORTRAIT pixels out: the tag was acted on, not
      // merely discarded. Fail this and every phone photo is stored sideways.
      const meta = await sharp(webp).metadata();
      expect(meta.width).toBe(300);
      expect(meta.height).toBe(400);
    });

    it('strips EXIF from what it hands back to be stored', async () => {
      // `withMetadata()` is deliberately never called in the processor. Camera
      // EXIF carries GPS coordinates, so anything we serve from our own origin
      // must not have it — and once `.rotate()` has consumed the orientation the
      // metadata has no remaining purpose.
      const input = await sharp({
        create: { width: 120, height: 90, channels: 3, background: { r: 9, g: 9, b: 9 } },
      })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();
      expect((await sharp(input).metadata()).exif).toBeDefined();

      const { webp, blurDataUrl } = await processor.process(input);

      expect((await sharp(webp).metadata()).exif).toBeUndefined();
      const lqip = Buffer.from(blurDataUrl.replace(/^data:image\/webp;base64,/, ''), 'base64');
      expect((await sharp(lqip).metadata()).exif).toBeUndefined();
    });
  });

  // ─── Reported dimensions (TASK-441) ───────────────────────────────────────

  describe('reported dimensions', () => {
    it('reports the dimensions and size OF THE STORED RENDER, not of the input', async () => {
      // The media library records these on the asset row, so "what it says" and
      // "what it stored" have to be the same picture. A 4000×3000 input that is
      // reported as 4000×3000 would put the pre-resize numbers on a post-resize
      // file, and nothing downstream could tell.
      const input = await makePhotoFixture(4000, 3000);

      const { webp, width, height, bytes } = await processor.process(input);

      expect({ width, height }).toEqual({ width: 2000, height: 1500 });
      expect(bytes).toBe(webp.byteLength);
      expect(bytes).toBeLessThan(input.byteLength);
    });

    it('reports the ROTATED dimensions for an EXIF-rotated photo', async () => {
      // Orientation 6 swaps the axes. Reporting the pre-rotation 400×300 here
      // would describe a file that is actually 300×400 — the one case where the
      // numbers and the bytes can silently disagree.
      const input = await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 30, g: 120, b: 210 } },
      })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();

      const { width, height } = await processor.process(input);

      expect({ width, height }).toEqual({ width: 300, height: 400 });
    });
  });

  describe('probe', () => {
    it('reports format AND dimensions from the bytes in one read', async () => {
      await expect(processor.probe(await makeFixture('png', 64, 48))).resolves.toEqual({
        format: 'png',
        width: 64,
        height: 48,
      });
    });

    it('returns null for a buffer that is not a decodable image', async () => {
      // The animated-GIF passthrough gates on this, and it is the only path that
      // writes client bytes verbatim.
      await expect(processor.probe(Buffer.from('<script>alert(1)</script>'))).resolves.toBeNull();
      await expect(processor.probe(Buffer.alloc(0))).resolves.toBeNull();
    });
  });

  describe('detectFormat', () => {
    it('reports the real format sniffed from the bytes', async () => {
      await expect(processor.detectFormat(await makeFixture('png'))).resolves.toBe('png');
      await expect(processor.detectFormat(await makeFixture('jpeg'))).resolves.toBe('jpeg');
    });

    it('returns null for a buffer that is not a decodable image', async () => {
      // What a client would send while claiming `Content-Type: image/gif`.
      await expect(processor.detectFormat(Buffer.from('<script>alert(1)</script>'))).resolves.toBe(
        null,
      );
    });

    it('returns null rather than throwing on an empty buffer', async () => {
      await expect(processor.detectFormat(Buffer.alloc(0))).resolves.toBeNull();
    });
  });
});
