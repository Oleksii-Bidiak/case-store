import { Injectable } from '@nestjs/common';
import { Banner, BannerPlacement, Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { PublishablePort, RevalidateTarget } from '../publishing';
import { ReorderTx, acquireAdvisoryLocks, lockKey, reorderBucket } from '../common/reorder';

/**
 * Advisory-lock namespace for banners (TASK-295). MANDATORY prefix: advisory locks are
 * DATABASE-GLOBAL, so without it a banner reorder would serialise against an unrelated
 * resource's bucket of the same name.
 */
const LOCK_RESOURCE = 'banners';

/** Page size used when the admin asks for a page but names no `limit` (TASK-357). */
const DEFAULT_ADMIN_PAGE_SIZE = 20;

/** Banners are bucketed by `placement` — each placement is its own independent list. */
const placementLockKey = (placement: BannerPlacement): string => lockKey(LOCK_RESOURCE, placement);

/** Any client the reads accept: the injected singleton or an interactive-transaction client. */
type BannerDbClient = PrismaService | ReorderTx;

/**
 * Filter params for the public (published-only) banner list.
 */
export interface FindPublishedParams {
  placement?: BannerPlacement;
}

/**
 * Filter params for the admin banner list (all statuses).
 *
 * `page` / `limit` are OPTIONAL and jointly opt-in: when both are absent the
 * read returns the complete list, which is the mode the reorder UI depends on
 * (its payload must name every banner in a placement).
 */
export interface FindAllAdminParams {
  placement?: BannerPlacement;
  status?: PublishStatus;
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * Result of an admin banner query. `total` counts the rows matching the FILTERS,
 * not the rows returned, so the caller can build honest pagination metadata.
 */
export interface PaginatedBannersResult {
  banners: Banner[];
  total: number;
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
   *
   * The `createdAt: 'asc'` tiebreaker is LOAD-BEARING (TASK-295): it used to be `'desc'`,
   * so while every `sortOrder` is still 0 (the pre-reorder state of every legacy row) the
   * admin list was the exact REVERSE of `findAllPublished`'s — the operator dragged rows in
   * one order and the shopper saw another. The admin list must be WYSIWYG, so both reads
   * now tiebreak identically. Do not flip it back.
   *
   * Accepts a transaction client so the reorder endpoint can re-read the refreshed list
   * inside its own transaction.
   *
   * Pagination is OPT-IN (TASK-357): with neither `page` nor `limit` the query keeps its
   * pre-TASK-357 shape — no `skip`/`take`, and `total` comes from the returned rows instead
   * of a second `count` round-trip.
   */
  async findAllAdmin(
    params: FindAllAdminParams = {},
    client: BannerDbClient = this.prisma,
  ): Promise<PaginatedBannersResult> {
    const where: Prisma.BannerWhereInput = {
      ...(params.placement !== undefined && { placement: params.placement }),
      ...(params.status !== undefined && { status: params.status }),
      ...(params.search && { title: { contains: params.search, mode: 'insensitive' } }),
    };
    const orderBy: Prisma.BannerOrderByWithRelationInput[] = [
      { placement: 'asc' },
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ];

    if (params.page === undefined && params.limit === undefined) {
      const banners = await client.banner.findMany({ where, orderBy });
      return { banners, total: banners.length };
    }

    const limit = params.limit ?? DEFAULT_ADMIN_PAGE_SIZE;
    const skip = ((params.page ?? 1) - 1) * limit;

    const [banners, total] = await Promise.all([
      client.banner.findMany({ where, orderBy, skip, take: limit }),
      client.banner.count({ where }),
    ]);

    return { banners, total };
  }

  /**
   * Rewrite the complete ordering of ONE placement bucket and return the refreshed FULL
   * admin banner list (all placements), read inside the same transaction (TASK-295).
   *
   * `scope: { placement }` is the safety net: every write is `WHERE id = … AND placement =
   * …`, so an id forged from another placement silently updates nothing instead of being
   * stolen into this bucket. Cross-placement moves are out of scope by design — they stay a
   * form edit.
   *
   * Throws the domain errors of `common/reorder/reorder.errors.ts`; the service maps them.
   */
  reorderPlacement(
    placement: BannerPlacement,
    orderedIds: readonly string[],
  ): Promise<PaginatedBannersResult> {
    return reorderBucket<PaginatedBannersResult>(this.prisma, {
      resource: LOCK_RESOURCE,
      bucket: placement,
      orderedIds,
      scope: { placement },
      snapshot: (tx) => tx.banner.findMany({ where: { placement }, select: { id: true } }),
      delegate: (tx) => tx.banner,
      result: (tx) => this.findAllAdmin({}, tx),
    });
  }

  /**
   * Find a banner by ID regardless of status (admin use).
   */
  findById(id: string): Promise<Banner | null> {
    return this.prisma.banner.findUnique({ where: { id } });
  }

  /**
   * Create a new banner, APPENDED to the end of its placement bucket
   * (`sortOrder = max(bucket) + 1`, `0` for the first banner in it) — TASK-295.
   *
   * The old `data.sortOrder ?? 0` default put every new banner ON TOP OF the first one the
   * moment the admin form stops sending a hand-typed `sortOrder` (which the reorder UI
   * removes): the whole bucket would sit at slot 0 and its order would be DB-arbitrary.
   * Same shape as `CategoryRepository.create` — the `max + 1` read runs inside a
   * transaction holding the bucket's advisory lock, so it cannot race a concurrent append
   * or a concurrent `reorderPlacement` and hand out a duplicate slot.
   *
   * An EXPLICIT `data.sortOrder` still wins (the create DTO still exposes the field until
   * the admin panel drops it) — the append is only the default.
   */
  create(data: CreateBannerInput): Promise<Banner> {
    return this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLocks(tx, [placementLockKey(data.placement)]);

      const sortOrder = data.sortOrder ?? (await this.nextSortOrder(tx, data.placement));

      return tx.banner.create({
        data: {
          placement: data.placement,
          title: data.title,
          subtitle: data.subtitle ?? null,
          imageUrl: data.imageUrl ?? null,
          imageBlurDataUrl: data.imageBlurDataUrl ?? null,
          ctaLabel: data.ctaLabel ?? null,
          ctaHref: data.ctaHref ?? null,
          theme: data.theme ?? null,
          sortOrder,
          status: data.status,
          publishedAt: data.publishedAt,
          scheduledAt: data.scheduledAt,
        },
      });
    });
  }

  /** The append slot of a placement bucket: `max(sortOrder) + 1`, or 0 when it is empty. */
  private async nextSortOrder(tx: ReorderTx, placement: BannerPlacement): Promise<number> {
    const { _max } = await tx.banner.aggregate({
      where: { placement },
      _max: { sortOrder: true },
    });
    return _max.sortOrder === null ? 0 : _max.sortOrder + 1;
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
