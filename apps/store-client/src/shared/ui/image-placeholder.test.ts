import { inflateSync } from "node:zlib";
import { BLUR_PLACEHOLDER } from "./image-placeholder";

/**
 * TASK-415 regression guard.
 *
 * The previous constant was a CORRUPT PNG (78 bytes where the file needs 79 —
 * the IDAT CRC was one byte short), and nothing in the codebase noticed, because
 * a broken `blurDataURL` does not fail loudly: `next/image` inlines it into an
 * SVG filter chain whose opaque-black `feFlood` is composited OUT of the blurred
 * image. With a decodable image the flood is masked away; with an undecodable
 * one there is nothing to mask, so every card painted a solid BLACK rectangle
 * over its photo until the real image swapped in — and again on any repaint of
 * the placeholder (returning to the tab, alt+tab).
 *
 * So this suite does not check "is it a string that starts with data:image" —
 * it decodes the PNG the way a browser would: walk the chunks, verify every
 * CRC32, and inflate the pixel data.
 */

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function decodeDataUri(uri: string): Buffer {
  const [header, payload] = uri.split(",");
  expect(header).toBe("data:image/png;base64");
  return Buffer.from(payload, "base64");
}

describe("BLUR_PLACEHOLDER", () => {
  const png = decodeDataUri(BLUR_PLACEHOLDER);

  it("is a complete PNG — signature, chunks and a trailing IEND", () => {
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);

    const types: string[] = [];
    let offset = 8;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.toString("ascii", offset + 4, offset + 8);
      // A truncated file shows up here: the declared chunk would run past the
      // end of the buffer, or its 4-byte CRC would not fit.
      expect(offset + 12 + length).toBeLessThanOrEqual(png.length);
      types.push(type);
      offset += 12 + length;
    }

    expect(offset).toBe(png.length);
    expect(types[0]).toBe("IHDR");
    expect(types).toContain("IDAT");
    expect(types[types.length - 1]).toBe("IEND");
  });

  it("passes every chunk CRC, and its pixel data inflates", () => {
    let offset = 8;
    let inflatedBytes = 0;

    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.toString("ascii", offset + 4, offset + 8);
      const body = png.subarray(offset + 4, offset + 8 + length);
      const declaredCrc = png.readUInt32BE(offset + 8 + length);

      expect(`${type}:${crc32(body)}`).toBe(`${type}:${declaredCrc}`);
      if (type === "IDAT") {
        inflatedBytes += inflateSync(
          png.subarray(offset + 8, offset + 8 + length),
        ).length;
      }
      offset += 12 + length;
    }

    // 8x8 truecolour: 8 rows of (1 filter byte + 8 px * 3 bytes).
    expect(inflatedBytes).toBe(8 * (1 + 8 * 3));
  });

  it("stays small enough to inline in every card of a grid", () => {
    expect(BLUR_PLACEHOLDER.length).toBeLessThan(256);
  });
});
