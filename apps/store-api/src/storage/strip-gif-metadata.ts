/**
 * Remove metadata from a GIF WITHOUT re-encoding a single frame (TASK-587).
 *
 * The raster upload path strips EXIF/XMP by re-encoding through `sharp`. GIFs
 * cannot take that path: libvips would flatten or re-quantise the animation that
 * is the only reason a GIF is accepted at all. So the GIF branch used to store the
 * client's bytes verbatim — and with them every Comment Extension (authoring tool,
 * operator notes) and every XMP packet (`XMP DataXMP`, which is where a camera
 * phone or Photoshop puts author, device and location).
 *
 * This walks the GIF block structure (GIF89a spec, §17–§26) and rebuilds the file
 * from an ALLOW-list of blocks, copying compressed frame data byte for byte:
 *
 *   kept      header, logical screen descriptor, global colour table; every
 *             image (descriptor, local colour table, LZW data); the Graphic
 *             Control Extension that times/disposes it; the loop count of a
 *             `NETSCAPE2.0` / `ANIMEXTS1.0` application extension, rebuilt
 *             canonically so its other sub-blocks cannot carry data.
 *   dropped   Comment Extensions (0xFE); every other Application Extension —
 *             `XMP DataXMP`, `ICCRGBG1012`, `MGK8BIM`, `MGKIPTC` …; Plain Text
 *             Extensions (0x01, rendered by no browser — a text carrier in
 *             practice) together with the GCE that belonged to them; extension
 *             labels we do not recognise; anything after the trailer (0x3B), which
 *             no decoder reads and a polyglot would hide in.
 *
 * Dropping an ICC profile is deliberate: no mainstream browser applies ICC to a
 * GIF, so it only ever carried the profile's own descriptive strings.
 *
 * A file that ends cleanly at a block boundary without its trailer (some encoders
 * do this, and every decoder tolerates it) gets the trailer appended. A file that
 * is truncated INSIDE a block, or holds a byte where a block must start, is not a
 * GIF we can vouch for, and {@link GifStructureError} is thrown — the caller turns
 * that into a 415 rather than storing bytes it could not account for.
 */

export class GifStructureError extends Error {
  constructor(message: string) {
    super(`Malformed GIF: ${message}`);
    this.name = 'GifStructureError';
  }
}

const EXTENSION_INTRODUCER = 0x21;
const IMAGE_SEPARATOR = 0x2c;
const TRAILER = 0x3b;

const LABEL_GRAPHIC_CONTROL = 0xf9;
const LABEL_APPLICATION = 0xff;

/** Application extensions whose only job is the animation loop count. */
const LOOP_APPLICATION_IDS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

const HEADER_BYTES = 6;
const LOGICAL_SCREEN_DESCRIPTOR_BYTES = 7;
const IMAGE_DESCRIPTOR_BYTES = 10;
const APPLICATION_ID_BYTES = 11;

/** Bytes of a colour table flagged in a packed field, or 0 when there is none. */
function colorTableBytes(packed: number): number {
  return packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
}

interface SubBlock {
  /** Offset of the size byte. */
  start: number;
  size: number;
}

/**
 * Walk a data sub-block chain starting at `pos`. Returns the sub-blocks and the
 * offset just past the zero-length terminator.
 */
function readSubBlocks(buf: Buffer, pos: number): { blocks: SubBlock[]; end: number } {
  const blocks: SubBlock[] = [];
  let p = pos;
  for (;;) {
    if (p >= buf.length) {
      throw new GifStructureError('truncated data sub-block chain');
    }
    const size = buf[p];
    if (size === 0) {
      return { blocks, end: p + 1 };
    }
    if (p + 1 + size > buf.length) {
      throw new GifStructureError('truncated data sub-block');
    }
    blocks.push({ start: p, size });
    p += 1 + size;
  }
}

/**
 * The canonical form of a looping application extension — identifier plus the
 * loop sub-block (`01 lo hi`) and nothing else — or null when it has no loop
 * sub-block and is therefore not worth keeping.
 */
function canonicalLoopExtension(buf: Buffer, blocks: SubBlock[]): Buffer | null {
  const [idBlock, ...rest] = blocks;
  if (!idBlock || idBlock.size !== APPLICATION_ID_BYTES) {
    return null;
  }
  const id = buf.toString('latin1', idBlock.start + 1, idBlock.start + 1 + APPLICATION_ID_BYTES);
  if (!LOOP_APPLICATION_IDS.has(id)) {
    return null;
  }
  const loop = rest.find((b) => b.size === 3 && buf[b.start + 1] === 0x01);
  if (!loop) {
    return null;
  }
  return Buffer.concat([
    Buffer.from([EXTENSION_INTRODUCER, LABEL_APPLICATION]),
    buf.subarray(idBlock.start, idBlock.start + 1 + APPLICATION_ID_BYTES),
    buf.subarray(loop.start, loop.start + 4),
    Buffer.from([0x00]),
  ]);
}

/** Rebuild `input` without its metadata blocks. Frame bytes are copied, never decoded. */
export function stripGifMetadata(input: Buffer): Buffer {
  const signature = input.toString('latin1', 0, HEADER_BYTES);
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    throw new GifStructureError('missing GIF signature');
  }
  if (input.length < HEADER_BYTES + LOGICAL_SCREEN_DESCRIPTOR_BYTES) {
    throw new GifStructureError('truncated logical screen descriptor');
  }

  let pos =
    HEADER_BYTES + LOGICAL_SCREEN_DESCRIPTOR_BYTES + colorTableBytes(input[HEADER_BYTES + 4]);
  if (pos > input.length) {
    throw new GifStructureError('truncated global colour table');
  }

  const out: Buffer[] = [input.subarray(0, pos)];
  // A GCE describes the NEXT graphic rendering block. It is held back until we
  // know what that block is: emitted in front of an image, discarded in front of
  // a dropped Plain Text Extension or the trailer.
  let pendingGce: Buffer | null = null;

  for (;;) {
    if (pos >= input.length) {
      // Clean end at a block boundary with no trailer: supply it.
      break;
    }
    const introducer = input[pos];

    if (introducer === TRAILER) {
      break;
    }

    if (introducer === IMAGE_SEPARATOR) {
      if (pos + IMAGE_DESCRIPTOR_BYTES > input.length) {
        throw new GifStructureError('truncated image descriptor');
      }
      const lzwMinCodeSize =
        pos + IMAGE_DESCRIPTOR_BYTES + colorTableBytes(input[pos + IMAGE_DESCRIPTOR_BYTES - 1]);
      if (lzwMinCodeSize >= input.length) {
        throw new GifStructureError('truncated image data');
      }
      const { end } = readSubBlocks(input, lzwMinCodeSize + 1);
      if (pendingGce) {
        out.push(pendingGce);
        pendingGce = null;
      }
      out.push(input.subarray(pos, end));
      pos = end;
      continue;
    }

    if (introducer === EXTENSION_INTRODUCER) {
      if (pos + 2 > input.length) {
        throw new GifStructureError('truncated extension');
      }
      const label = input[pos + 1];
      const { blocks, end } = readSubBlocks(input, pos + 2);

      if (label === LABEL_GRAPHIC_CONTROL) {
        // Fixed layout: one 4-byte sub-block. Anything else is not a GCE a
        // decoder would honour, so there is no timing to preserve.
        const [gce] = blocks;
        pendingGce =
          gce && gce.size === 4
            ? Buffer.concat([
                Buffer.from([EXTENSION_INTRODUCER, LABEL_GRAPHIC_CONTROL]),
                input.subarray(gce.start, gce.start + 5),
                Buffer.from([0x00]),
              ])
            : null;
      } else if (label === LABEL_APPLICATION) {
        const loop = canonicalLoopExtension(input, blocks);
        if (loop) {
          out.push(loop);
        }
      } else {
        // Comment (0xFE), Plain Text (0x01) or an unknown label. A Plain Text
        // block is a graphic rendering block, so the GCE waiting for it goes too.
        pendingGce = null;
      }
      pos = end;
      continue;
    }

    throw new GifStructureError(
      `unexpected byte 0x${introducer.toString(16).padStart(2, '0')} at offset ${pos}`,
    );
  }

  out.push(Buffer.from([TRAILER]));
  return Buffer.concat(out);
}
