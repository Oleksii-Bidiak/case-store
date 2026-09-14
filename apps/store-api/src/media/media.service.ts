import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaAsset } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { MEDIA_SUBDIR } from '../storage';
import { ImageUploadService } from '../uploads';
import { MediaRepository, UpdateMediaAssetInput } from './media.repository';
import { MediaUsageRepository } from './media-usage.repository';
import { MEDIA_USAGE_KIND_ORDER, MediaUsage } from './media-usage.types';
import { MediaListQueryDto, MediaMetadataDto, DEFAULT_MEDIA_PAGE_SIZE } from './dto';
import { MediaAssetDetailEntity, MediaAssetEntity } from './entities';

/** How many usages the delete refusal spells out before it says "and N more". */
const MAX_USAGES_IN_REFUSAL = 8;

/** Pagination metadata for the library list. */
export interface MediaPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Envelope returned by the list endpoint. */
export interface MediaListResult {
  data: MediaAssetEntity[];
  meta: MediaPaginationMeta;
}

/**
 * The media library (TASK-441, plan 177).
 *
 * Storage, validation, the WebP/LQIP re-encode and the public URL are NOT here:
 * they belong to {@link ImageUploadService}, the one image pipeline in this API
 * (TASK-424). This service owns what makes an upload a LIBRARY asset — the row
 * that outlives any one form, the metadata an operator curates, and the refusal
 * to delete something a page is still showing.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly usage: MediaUsageRepository,
    private readonly uploads: ImageUploadService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MediaService.name);
  }

  /** One page of the library, each row carrying how many places use it. */
  async findAll(query: MediaListQueryDto): Promise<MediaListResult> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_MEDIA_PAGE_SIZE;

    const { assets, total } = await this.repository.findAll({
      search: query.search,
      tag: query.tag,
      page,
      limit,
    });

    // ONE usage scan for the whole page, not one per row: the repository takes
    // the batch precisely so a 24-thumbnail grid costs the same six queries as a
    // single card.
    const usageByUrl = await this.usage.findUsage(assets.map((asset) => asset.url));

    return {
      data: assets.map((asset) =>
        MediaAssetEntity.fromPrisma(asset, usageByUrl.get(asset.url)?.length ?? 0),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /** One asset with the full list of places that reference it. */
  async findById(id: string): Promise<MediaAssetDetailEntity> {
    const asset = await this.requireAsset(id);
    const usage = await this.usage.findUsageForUrl(asset.url);

    return MediaAssetDetailEntity.fromPrismaWithUsage(asset, this.sortUsage(usage));
  }

  /**
   * Store an upload and record it as a library asset.
   *
   * RE-UPLOADING THE SAME PICTURE MAKES A NEW ASSET, and that is not a bug worth
   * fixing here. Storage names every file with a fresh UUID, so identical bytes
   * uploaded twice are two different URLs and genuinely two different files on
   * disk; pretending otherwise would mean content-addressing the storage layer,
   * which is a separate decision with its own cache-invalidation consequences
   * (see the `minimumCacheTTL` note in the storefront's `next.config.ts`, which
   * is only safe BECAUSE a re-upload is a new URL).
   */
  async upload(
    file: Express.Multer.File | undefined,
    metadata: MediaMetadataDto,
    uploadedById: string | null,
  ): Promise<MediaAssetDetailEntity> {
    const stored = await this.uploads.store(file, MEDIA_SUBDIR);

    const asset = await this.repository.create({
      url: stored.url,
      blurDataUrl: stored.blurDataUrl,
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
      mime: stored.mime,
      alt: this.normaliseAlt(metadata.alt),
      tags: metadata.tags ?? [],
      uploadedById,
    });

    this.logger.info(
      { event: 'media.uploaded', assetId: asset.id, bytes: asset.bytes, mime: asset.mime },
      'Media asset stored',
    );

    // A just-created asset is used nowhere yet, but the detail shape is what the
    // picker consumes, so it is built the same way here as on every other read.
    return MediaAssetDetailEntity.fromPrismaWithUsage(asset, []);
  }

  /** Edit alt text and tags. Nothing else about an asset is editable. */
  async update(id: string, dto: MediaMetadataDto): Promise<MediaAssetDetailEntity> {
    const existing = await this.requireAsset(id);

    const input: UpdateMediaAssetInput = {};
    if (dto.alt !== undefined) {
      input.alt = this.normaliseAlt(dto.alt);
    }
    if (dto.tags !== undefined) {
      input.tags = dto.tags;
    }

    const asset =
      Object.keys(input).length > 0 ? await this.repository.update(id, input) : existing;
    const usage = await this.usage.findUsageForUrl(asset.url);

    return MediaAssetDetailEntity.fromPrismaWithUsage(asset, this.sortUsage(usage));
  }

  /**
   * Delete an asset — row first, then the bytes — but only when nothing points
   * at it.
   *
   * The gate is the whole point of the feature. An asset's URL is copied into
   * product galleries, category tiles and article bodies as a plain string; no
   * foreign key stops a delete, so nothing but this check stands between "tidy
   * up the library" and a broken image on a live product page. It is computed
   * from the rows at this instant rather than read from a column, for the reason
   * spelled out in {@link MediaUsageRepository}.
   *
   * ORDER MATTERS: the row goes first. If the file delete then fails, we are
   * left with bytes nothing references — wasted disk, invisible to everyone. The
   * other order leaves a row pointing at a file that is gone, which every screen
   * showing the library renders as a broken thumbnail.
   */
  async delete(id: string): Promise<void> {
    const asset = await this.requireAsset(id);
    const usage = this.sortUsage(await this.usage.findUsageForUrl(asset.url));

    if (usage.length > 0) {
      throw new ConflictException(this.describeRefusal(usage));
    }

    await this.repository.delete(id);
    await this.uploads.removeByUrl(asset.url);

    this.logger.info({ event: 'media.deleted', assetId: id }, 'Media asset deleted');
  }

  private async requireAsset(id: string): Promise<MediaAsset> {
    const asset = await this.repository.findById(id);
    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }
    return asset;
  }

  /**
   * An empty alt field means "no alt text", not "the empty string".
   *
   * The distinction is not pedantic: `alt=""` is a meaningful, DIFFERENT
   * statement in HTML — "this image is decorative, screen readers should skip
   * it" — and the admin's input sends an empty string whenever the operator
   * clears the box. Storing that verbatim would silently mark every cleared
   * image as decorative.
   */
  private normaliseAlt(alt: string | undefined): string | null {
    const trimmed = alt?.trim();
    return trimmed ? trimmed : null;
  }

  /** Stable ordering, so two reads of the same asset never shuffle its usages. */
  private sortUsage(usage: MediaUsage[]): MediaUsage[] {
    return [...usage].sort(
      (a, b) =>
        MEDIA_USAGE_KIND_ORDER.indexOf(a.kind) - MEDIA_USAGE_KIND_ORDER.indexOf(b.kind) ||
        a.label.localeCompare(b.label),
    );
  }

  /**
   * Turn the usage list into a refusal an operator can act on.
   *
   * It has to be a single string: `HttpExceptionFilter` flattens an exception
   * body down to `{ statusCode, error, message, … }`, so any structured field
   * attached here would be dropped before the client saw it. The admin panel
   * reads the full structured list from `GET /admin/media/:id` instead; this
   * message is what makes the refusal legible to anyone hitting the API directly
   * — and to the operator, if the UI ever just shows the error.
   */
  private describeRefusal(usage: MediaUsage[]): string {
    const shown = usage
      .slice(0, MAX_USAGES_IN_REFUSAL)
      .map((one) => `${one.kind} «${one.label}»`)
      .join(', ');
    const rest = usage.length - Math.min(usage.length, MAX_USAGES_IN_REFUSAL);

    return (
      `This image is still used in ${usage.length} place(s) and cannot be deleted: ` +
      `${shown}${rest > 0 ? `, and ${rest} more` : ''}. ` +
      'Remove it there first, or replace it with another image.'
    );
  }
}
