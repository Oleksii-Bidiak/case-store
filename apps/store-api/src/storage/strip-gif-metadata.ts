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
 *             labels we do not recognise (a GCE in front of a dropped
 *             non-rendering block stays with its image); anything after the
 *             trailer (0x3B), which no decoder reads and a polyglot would hide in.
 *
 * Dropping an ICC profile is deliberate: no mainstream browser applies ICC to a
 * GIF, so it only ever carried the profile's own descriptive strings.
 *
 * A file that ends cleanly at a block boundary without its trailer (some encoders
 * do this, and every decoder tolerates it) gets the trailer appended. A file that
 * is truncated INSIDE a block, or holds a byte where a block must start, is not a
 * GIF we can vouch for, and {@link GifStructureError} is thrown — the caller turns
 * that into a 415 rather than storing bytes it could not account for.
 *
 * Memory is bounded by the input: one output buffer of `input.length + 1` and a
 * handful of offsets, whatever the block count. The walk never allocates per
 * block or per sub-block — a hostile upload can hold ten million of them.
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
/**
 * GIF89a §23: labels 0x00–0x7F are graphic rendering blocks — besides an image,
 * the only blocks a GCE's scope can end on. 0x80–0xF9 are control blocks and
 * 0xFA–0xFF special-purpose ones (Comment, Application); a GCE skips over those.
 */
const LAST_GRAPHIC_RENDERING_LABEL = 0x7f;

/** Application extensions whose only job is the animation loop count. */
const LOOP_APPLICATION_IDS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

const HEADER_BYTES = 6;
const LOGICAL_SCREEN_DESCRIPTOR_BYTES = 7;
const IMAGE_DESCRIPTOR_BYTES = 10;
const APPLICATION_ID_BYTES = 11;
/** A GCE's single data sub-block: packed fields, delay (2), transparent index. */
const GCE_DATA_BYTES = 4;
/** The NETSCAPE2.0 loop sub-block: `01 lo hi`. */
const LOOP_DATA_BYTES = 3;
const LOOP_SUB_BLOCK_ID = 0x01;

/** Bytes of a colour table flagged in a packed field, or 0 when there is none. */
function colorTableBytes(packed: number): number {
  return packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
}

/**
 * Walk a data sub-block chain starting at `pos` and return the offset just past
 * its zero-length terminator. Nothing is collected: a hostile file can split a
 * 20 MB comment into ten million 1-byte sub-blocks, and an object per sub-block
 * would exhaust the heap (the old verbatim passthrough used no memory at all).
 * A caller that needs to look at sub-blocks passes `visit`, which sees each
 * one's size-byte offset and size and keeps only what it needs.
 */
function skipSubBlocks(
  buf: Buffer,
  pos: number,
  visit?: (start: number, size: number) => void,
): number {
  let p = pos;
  for (;;) {
    if (p >= buf.length) {
      throw new GifStructureError('truncated data sub-block chain');
    }
    const size = buf[p];
    if (size === 0) {
      return p + 1;
    }
    if (p + 1 + size > buf.length) {
      throw new GifStructureError('truncated data sub-block');
    }
    visit?.(p, size);
    p += 1 + size;
  }
}

/**
 * The output is written into ONE buffer allocated up front, never gathered as a
 * list of per-block slices (a file of a million minimal frames would otherwise
 * cost a million Buffer objects). It cannot outgrow `input.length + 1`: every
 * kept block is copied verbatim or rebuilt no longer than its source span — a
 * GCE as 8 bytes from a source of at least 8, a loop extension as 19 bytes from
 * a source of at least 19 — each is written only after its source is consumed,
 * and the `+ 1` is the trailer we may have to supply.
 */
class GifWriter {
  private readonly out: Buffer;
  private length = 0;

  constructor(private readonly input: Buffer) {
    this.out = Buffer.alloc(input.length + 1);
  }

  /** Copy `input[start, end)`. */
  copy(start: number, end: number): void {
    this.length += this.input.copy(this.out, this.length, start, end);
  }

  bytes(...values: number[]): void {
    for (const value of values) {
      this.out[this.length++] = value;
    }
  }

  result(): Buffer {
    return this.out.subarray(0, this.length);
  }
}

/**
 * Walk an application extension's sub-blocks (from `pos`, just past its label)
 * and return the chain's end plus the two offsets a loop extension needs: the
 * 11-byte identifier sub-block and the first loop sub-block. Either is -1 when
 * absent. Only these two numbers are kept, however long the chain.
 */
function scanApplicationExtension(
  buf: Buffer,
  pos: number,
): { end: number; idBlock: number; loopBlock: number } {
  let idBlock = -1;
  let loopBlock = -1;
  let first = true;
  const end = skipSubBlocks(buf, pos, (start, size) => {
    if (first) {
      first = false;
      idBlock = size === APPLICATION_ID_BYTES ? start : -1;
    } else if (loopBlock < 0 && size === LOOP_DATA_BYTES && buf[start + 1] === LOOP_SUB_BLOCK_ID) {
      loopBlock = start;
    }
  });
  return { end, idBlock, loopBlock };
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

  const out = new GifWriter(input);
  out.copy(0, pos);
  // A GCE describes the NEXT graphic rendering block. It is held back until we
  // know what that block is: emitted in front of an image, discarded in front of
  // a dropped Plain Text Extension or the trailer, and carried across every
  // non-rendering block dropped on the way (a Comment, an XMP packet …). Held as
  // the offset of its data sub-block's size byte, or -1 when there is none.
  let pendingGce = -1;

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
      const end = skipSubBlocks(input, lzwMinCodeSize + 1);
      if (pendingGce >= 0) {
        out.bytes(EXTENSION_INTRODUCER, LABEL_GRAPHIC_CONTROL);
        out.copy(pendingGce, pendingGce + 1 + GCE_DATA_BYTES);
        out.bytes(0x00);
        pendingGce = -1;
      }
      out.copy(pos, end);
      pos = end;
      continue;
    }

    if (introducer === EXTENSION_INTRODUCER) {
      if (pos + 2 > input.length) {
        throw new GifStructureError('truncated extension');
      }
      const label = input[pos + 1];
      const chain = pos + 2;

      if (label === LABEL_GRAPHIC_CONTROL) {
        // Fixed layout: one 4-byte sub-block. Anything else is not a GCE a
        // decoder would honour, so there is no timing to preserve.
        pos = skipSubBlocks(input, chain);
        pendingGce = input[chain] === GCE_DATA_BYTES ? chain : -1;
        continue;
      }

      if (label === LABEL_APPLICATION) {
        // Keep only a loop extension, rebuilt as identifier + loop sub-block and
        // nothing else, so the kept block cannot become the new hiding place.
        const { end, idBlock, loopBlock } = scanApplicationExtension(input, chain);
        pos = end;
        if (
          idBlock >= 0 &&
          loopBlock >= 0 &&
          LOOP_APPLICATION_IDS.has(
            input.toString('latin1', idBlock + 1, idBlock + 1 + APPLICATION_ID_BYTES),
          )
        ) {
          out.bytes(EXTENSION_INTRODUCER, LABEL_APPLICATION);
          out.copy(idBlock, idBlock + 1 + APPLICATION_ID_BYTES);
          out.copy(loopBlock, loopBlock + 1 + LOOP_DATA_BYTES);
          out.bytes(0x00);
        }
        continue;
      }

      pos = skipSubBlocks(input, chain);
      if (label <= LAST_GRAPHIC_RENDERING_LABEL) {
        // Plain Text (0x01) or another graphic rendering label: it is the block
        // the waiting GCE was scoped to, so that GCE goes with it.
        pendingGce = -1;
      }
      // Comment (0xFE) and unknown control / special-purpose labels are dropped
      // WITHOUT touching pendingGce: they are not rendering blocks, so a GCE in
      // front of them still belongs to the image that follows (GCE, Comment,
      // Image is legal, and decoders apply that GCE to the image).
      continue;
    }

    throw new GifStructureError(
      `unexpected byte 0x${introducer.toString(16).padStart(2, '0')} at offset ${pos}`,
    );
  }

  out.bytes(TRAILER);
  return out.result();
}
