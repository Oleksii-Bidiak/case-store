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
    // Dimensions are preserved for the full-size render (only the LQIP shrinks).
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(48);
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
});
