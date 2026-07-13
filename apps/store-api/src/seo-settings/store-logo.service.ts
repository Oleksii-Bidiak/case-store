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
  MAX_LOGO_BYTES,
  SVG_MIME,
} from './store-logo.constants';
import {
  BRANDING_SUBDIR,
  ImageProcessor,
  IStorageService,
  sanitizeSvg,
  STORAGE_SERVICE,
} from '../storage';

/** The URL path segment under which uploads are served (ServeStaticModule root). */
const PUBLIC_UPLOADS_PREFIX = '/uploads/';

/**
 * Store-logo upload/removal (TASK-299). The logo lives on the SeoSettings
 * singleton (`logoUrl`), so writes go through {@link SeoSettingsService} — that
 * keeps the storefront revalidation in one place.
 *
 * Every accepted upload is neutralised before it reaches the disk: SVG through
 * {@link sanitizeSvg}, raster through a `sharp` re-encode. Nothing a client sends
 * is ever written verbatim.
 */
@Injectable()
export class StoreLogoService {
  private readonly publicBaseUrl: string;

  constructor(
    private readonly settings: SeoSettingsService,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly imageProcessor: ImageProcessor,
    private readonly config: ConfigService,
  ) {
    this.publicBaseUrl = (
      this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
  }

  /**
   * Validate, neutralise, store and persist a new logo, replacing any previous
   * one. The old file is removed only after the new URL is committed, so a failed
   * write never leaves the settings pointing at a deleted file.
   */
  async uploadLogo(file?: Express.Multer.File): Promise<SeoSettingsEntity> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    this.assertValidFile(file);

    const previous = await this.settings.getSettings();
    const { buffer, ext } = await this.prepareFile(file);
    const relativePath = await this.storage.save(buffer, ext, BRANDING_SUBDIR);

    const updated = await this.settings.updateSettings({
      logoUrl: `${this.publicBaseUrl}${PUBLIC_UPLOADS_PREFIX}${relativePath}`,
    });

    await this.removeStoredFile(previous.logoUrl);

    return updated;
  }

  /** Clear `logoUrl` and remove the stored file. Idempotent when no logo is set. */
  async deleteLogo(): Promise<SeoSettingsEntity> {
    const previous = await this.settings.getSettings();
    const updated = await this.settings.updateSettings({ logoUrl: null });

    await this.removeStoredFile(previous.logoUrl);

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
   */
  private async prepareFile(file: Express.Multer.File): Promise<{ buffer: Buffer; ext: string }> {
    if (file.mimetype === SVG_MIME) {
      const svg = sanitizeSvg(file.buffer.toString('utf8'));
      if (!svg) {
        throw new BadRequestException(
          'The uploaded SVG is not a valid image, or nothing safe remained after sanitization',
        );
      }
      return { buffer: Buffer.from(svg, 'utf8'), ext: 'svg' };
    }

    const format = await this.imageProcessor.detectFormat(file.buffer);
    if (!format || !ALLOWED_LOGO_RASTER_FORMATS.has(format)) {
      throw new UnsupportedMediaTypeException('File contents are not a valid PNG/JPEG/WebP image');
    }

    const { webp } = await this.imageProcessor.process(file.buffer);
    return { buffer: webp, ext: 'webp' };
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

  /** Best-effort removal of a stored logo file, given its public URL. */
  private async removeStoredFile(url: string | null): Promise<void> {
    if (!url) {
      return;
    }
    const idx = url.indexOf(PUBLIC_UPLOADS_PREFIX);
    if (idx < 0) {
      return;
    }
    await this.storage.delete(url.slice(idx + PUBLIC_UPLOADS_PREFIX.length));
  }
}
