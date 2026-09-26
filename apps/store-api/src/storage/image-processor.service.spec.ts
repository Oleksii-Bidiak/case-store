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

/**
 * Budget for the tests that touch the 12 MP photo (TASK-611).
 *
 * Measured, not guessed. Idle, one process: building the fixture ≈ 0.3 s and
 * processing it ≈ 0.3 s. Inside a normal full `npm run test -w apps/store-api`
 * (15 jest workers on 16 cores, each libvips pool sized to the core count) one
 * such test took 1.0–1.4 s. With the CPU oversubscribed — three full suites at
 * once, i.e. what a small CI runner or a busy dev box looks like — they took
 * 3.1–9.6 s and one of them died at jest's 5 s default ("Exceeded timeout of
 * 5000 ms for a test"), three runs out of three. The work is legitimately
 * CPU-bound; the default was simply sized for unit tests that do no work.
 *
 * 30 s is ~3× the worst observation. The fixture is also built ONCE for the
 * file (`beforeAll`) instead of per test, which removes about half of the heavy
 * work outright. The 400 KB payload budget and the fixture size are untouched —
 * they are the assertions, the clock is not.
 */
const PHOTO_TIMEOUT_MS = 30_000;

describe('ImageProcessor', () => {
  let processor: ImageProcessor;
  /** The 12 MP JPEG, built once — see PHOTO_TIMEOUT_MS. Never mutated. */
  let photo: Buffer;

  beforeAll(async () => {
    photo = await makePhotoFixture(4000, 3000);
  }, PHOTO_TIMEOUT_MS);

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
    it(
      'shrinks a 12 MP photo to the 2000px cap and a sane payload',
      async () => {
        const { webp } = await processor.process(photo);

        const meta = await sharp(webp).metadata();
        expect(meta.format).toBe('webp');
        // `fit: 'inside'` on a square box → the LONGEST edge lands on the cap and
        // the aspect ratio is kept, so 4:3 becomes 2000×1500, never 2000×2000.
        expect(meta.width).toBe(2000);
        expect(meta.height).toBe(1500);
        expect(webp.byteLength).toBeLessThanOrEqual(400 * 1024);
      },
      PHOTO_TIMEOUT_MS,
    );

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

    // Parametrised over the raster formats an upload can arrive in (TASK-748):
    // libvips reads EXIF out of a PNG `eXIf` chunk and a WebP `EXIF` chunk just
    // as it does out of a JPEG APP1 segment, so a JPEG-only test would stay
    // green while a PNG or WebP upload leaked its camera metadata.
    it.each(['jpeg', 'png', 'webp'] as const)(
      'strips EXIF from what it hands back to be stored (%s input)',
      async (format) => {
        // `withMetadata()` is deliberately never called in the processor. Camera
        // EXIF carries GPS coordinates, so anything we serve from our own origin
        // must not have it — and once `.rotate()` has consumed the orientation
        // the metadata has no remaining purpose.
        const marker = 'exif-strip-fixture';
        const input = await sharp({
          create: { width: 120, height: 90, channels: 3, background: { r: 9, g: 9, b: 9 } },
        })
          .withExif({ IFD0: { Copyright: marker } })
          .withMetadata({ orientation: 6 })
          .toFormat(format)
          .toBuffer();

        // Guard the fixture itself: if this encoder silently dropped the EXIF
        // block, every assertion below would pass vacuously.
        const fixtureMeta = await sharp(input).metadata();
        expect(fixtureMeta.format).toBe(format);
        expect(fixtureMeta.exif?.toString('latin1')).toContain(marker);

        const { webp, blurDataUrl } = await processor.process(input);

        expect((await sharp(webp).metadata()).exif).toBeUndefined();
        expect(webp.includes(marker)).toBe(false);
        const lqip = Buffer.from(blurDataUrl.replace(/^data:image\/webp;base64,/, ''), 'base64');
        expect((await sharp(lqip).metadata()).exif).toBeUndefined();
        expect(lqip.includes(marker)).toBe(false);
      },
    );
  });

  // ─── Reported dimensions (TASK-441) ───────────────────────────────────────

  describe('reported dimensions', () => {
    it(
      'reports the dimensions and size OF THE STORED RENDER, not of the input',
      async () => {
        // The media library records these on the asset row, so "what it says" and
        // "what it stored" have to be the same picture. A 4000×3000 input that is
        // reported as 4000×3000 would put the pre-resize numbers on a post-resize
        // file, and nothing downstream could tell.
        const { webp, width, height, bytes } = await processor.process(photo);

        expect({ width, height }).toEqual({ width: 2000, height: 1500 });
        expect(bytes).toBe(webp.byteLength);
        expect(bytes).toBeLessThan(photo.byteLength);
      },
      PHOTO_TIMEOUT_MS,
    );

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
