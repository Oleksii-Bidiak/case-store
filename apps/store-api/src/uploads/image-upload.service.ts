import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageProcessor, IStorageService, STORAGE_SERVICE, isStorageSubdir } from '../storage';
import {
  ALLOWED_IMAGE_MIME_EXT,
  GIF_MIME,
  MAX_IMAGE_BYTES,
  PUBLIC_UPLOADS_PREFIX,
} from './image-upload.constants';

/** One stored upload. */
export interface StoredImage {
  /** Absolute public URL of the stored file. */
  url: string;
  /** Storage-relative path (`content/<uuid>.webp`) — what `delete` takes. */
  relativePath: string;
  /** base64 LQIP for `next/image` blur-up, or null for a GIF passthrough. */
  blurDataUrl: string | null;
  /**
   * Facts about the bytes that were actually written (TASK-441).
   *
   * Additive, and deliberately so: every existing caller ignores them, while the
   * media library needs them on the row it creates. The alternative — having the
   * library re-open the file it just handed to this service — would be a second
   * decode of the same bytes and a second place that could disagree about them.
   *
   * `width`/`height` are 0 only when the format could not report them; `bytes`
   * is always the real length of the stored buffer.
   */
  width: number;
  height: number;
  bytes: number;
  /** Media type of the STORED file (`image/webp`, or `image/gif` passthrough). */
  mime: string;
}

/**
 * THE image-upload pipeline (TASK-424). Every accepted image in the API goes
 * through here: the product gallery (`ProductImageService`) and the four content
 * routes (`UploadsController`).
 *
 * It exists because the same eight steps were about to be written a second time.
 * They are, in order: reject an unlisted MIME type (415), reject over 20 MB (413),
 * sniff the real format from the bytes, re-encode raster to WebP + derive an
 * LQIP, pass animated GIFs through untouched, narrow the target subdir through
 * the storage whitelist, write the bytes, and assemble the public URL. Getting
 * any one of them wrong in one copy and right in the other is a security bug
 * that reviews do not catch, because both copies look fine on their own.
 *
 * The one thing it deliberately does NOT do is persist anything. Where the URL
 * is recorded — a `ProductImage` row, `Category.image`, a form field the operator
 * pastes it into — is the caller's business.
 */
@Injectable()
export class ImageUploadService {
  private readonly publicBaseUrl: string;

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly imageProcessor: ImageProcessor,
    private readonly config: ConfigService,
  ) {
    this.publicBaseUrl = (
      this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
  }

  /** Validate, neutralise and store one upload. */
  async store(file: Express.Multer.File | undefined, subdir: string): Promise<StoredImage> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    const [stored] = await this.storeAll([file], subdir);
    return stored;
  }

  /**
   * Validate, neutralise and store a batch.
   *
   * EVERY file is validated before ANY file is written: a batch that fails
   * half-way through would otherwise leave orphaned bytes on disk with no row
   * pointing at them, and the caller has no way to know which ones landed.
   */
  async storeAll(files: Express.Multer.File[], subdir: string): Promise<StoredImage[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    // The ONE place a subdir becomes a path segment, so the ONE place the
    // whitelist has to hold. Typed as `string` on purpose: callers that pass a
    // constant are unaffected, and a caller that passes something derived from a
    // request (a route param, a media-library target) cannot skip the check.
    if (!isStorageSubdir(subdir)) {
      throw new BadRequestException(`Unknown upload target: ${subdir}`);
    }

    for (const file of files) {
      this.assertValidFile(file);
    }

    const stored: StoredImage[] = [];
    for (const file of files) {
      const prepared = await this.prepareFile(file);
      const relativePath = await this.storage.save(prepared.buffer, prepared.ext, subdir);
      stored.push({
        url: this.publicUrl(relativePath),
        relativePath,
        blurDataUrl: prepared.blurDataUrl,
        width: prepared.width,
        height: prepared.height,
        bytes: prepared.buffer.length,
        mime: prepared.mime,
      });
    }
    return stored;
  }

  /**
   * Turn an accepted upload into bytes that are safe to serve from our origin.
   *
   * JPEG/PNG/WebP are re-encoded to WebP (smaller payload) with a base64 LQIP for
   * blur-up. Animated GIFs are passed through untouched with no LQIP so the
   * animation survives — and because that is the only branch that writes client
   * bytes verbatim, it cannot trust the declared MIME type: the buffer is sniffed
   * with `sharp` first. Without that, any file (an HTML/JS polyglot) uploaded as
   * `image/gif` would be stored and then served from our own origin.
   *
   * A raster file whose bytes `sharp` cannot decode fails the re-encode, which is
   * translated to 415 here rather than surfacing as a 500.
   */
  private async prepareFile(file: Express.Multer.File): Promise<{
    buffer: Buffer;
    ext: string;
    mime: string;
    blurDataUrl: string | null;
    width: number;
    height: number;
  }> {
    if (file.mimetype === GIF_MIME) {
      // `probe` rather than `detectFormat`: the gate is identical (a buffer that
      // is not really a GIF is refused), and the same single metadata read also
      // yields the dimensions the media library records. Two reads would be two
      // chances for the stored row to disagree with the stored bytes.
      const probe = await this.imageProcessor.probe(file.buffer);
      if (probe?.format !== 'gif') {
        throw new UnsupportedMediaTypeException('File contents are not a valid GIF image');
      }
      return {
        buffer: file.buffer,
        ext: ALLOWED_IMAGE_MIME_EXT[GIF_MIME],
        mime: GIF_MIME,
        blurDataUrl: null,
        width: probe.width,
        height: probe.height,
      };
    }

    try {
      const { webp, blurDataUrl, width, height } = await this.imageProcessor.process(file.buffer);
      return { buffer: webp, ext: 'webp', mime: 'image/webp', blurDataUrl, width, height };
    } catch {
      throw new UnsupportedMediaTypeException('File contents are not a decodable image');
    }
  }

  /** Reject files with a disallowed MIME type (415) or over the size cap (413). */
  private assertValidFile(file: Express.Multer.File): void {
    if (!ALLOWED_IMAGE_MIME_EXT[file.mimetype]) {
      throw new UnsupportedMediaTypeException(
        `Unsupported file type: ${file.mimetype}. Allowed: ${Object.keys(
          ALLOWED_IMAGE_MIME_EXT,
        ).join(', ')}`,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new PayloadTooLargeException('File exceeds the 20 MB limit');
    }
  }

  /** Assemble the absolute public URL for a storage-relative path. */
  publicUrl(relativePath: string): string {
    return `${this.publicBaseUrl}${PUBLIC_UPLOADS_PREFIX}${relativePath}`;
  }

  /** Convert a stored public URL back to its storage-relative path, or null. */
  toRelativePath(url: string): string | null {
    const idx = url.indexOf(PUBLIC_UPLOADS_PREFIX);
    return idx >= 0 ? url.slice(idx + PUBLIC_UPLOADS_PREFIX.length) : null;
  }

  /**
   * Best-effort removal of a stored file, given its public URL. A URL we did not
   * serve (an external CDN link an operator pasted) is silently ignored — it is
   * not ours to delete.
   */
  async removeByUrl(url: string | null | undefined): Promise<void> {
    if (!url) {
      return;
    }
    const relativePath = this.toRelativePath(url);
    if (relativePath) {
      await this.storage.delete(relativePath);
    }
  }
}
