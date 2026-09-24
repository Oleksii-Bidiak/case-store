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

  describe('metadata between a frame’s GCE and its image descriptor', () => {
    // GCE → Comment → Image is legal (a GCE is scoped to the next RENDERING
    // block, and a Comment is not one), and decoders apply that GCE to the
    // image. Dropping the comment must not drop the frame's timing with it.
    let clean: Buffer;
    let dirty: Buffer;

    beforeAll(async () => {
      clean = await animatedGif();
      const pre = preambleLength(clean);
      const firstFrameGce = clean.indexOf(Buffer.from([0x21, 0xf9]), pre);
      const secondFrameGce = clean.indexOf(Buffer.from([0x21, 0xf9]), firstFrameGce + 2);
      const secondFrameImage = secondFrameGce + 8; // 21 F9 04 <4 bytes> 00
      expect(clean[secondFrameImage]).toBe(0x2c);
      dirty = Buffer.concat([
        clean.subarray(0, secondFrameImage),
        commentExtension('SECRET'),
        xmpExtension(XMP_PACKET),
        Buffer.from([0x21, 0x99]), // an unknown CONTROL label (0x80–0xF9)
        subBlocks(Buffer.from('SECRET control')),
        clean.subarray(secondFrameImage),
      ]);
    });

    it('fixture sanity: decoders still apply the GCE across the comment', async () => {
      expect((await sharp(dirty, { animated: true }).metadata()).delay).toEqual(DELAYS);
    });

    it('keeps the frame’s own GCE, so its delay is unchanged', async () => {
      const out = stripGifMetadata(dirty);

      expectNoSecrets(out);
      expect((await sharp(out, { animated: true }).metadata()).delay).toEqual(DELAYS);
      expect(out.equals(clean)).toBe(true);
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

  it('treats an unknown RENDERING label (0x00–0x7F) like Plain Text: its GCE goes too', () => {
    const gif = Buffer.concat([
      TINY_GIF.subarray(0, TINY_PREAMBLE),
      Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x09, 0x00, 0x00, 0x00]),
      Buffer.from([0x21, 0x02]),
      subBlocks(Buffer.from('SECRET')),
      TINY_GIF.subarray(TINY_PREAMBLE),
    ]);

    expect(stripGifMetadata(gif).equals(TINY_GIF)).toBe(true);
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

  describe('memory stays bounded by the input', () => {
    /** An extension whose `payloadBytes` are split into 1-byte sub-blocks. */
    function oneByteSubBlocks(header: Buffer, payloadBytes: number): Buffer {
      const chain = Buffer.alloc(payloadBytes * 2 + 1);
      for (let i = 0; i < payloadBytes; i++) {
        chain[i * 2] = 0x01;
        chain[i * 2 + 1] = 0x41;
      }
      return Buffer.concat([header, chain]); // the alloc left the terminator 0x00
    }

    it('walks ten million sub-blocks without growing the JS heap', () => {
      // A 1×1 GIF that sharp's probe accepts, carrying 20 MB of metadata made of
      // 1-byte sub-blocks: 5M in a comment, 5M in an application extension (the
      // one path that inspects sub-blocks). Collecting an object per sub-block
      // grew the heap by ~650 MB here, and the API container has 640 MB in all.
      const SUB_BLOCKS = 5_000_000;
      const gif = Buffer.concat([
        TINY_GIF.subarray(0, TINY_PREAMBLE),
        oneByteSubBlocks(Buffer.from([0x21, 0xfe]), SUB_BLOCKS),
        oneByteSubBlocks(
          Buffer.concat([Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0', 'latin1')]),
          SUB_BLOCKS,
        ),
        TINY_GIF.subarray(TINY_PREAMBLE),
      ]);
      const heapBefore = process.memoryUsage().heapTotal;

      const out = stripGifMetadata(gif);

      const heapGrowth = process.memoryUsage().heapTotal - heapBefore;
      expect(out.equals(TINY_GIF)).toBe(true);
      // The output buffer lives outside the JS heap; what is left is noise.
      expect(heapGrowth).toBeLessThan(64 * 1024 * 1024);
    });

    it('never needs more output than input + the trailer it may supply', () => {
      // Worst case for the single up-front output buffer: every kept block is
      // rebuilt at its minimal source size, and the file has no trailer.
      const minimalLoop = applicationExtension('NETSCAPE2.0', Buffer.from([0x01, 0x00, 0x00]));
      const minimalGce = Buffer.from([0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00]);
      const frame = TINY_GIF.subarray(TINY_PREAMBLE + 8, TINY_GIF.length - 1);
      const body = Buffer.concat(
        Array.from({ length: 50 }, () => Buffer.concat([minimalLoop, minimalGce, frame])),
      );
      const noTrailer = Buffer.concat([TINY_GIF.subarray(0, TINY_PREAMBLE), body]);

      const out = stripGifMetadata(noTrailer);

      expect(out.equals(Buffer.concat([noTrailer, Buffer.from([0x3b])]))).toBe(true);
    });
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
