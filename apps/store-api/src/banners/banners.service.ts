import { Injectable, NotFoundException } from '@nestjs/common';
import { PublishStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import {
  BannerRepository,
  CreateBannerInput,
  UpdateBannerInput,
  FindPublishedParams,
  FindAllAdminParams,
} from './banners.repository';
import { BannerEntity } from './entities';
import {
  CreateBannerDto,
  UpdateBannerDto,
  BannerListQueryDto,
  AdminBannerListQueryDto,
  ReorderBannersDto,
} from './dto';
import { RevalidationNotifier, resolvePublishState, type RevalidateTarget } from '../publishing';
import { reorderErrorToHttp } from '../common/reorder';

/**
 * Response envelope for the PUBLIC banner list — no `meta`: the storefront reads
 * the complete published set and groups it by placement itself.
 */
interface BannerListResponse {
  data: BannerEntity[];
}

/** Pagination metadata carried by every ADMIN banner list response. */
interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Response envelope for the admin banner list.
 *
 * `meta` is present even when the caller asked for no pagination — the admin
 * panel needs an honest row count to render "N записів" and to decide whether a
 * pager is warranted at all, and an envelope that changes shape depending on the
 * query would force the client to branch on it.
 */
interface AdminBannerListResponse {
  data: BannerEntity[];
  meta: PaginationMeta;
}

@Injectable()
export class BannerService {
  /** Homepage cache target purged after any admin write that changes visibility. */
  private readonly revalidateTarget: RevalidateTarget = {
    tags: ['banners'],
    paths: ['/'],
  };

  constructor(
    private readonly bannerRepository: BannerRepository,
    private readonly revalidation: RevalidationNotifier,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BannerService.name);
  }

  /**
   * List published banners (public storefront), optionally filtered by placement.
   */
  async findAllPublished(query: BannerListQueryDto): Promise<BannerListResponse> {
    const params: FindPublishedParams = { placement: query.placement };
    const banners = await this.bannerRepository.findAllPublished(params);

    return { data: banners.map((banner) => BannerEntity.fromPrisma(banner)) };
  }

  /**
   * List all banners including drafts (admin), optionally filtered, searched and
   * paginated. Omitting `page`/`limit` returns the complete list — the mode the
   * reorder UI requires (TASK-357).
   */
  async findAllAdmin(query: AdminBannerListQueryDto): Promise<AdminBannerListResponse> {
    const params: FindAllAdminParams = {
      placement: query.placement,
      status: query.status,
      page: query.page,
      limit: query.limit,
      search: query.search,
    };
    const { banners, total } = await this.bannerRepository.findAllAdmin(params);

    return {
      data: banners.map((banner) => BannerEntity.fromPrisma(banner)),
      meta: this.buildMeta(total, query.page, query.limit),
    };
  }

  /**
   * Get a banner by ID (admin). Throws NotFoundException when not found.
   */
  async findByIdAdmin(id: string): Promise<BannerEntity> {
    const banner = await this.bannerRepository.findById(id);

    if (!banner) {
      throw new NotFoundException('Banner not found');
    }

    return BannerEntity.fromPrisma(banner);
  }

  /**
   * Create a banner (admin). Resolves publish state and revalidates the homepage
   * when the new banner is live.
   */
  async create(dto: CreateBannerDto): Promise<BannerEntity> {
    const publishState = resolvePublishState(
      {
        status: dto.status ?? PublishStatus.DRAFT,
        scheduledAt: this.parseScheduledAt(dto.scheduledAt),
      },
      new Date(),
    );

    const input: CreateBannerInput = {
      placement: dto.placement,
      title: dto.title,
      subtitle: dto.subtitle,
      imageUrl: dto.imageUrl,
      imageBlurDataUrl: dto.imageBlurDataUrl,
      ctaLabel: dto.ctaLabel,
      ctaHref: dto.ctaHref,
      theme: dto.theme,
      status: publishState.status,
      publishedAt: publishState.publishedAt,
      scheduledAt: publishState.scheduledAt,
    };

    const banner = await this.bannerRepository.create(input);
    const entity = BannerEntity.fromPrisma(banner);
    if (entity.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }
    return entity;
  }

  /**
   * Update a banner (admin). Only provided fields are written; publish fields are
   * resolved only when `status` is supplied. Revalidates the homepage whenever
   * public visibility could have changed.
   */
  async update(id: string, dto: UpdateBannerDto): Promise<BannerEntity> {
    const banner = await this.bannerRepository.findById(id);
    if (!banner) {
      throw new NotFoundException('Banner not found');
    }

    const wasPublished = banner.status === PublishStatus.PUBLISHED;

    const input: UpdateBannerInput = {
      placement: dto.placement,
      title: dto.title,
      subtitle: dto.subtitle,
      imageUrl: dto.imageUrl,
      imageBlurDataUrl: dto.imageBlurDataUrl,
      ctaLabel: dto.ctaLabel,
      ctaHref: dto.ctaHref,
      theme: dto.theme,
    };

    // Only touch publish fields when the admin actually sent a `status`.
    if (dto.status !== undefined) {
      const resolved = resolvePublishState(
        { status: dto.status, scheduledAt: this.parseScheduledAt(dto.scheduledAt) },
        new Date(),
      );
      input.status = resolved.status;
      input.scheduledAt = resolved.scheduledAt;
      // Preserve the ORIGINAL publish time when the banner was already live and
      // stays live — re-saving a published banner must not reset publishedAt.
      input.publishedAt =
        resolved.status === PublishStatus.PUBLISHED && wasPublished && banner.publishedAt
          ? banner.publishedAt
          : resolved.publishedAt;
    }

    const updated = await this.bannerRepository.update(id, input);
    const entity = BannerEntity.fromPrisma(updated);
    // Revalidate whenever public visibility could have changed: the banner is
    // live now, or it was live before (e.g. just unpublished or edited in place).
    if (wasPublished || entity.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }
    return entity;
  }

  /**
   * Publish a banner (status = PUBLISHED). Throws NotFoundException when missing.
   */
  async publish(id: string): Promise<BannerEntity> {
    await this.ensureExists(id);
    const banner = await this.bannerRepository.publish(id);
    const entity = BannerEntity.fromPrisma(banner);
    await this.notifyRevalidation();
    return entity;
  }

  /**
   * Unpublish a banner (status = DRAFT). Throws NotFoundException when missing.
   */
  async unpublish(id: string): Promise<BannerEntity> {
    await this.ensureExists(id);
    const banner = await this.bannerRepository.unpublish(id);
    const entity = BannerEntity.fromPrisma(banner);
    // Purge the now-stale published copy from the storefront cache.
    await this.notifyRevalidation();
    return entity;
  }

  /**
   * Hard-delete a banner (admin). Revalidates the homepage when a live banner is
   * removed. Throws NotFoundException when missing.
   */
  async delete(id: string): Promise<void> {
    const banner = await this.bannerRepository.findById(id);
    if (!banner) {
      throw new NotFoundException('Banner not found');
    }
    await this.bannerRepository.delete(id);
    if (banner.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }
  }

  /**
   * Reorder ONE placement bucket (admin, TASK-295) and return the refreshed FULL admin
   * banner list — all placements — so the panel resyncs in a single round-trip, exactly as
   * the category reorder does.
   *
   * The repository's domain errors are mapped to HTTP here, so the wire body carries the
   * stable `error` code the admin panel keys its UA announcements off.
   */
  async reorderPlacement(
    dto: ReorderBannersDto,
    actorId?: string,
  ): Promise<AdminBannerListResponse> {
    let banners;
    let total;
    try {
      ({ banners, total } = await this.bannerRepository.reorderPlacement(
        dto.placement,
        dto.orderedIds,
      ));
    } catch (error) {
      throw reorderErrorToHttp(error);
    }

    // Revalidate ONLY when the reordered bucket actually contains something the shopper can
    // see — a pure draft shuffle changes nothing public, and this service already gates its
    // revalidation on visibility everywhere else (create / update / delete).
    const bucketHasPublished = banners.some(
      (banner) => banner.placement === dto.placement && banner.status === PublishStatus.PUBLISHED,
    );
    if (bucketHasPublished) {
      await this.notifyRevalidation();
    }

    this.logger.info(
      {
        event: 'banner.reorder',
        placement: dto.placement,
        orderedIds: dto.orderedIds,
        revalidated: bucketHasPublished,
        actorId,
      },
      'Banners reordered',
    );

    // The reorder always answers with the COMPLETE admin list, so its `meta` is the
    // unpaginated one. Shape parity with `findAllAdmin` is load-bearing: the admin panel
    // writes this response straight into the list query's cache
    // (`useReorderLifecycle` → `setQueryData`), and an envelope missing `meta` would blank
    // the list's row counter the moment someone drags a row.
    return {
      data: banners.map((banner) => BannerEntity.fromPrisma(banner)),
      meta: this.buildMeta(total),
    };
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  /**
   * Pagination metadata. With no `limit` the whole list came back in one response,
   * so it is reported as a single page of size `total` rather than inventing a page
   * size the caller never asked for. An EMPTY unpaginated list would make that size
   * 0, so `totalPages` is short-circuited instead of dividing by zero.
   */
  private buildMeta(total: number, page?: number, limit?: number): PaginationMeta {
    const effectiveLimit = limit ?? total;

    return {
      total,
      page: page ?? 1,
      limit: effectiveLimit,
      totalPages: effectiveLimit === 0 ? 0 : Math.ceil(total / effectiveLimit),
    };
  }

  private async ensureExists(id: string): Promise<void> {
    const banner = await this.bannerRepository.findById(id);
    if (!banner) {
      throw new NotFoundException('Banner not found');
    }
  }

  /** Parse an ISO date string from the DTO into a Date (or null when absent). */
  private parseScheduledAt(value?: string | null): Date | null {
    return value ? new Date(value) : null;
  }

  /** Best-effort storefront revalidation after an admin write. Never throws. */
  private async notifyRevalidation(): Promise<void> {
    await this.revalidation.revalidate(this.revalidateTarget);
  }
}
