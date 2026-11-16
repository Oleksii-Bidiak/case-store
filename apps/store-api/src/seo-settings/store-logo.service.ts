import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SeoSettingsService } from './seo-settings.service';
import { SeoSettingsEntity } from './entities';
import {
  ALLOWED_LOGO_MIME,
  ALLOWED_LOGO_RASTER_FORMATS,
  LOGO_LIBRARY_MIME,
  LOGO_RASTER_SOURCE_MIME,
  MAX_LOGO_BYTES,
  SVG_MIME,
} from './store-logo.constants';
import {
  BRANDING_SUBDIR,
  ImageProcessor,
  type IStorageService,
  sanitizeSvg,
  STORAGE_SERVICE,
} from '../storage';
import { MediaService, type StoredFileFacts } from '../media';

/** The URL path segment under which uploads are served (ServeStaticModule root). */
const PUBLIC_UPLOADS_PREFIX = '/uploads/';

/** A neutralised logo, ready to write, plus the facts the library row records. */
interface PreparedLogo {
  buffer: Buffer;
  ext: string;
  mime: string;
  sourceMime: string;
  blurDataUrl: string | null;
  width: number;
  height: number;
}

/**
 * Store-logo upload/removal (TASK-299). The logo lives on the SeoSettings
 * singleton (`logoUrl`), so writes go through {@link SeoSettingsService} — that
 * keeps the storefront revalidation in one place.
 *
 * Every accepted upload is neutralised before it reaches the disk: SVG through
 * {@link sanitizeSvg}, raster through a `sharp` re-encode. Nothing a client sends
 * is ever written verbatim.
 *
 * THE LOGO IS A LIBRARY ASSET (TASK-2041). An upload keeps this stricter pipeline
 * (sanitised SVG, 1 MB, `branding/`) but is also recorded as a `MediaAsset`, and
 * the logo can be chosen from the library instead of uploaded. That changes what
 * "replace" and "remove" may do to the previous file: a library asset is never
 * deleted here — the library's own delete, gated on usage, is the only way it
 * goes. Only a legacy `branding/` file that predates this (no library row) is
 * still removed when it stops being the logo, exactly as before.
 */
@Injectable()
export class StoreLogoService {
  private readonly publicBaseUrl: string;

  constructor(
    private readonly settings: SeoSettingsService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly imageProcessor: ImageProcessor,
    private readonly config: ConfigService,
    private readonly media: MediaService,
  ) {
    this.publicBaseUrl = (
      this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
  }

  /**
   * Validate, neutralise, store, record in the library and persist a new logo.
   *
   * The asset row is written BEFORE the settings point at the file, and a failed
   * row removes the file again: the logo is then exactly what it was, and no
   * unlisted file is left behind. The previous logo is let go of only after the
   * new URL is committed, so a failed write never leaves the settings pointing at
   * a deleted file.
   */
  async uploadLogo(
    file?: Express.Multer.File,
    uploadedById: string | null = null,
  ): Promise<SeoSettingsEntity> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    this.assertValidFile(file);

    const previous = await this.settings.getSettings();
    const prepared = await this.prepareFile(file);
    const relativePath = await this.storage.save(prepared.buffer, prepared.ext, BRANDING_SUBDIR);
    const url = `${this.publicBaseUrl}${PUBLIC_UPLOADS_PREFIX}${relativePath}`;

    const facts: StoredFileFacts = {
      url,
      blurDataUrl: prepared.blurDataUrl,
      width: prepared.width,
      height: prepared.height,
      bytes: prepared.buffer.length,
      mime: prepared.mime,
      sourceMime: prepared.sourceMime,
    };
    try {
      await this.media.recordStored(facts, file.originalname, uploadedById);
    } catch (error) {
      await this.storage.delete(relativePath);
      throw error;
    }

    const updated = await this.settings.updateSettings({ logoUrl: url });

    await this.releasePrevious(previous.logoUrl, url);

    return updated;
  }

  /**
   * Make an existing library asset the logo (TASK-2041). 404 for an unknown id
   * (from {@link MediaService.findById}); 400 for a type the logo slot does not
   * take — the same list the upload accepts, so a GIF is refused.
   *
   * The asset was already neutralised on its way into the library: rasters are
   * WebP re-encodes, and the only SVGs there are logos sanitised by
   * {@link uploadLogo}. Nothing is written to disk here.
   */
  async setLogoFromLibrary(mediaAssetId: string): Promise<SeoSettingsEntity> {
    const asset = await this.media.findById(mediaAssetId);
    if (!LOGO_LIBRARY_MIME.has(asset.mime)) {
      throw new BadRequestException(
        `This image cannot be the store logo (${asset.mime}). Allowed: ${[...LOGO_LIBRARY_MIME].join(', ')}`,
      );
    }

    const previous = await this.settings.getSettings();
    const updated = await this.settings.updateSettings({ logoUrl: asset.url });

    await this.releasePrevious(previous.logoUrl, asset.url);

    return updated;
  }

  /**
   * Clear `logoUrl`. Idempotent when no logo is set. The file itself goes only
   * when it is a legacy branding file — see {@link releasePrevious}.
   */
  async deleteLogo(): Promise<SeoSettingsEntity> {
    const previous = await this.settings.getSettings();
    const updated = await this.settings.updateSettings({ logoUrl: null });

    await this.releasePrevious(previous.logoUrl, null);

    return updated;
  }

  /**
   * Turn an accepted upload into bytes that are safe to serve from our origin.
   *
   * SVG is sanitized to a graphics-only allow-list (scripts, event handlers,
   * foreignObject and external references are stripped) — if nothing renderable
   * survives, the upload was not a usable logo and is rejected. Raster uploads are
   * re-encoded to WebP by `sharp`, which both proves the bytes really are the
   * declared format and drops any appended payload.
   *
   * An SVG reports 0×0: its size is whatever it is drawn at, and the library
   * treats 0 as "unknown" (the same convention as its backfilled rows).
   */
  private async prepareFile(file: Express.Multer.File): Promise<PreparedLogo> {
    if (file.mimetype === SVG_MIME) {
      const svg = sanitizeSvg(file.buffer.toString('utf8'));
      if (!svg) {
        throw new BadRequestException(
          'The uploaded SVG is not a valid image, or nothing safe remained after sanitization',
        );
      }
      return {
        buffer: Buffer.from(svg, 'utf8'),
        ext: 'svg',
        mime: SVG_MIME,
        sourceMime: SVG_MIME,
        blurDataUrl: null,
        width: 0,
        height: 0,
      };
    }

    const format = await this.imageProcessor.detectFormat(file.buffer);
    if (!format || !ALLOWED_LOGO_RASTER_FORMATS.has(format)) {
      throw new UnsupportedMediaTypeException('File contents are not a valid PNG/JPEG/WebP image');
    }

    const { webp, blurDataUrl, width, height } = await this.imageProcessor.process(file.buffer);
    return {
      buffer: webp,
      ext: 'webp',
      mime: 'image/webp',
      sourceMime: LOGO_RASTER_SOURCE_MIME[format],
      blurDataUrl,
      width,
      height,
    };
  }

  /**
   * Second, strict MIME/size gate. The Multer `fileFilter` is the first one, but
   * it is transport-level config — the service must not assume it ran.
   */
  private assertValidFile(file: Express.Multer.File): void {
    if (!ALLOWED_LOGO_MIME.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        `Unsupported file type: ${file.mimetype}. Allowed: ${[...ALLOWED_LOGO_MIME].join(', ')}`,
      );
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new PayloadTooLargeException('Logo exceeds the 1 MB limit');
    }
  }

  /**
   * Let go of the logo file that was just replaced or removed.
   *
   * Removed only when ALL of these hold: it is not the new logo, it lives in
   * `branding/` (only this service ever wrote there — anything else is not ours
   * to delete), and no library row holds it. A library asset stays: the library
   * lists it, may show it elsewhere, and deletes it through its usage gate.
   */
  private async releasePrevious(previousUrl: string | null, nextUrl: string | null): Promise<void> {
    if (!previousUrl || previousUrl === nextUrl) {
      return;
    }
    const idx = previousUrl.indexOf(PUBLIC_UPLOADS_PREFIX);
    if (idx < 0) {
      return;
    }
    const relativePath = previousUrl.slice(idx + PUBLIC_UPLOADS_PREFIX.length);
    if (!relativePath.startsWith(`${BRANDING_SUBDIR}/`)) {
      return;
    }
    if (await this.media.isLibraryAsset(previousUrl)) {
      return;
    }
    await this.storage.delete(relativePath);
  }
}
