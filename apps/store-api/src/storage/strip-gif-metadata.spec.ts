import sharp from 'sharp';
import { GifStructureError, stripGifMetadata } from './strip-gif-metadata';

/**
 * TASK-587. The GIF upload branch cannot re-encode (that would kill the
 * animation), so these tests pin the two halves of the promise separately:
 * the metadata is GONE, and the animation is byte-for-byte UNTOUCHED.
 */

/** The classic 1×1 GIF89a: global colour table, one GCE, one frame, trailer. */
const TINY_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/** Byte length of header + logical screen descriptor + 2-colour GCT in {@link TINY_GIF}. */
const TINY_PREAMBLE = 6 + 7 + 6;

const FRAME_W = 4;
const FRAME_H = 4;
const FRAMES = 3;
const DELAYS = [100, 200, 300];

/** A real three-frame looping GIF, encoded by the same libvips the API ships. */
async function animatedGif(): Promise<Buffer> {
  const raw = Buffer.alloc(FRAME_W * FRAME_H * FRAMES * 3);
  for (let f = 0; f < FRAMES; f++) {
    for (let i = 0; i < FRAME_W * FRAME_H; i++) {
      raw[(f * FRAME_W * FRAME_H + i) * 3 + f] = 255; // red, green, blue frames
    }
  }
  return sharp(raw, {
    raw: { width: FRAME_W, height: FRAME_H * FRAMES, channels: 3, pageHeight: FRAME_H },
  })
    .gif({ loop: 0, delay: DELAYS })
    .toBuffer();
}

/** Split a payload into GIF data sub-blocks (≤255 bytes each) plus the terminator. */
function subBlocks(payload: Buffer): Buffer {
  const parts: Buffer[] = [];
  for (let i = 0; i < payload.length; i += 255) {
    const chunk = payload.subarray(i, i + 255);
    parts.push(Buffer.from([chunk.length]), chunk);
  }
  parts.push(Buffer.from([0x00]));
  return Buffer.concat(parts);
}

function commentExtension(text: string): Buffer {
  return Buffer.concat([Buffer.from([0x21, 0xfe]), subBlocks(Buffer.from(text, 'latin1'))]);
}

function applicationExtension(id: string, payload: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0x21, 0xff, 0x0b]),
    Buffer.from(id, 'latin1'),
    subBlocks(payload),
  ]);
}

/**
 * An XMP packet laid out the way Adobe writes it into a GIF: the packet raw,
 * NOT split into sub-blocks, followed by the 258-byte "magic trailer" that makes
 * a sub-block walker land on the terminator whatever the packet bytes are.
 */
function xmpExtension(packet: string): Buffer {
  const ramp = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) {
    ramp[i] = 0xff - i;
  }
  return Buffer.concat([
    Buffer.from([0x21, 0xff, 0x0b]),
    Buffer.from('XMP DataXMP', 'latin1'),
    Buffer.from(packet, 'latin1'),
    Buffer.from([0x01]),
    ramp,
    Buffer.from([0x00]),
  ]);
}

const XMP_PACKET =
  '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">' +
  '<rdf:RDF><rdf:Description exif:GPSLatitude="50,27.0N" exif:GPSLongitude="30,31.0E" ' +
  'dc:creator="Private Person"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

/** Offset of the first block after header + LSD + GCT of a sharp-encoded GIF. */
function preambleLength(gif: Buffer): number {
  const packed = gif[10];
  return 13 + (packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0);
}

/** Every leaked secret the fixtures plant, checked as raw bytes. */
function expectNoSecrets(out: Buffer): void {
  const text = out.toString('latin1');
  for (const secret of ['GPSLatitude', 'Private Person', 'XMP DataXMP', 'SECRET', 'ICCRGBG1']) {
    expect(text).not.toContain(secret);
  }
}

async function decodeFrames(gif: Buffer): Promise<Buffer> {
  return sharp(gif, { animated: true }).raw().toBuffer();
}

describe('stripGifMetadata', () => {
  describe('an animated GIF carrying metadata', () => {
    let clean: Buffer;
    let dirty: Buffer;

    beforeAll(async () => {
      clean = await animatedGif();
      const pre = preambleLength(clean);
      // Metadata before the first frame, between frames and after the trailer —
      // every place an encoder or a hostile client can put it.
      const firstFrameGce = clean.indexOf(Buffer.from([0x21, 0xf9]), pre);
      const secondFrameGce = clean.indexOf(Buffer.from([0x21, 0xf9]), firstFrameGce + 2);
      dirty = Buffer.concat([
        clean.subarray(0, pre),
        commentExtension('SECRET author notes, shot on a phone at home'),
        xmpExtension(XMP_PACKET),
        applicationExtension('ICCRGBG1012', Buffer.from('SECRET profile description')),
        clean.subarray(pre, secondFrameGce),
        commentExtension('SECRET between frames'),
        clean.subarray(secondFrameGce),
        Buffer.from('SECRET <script>after the trailer</script>'),
      ]);
    });

    it('fixture sanity: the dirty file really carries the secrets and still decodes', async () => {
      expect(dirty.toString('latin1')).toContain('GPSLatitude');
      expect((await sharp(dirty, { animated: true }).metadata()).pages).toBe(FRAMES);
    });

    it('removes comments, XMP, other application extensions and trailing bytes', () => {
      expectNoSecrets(stripGifMetadata(dirty));
    });

    it('restores exactly the bytes the encoder wrote — no frame is re-encoded', () => {
      expect(stripGifMetadata(dirty).equals(clean)).toBe(true);
    });

    it('stays animated: same frame count, loop, delays and pixels', async () => {
      const out = stripGifMetadata(dirty);
      const meta = await sharp(out, { animated: true }).metadata();

      expect(meta.pages).toBe(FRAMES);
      expect(meta.loop).toBe(0);
      expect(meta.delay).toEqual(DELAYS);
      expect((await decodeFrames(out)).equals(await decodeFrames(clean))).toBe(true);
    });

    it('leaves a GIF with no metadata byte-identical', () => {
      expect(stripGifMetadata(clean).equals(clean)).toBe(true);
      expect(stripGifMetadata(TINY_GIF).equals(TINY_GIF)).toBe(true);
    });
  });

  describe('the loop extension', () => {
    const canonicalLoop = applicationExtension(
      'NETSCAPE2.0',
      Buffer.from([0x01, 0x05, 0x00]), // the loop sub-block alone: loop 5 times
    );

    it('keeps the loop count but drops any extra sub-block riding along', () => {
      // A NETSCAPE2.0 block is kept, so it must not become the new hiding place.
      const smuggled = Buffer.concat([
        Buffer.from([0x21, 0xff, 0x0b]),
        Buffer.from('NETSCAPE2.0', 'latin1'),
        Buffer.from([0x03, 0x01, 0x05, 0x00]),
        Buffer.from([0x06]),
        Buffer.from('SECRET', 'latin1'),
        Buffer.from([0x00]),
      ]);
      const gif = Buffer.concat([
        TINY_GIF.subarray(0, TINY_PREAMBLE),
        smuggled,
        TINY_GIF.subarray(TINY_PREAMBLE),
      ]);

      const out = stripGifMetadata(gif);

      expectNoSecrets(out);
      expect(out.includes(canonicalLoop)).toBe(true);
    });

    it('drops a NETSCAPE2.0 block that has no loop sub-block', () => {
      const gif = Buffer.concat([
        TINY_GIF.subarray(0, TINY_PREAMBLE),
        applicationExtension('NETSCAPE2.0', Buffer.from('SECRET')),
        TINY_GIF.subarray(TINY_PREAMBLE),
      ]);

      expect(stripGifMetadata(gif).equals(TINY_GIF)).toBe(true);
    });
  });

  it('drops a Plain Text Extension together with the GCE that belonged to it', () => {
    const plainTextGce = Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x09, 0x00, 0x00, 0x00]);
    const plainText = Buffer.concat([
      Buffer.from([0x21, 0x01, 0x0c]),
      Buffer.alloc(12),
      subBlocks(Buffer.from('SECRET text', 'latin1')),
    ]);
    const gif = Buffer.concat([
      TINY_GIF.subarray(0, TINY_PREAMBLE),
      plainTextGce,
      plainText,
      TINY_GIF.subarray(TINY_PREAMBLE),
    ]);

    const out = stripGifMetadata(gif);

    expectNoSecrets(out);
    // The frame keeps its OWN GCE; the orphaned one does not get re-attached to it.
    expect(out.equals(TINY_GIF)).toBe(true);
  });

  it('drops an extension label it does not recognise', () => {
    const gif = Buffer.concat([
      TINY_GIF.subarray(0, TINY_PREAMBLE),
      Buffer.from([0x21, 0x99]),
      subBlocks(Buffer.from('SECRET')),
      TINY_GIF.subarray(TINY_PREAMBLE),
    ]);

    expect(stripGifMetadata(gif).equals(TINY_GIF)).toBe(true);
  });

  it('handles a GIF87a file, which has no extensions at all', () => {
    const gif87 = Buffer.concat([
      Buffer.from('GIF87a', 'latin1'),
      TINY_GIF.subarray(6, TINY_PREAMBLE),
      TINY_GIF.subarray(TINY_PREAMBLE + 8), // skip the GCE
    ]);

    expect(stripGifMetadata(gif87).equals(gif87)).toBe(true);
  });

  it('supplies the trailer when the file ends cleanly without one', () => {
    const noTrailer = TINY_GIF.subarray(0, TINY_GIF.length - 1);

    expect(stripGifMetadata(noTrailer).equals(TINY_GIF)).toBe(true);
  });

  describe('files it cannot account for', () => {
    it.each([
      ['no GIF signature', Buffer.from('<script>alert(1)</script>')],
      ['a truncated logical screen descriptor', TINY_GIF.subarray(0, 10)],
      ['a truncated global colour table', TINY_GIF.subarray(0, 15)],
      ['truncated frame data', TINY_GIF.subarray(0, TINY_GIF.length - 3)],
      [
        'a truncated extension',
        Buffer.concat([TINY_GIF.subarray(0, TINY_PREAMBLE), Buffer.from([0x21, 0xfe, 0x09, 0x41])]),
      ],
      [
        'a stray byte where a block must start',
        Buffer.concat([TINY_GIF.subarray(0, TINY_PREAMBLE), Buffer.from('<html>')]),
      ],
    ])('throws GifStructureError for %s', (_label, buffer) => {
      expect(() => stripGifMetadata(buffer)).toThrow(GifStructureError);
    });
  });
});
