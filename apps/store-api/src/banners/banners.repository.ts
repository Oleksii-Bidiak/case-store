import { Injectable } from '@nestjs/common';
import { Banner, BannerPlacement, Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { PublishablePort, RevalidateTarget } from '../publishing';

/**
 * Filter params for the public (published-only) banner list.
 */
export interface FindPublishedParams {
  placement?: BannerPlacement;
}

/**
 * Filter params for the admin banner list (all statuses).
 */
export interface FindAllAdminParams {
  placement?: BannerPlacement;
  status?: PublishStatus;
}

/**
 * Allowed fields for creating a banner. Publish fields are pre-resolved by the
 * service via `resolvePublishState`.
 */
export interface CreateBannerInput {
  placement: BannerPlacement;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  imageBlurDataUrl?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  theme?: string | null;
  sortOrder?: number;
  status: PublishStatus;
  publishedAt: Date | null;
  scheduledAt: Date | null;
}

/**
 * Allowed fields for updating a banner. Only provided fields are written.
 */
export interface UpdateBannerInput {
  placement?: BannerPlacement;
  title?: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  imageBlurDataUrl?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  theme?: string | null;
  sortOrder?: number;
  status?: PublishStatus;
  publishedAt?: Date | null;
  scheduledAt?: Date | null;
}

/**
 * Repository encapsulating all Prisma access for the Banner model.
 * Services depend on this class — never on PrismaClient directly.
 *
 * Also implements {@link PublishablePort}: it is registered under
 * `PUBLISHABLE_REPOSITORY` so the PublishingScheduler flips due SCHEDULED
 * banners live on its cron tick, purging the homepage cache afterwards.
 */
@Injectable()
export class BannerRepository implements PublishablePort {
  constructor(private readonly prisma: PrismaService) {}

  /** Cache target purged when scheduled banners go live (see PublishingScheduler). */
  readonly revalidateTarget: RevalidateTarget = {
    tags: ['banners'],
    paths: ['/'],
  };

  /**
   * Find all PUBLISHED banners, optionally filtered by placement. Ordered by
   * placement, then sortOrder ascending — the storefront groups them per
   * placement. `status = PUBLISHED` is the single public-visibility gate.
   */
  findAllPublished(params: FindPublishedParams = {}): Promise<Banner[]> {
    const where: Prisma.BannerWhereInput = {
      status: PublishStatus.PUBLISHED,
      ...(params.placement !== undefined && { placement: params.placement }),
    };

    return this.prisma.banner.findMany({
      where,
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Find all banners (any status) with optional placement and status filters.
   * Admin listing.
   */
  findAllAdmin(params: FindAllAdminParams = {}): Promise<Banner[]> {
    const where: Prisma.BannerWhereInput = {
      ...(params.placement !== undefined && { placement: params.placement }),
      ...(params.status !== undefined && { status: params.status }),
    };

    return this.prisma.banner.findMany({
      where,
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Find a banner by ID regardless of status (admin use).
   */
  findById(id: string): Promise<Banner | null> {
    return this.prisma.banner.findUnique({ where: { id } });
  }

  /**
   * Create a new banner.
   */
  create(data: CreateBannerInput): Promise<Banner> {
    return this.prisma.banner.create({
      data: {
        placement: data.placement,
        title: data.title,
        subtitle: data.subtitle ?? null,
        imageUrl: data.imageUrl ?? null,
        imageBlurDataUrl: data.imageBlurDataUrl ?? null,
        ctaLabel: data.ctaLabel ?? null,
        ctaHref: data.ctaHref ?? null,
        theme: data.theme ?? null,
        sortOrder: data.sortOrder ?? 0,
        status: data.status,
        publishedAt: data.publishedAt,
        scheduledAt: data.scheduledAt,
      },
    });
  }

  /**
   * Update a banner's fields. Only provided fields are written.
   */
  update(id: string, data: UpdateBannerInput): Promise<Banner> {
    return this.prisma.banner.update({
      where: { id },
      data,
    });
  }

  /**
   * Publish a banner immediately: status = PUBLISHED, publishedAt = now,
   * scheduledAt cleared.
   */
  publish(id: string, now: Date = new Date()): Promise<Banner> {
    return this.prisma.banner.update({
      where: { id },
      data: {
        status: PublishStatus.PUBLISHED,
        publishedAt: now,
        scheduledAt: null,
      },
    });
  }

  /**
   * Unpublish a banner — returns it to DRAFT: publishedAt & scheduledAt cleared.
   */
  unpublish(id: string): Promise<Banner> {
    return this.prisma.banner.update({
      where: { id },
      data: {
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      },
    });
  }

  /**
   * Hard-delete a banner. Banners are admin content, not user data — no tombstone.
   */
  delete(id: string): Promise<Banner> {
    return this.prisma.banner.delete({ where: { id } });
  }

  /**
   * {@link PublishablePort.publishDue} — flip every SCHEDULED banner whose
   * `scheduledAt` has passed to PUBLISHED, stamping `publishedAt = now` and
   * clearing `scheduledAt`. Returns the count flipped.
   */
  async publishDue(now: Date): Promise<number> {
    const { count } = await this.prisma.banner.updateMany({
      where: {
        status: PublishStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      data: {
        status: PublishStatus.PUBLISHED,
        publishedAt: now,
        scheduledAt: null,
      },
    });
    return count;
  }
}
