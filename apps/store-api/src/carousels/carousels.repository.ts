import { Injectable } from '@nestjs/common';
import { Carousel, CarouselPlacement, CarouselSource, Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { PublishablePort, RevalidateTarget } from '../publishing';
import { ReorderTx, acquireAdvisoryLocks, lockKey, reorderBucket } from '../common/reorder';

/** Page size used when the admin asks for a page but names no `limit` (TASK-357). */
const DEFAULT_ADMIN_PAGE_SIZE = 20;

/**
 * Advisory-lock namespace for carousels (TASK-428). MANDATORY prefix: advisory locks are
 * DATABASE-GLOBAL, so without it a carousel reorder would serialise against an unrelated
 * resource's bucket of the same name.
 */
const LOCK_RESOURCE = 'carousels';

/** Carousels are bucketed by `placement` — each placement is its own independent list. */
const placementLockKey = (placement: CarouselPlacement): string =>
  lockKey(LOCK_RESOURCE, placement);

/** Any client the reads accept: the injected singleton or an interactive-transaction client. */
type CarouselDbClient = PrismaService | ReorderTx;

/**
 * Filter params for the public carousel list (PUBLISHED only).
 */
export interface FindPublishedParams {
  placement?: CarouselPlacement;
}

/**
 * Filter params for the admin carousel list (all statuses).
 *
 * `page` / `limit` are OPTIONAL and jointly opt-in: with both absent the read
 * returns the complete list, exactly as it did before TASK-357.
 */
export interface FindAllAdminParams {
  placement?: CarouselPlacement;
  status?: PublishStatus;
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * Result of an admin carousel query. `total` counts the rows matching the
 * FILTERS, not the rows returned, so the caller can build honest metadata.
 */
export interface PaginatedCarouselsResult {
  carousels: Carousel[];
  total: number;
}

/**
 * Allowed fields for creating a carousel. Publish fields are pre-resolved by
 * the service via `resolvePublishState`.
 */
export interface CreateCarouselInput {
  title: string;
  source: CarouselSource;
  categoryId?: string | null;
  itemLimit?: number;
  placement?: CarouselPlacement;
  sortOrder?: number;
  status: PublishStatus;
  publishedAt: Date | null;
  scheduledAt: Date | null;
}

/**
 * Allowed fields for updating a carousel. Only provided fields are written.
 */
export interface UpdateCarouselInput {
  title?: string;
  source?: CarouselSource;
  categoryId?: string | null;
  itemLimit?: number;
  placement?: CarouselPlacement;
  sortOrder?: number;
  status?: PublishStatus;
  publishedAt?: Date | null;
  scheduledAt?: Date | null;
}

/**
 * A CarouselItem row reduced to what the MANUAL resolver needs.
 */
export interface CarouselItemIdRow {
  productId: string;
  sortOrder: number;
}

/**
 * One item to persist in a full-replace `replaceItems` write.
 */
export interface ReplaceItemInput {
  productId: string;
  sortOrder: number;
}

/**
 * A CarouselItem row joined with a minimal product summary for the ADMIN item
 * panel. Deliberately not `isActive`-filtered — a deactivated product still
 * resolves its real name/image for admin display fidelity (contrast with the
 * storefront-facing `ProductService.getCardsByIds`, which stays active-only).
 */
export interface CarouselItemWithProduct {
  id: string;
  productId: string;
  sortOrder: number;
  product: {
    id: string;
    name: string;
    price: Prisma.Decimal;
    isActive: boolean;
    images: { url: string }[];
  };
}

/**
 * Repository encapsulating all Prisma access for the Carousel + CarouselItem
 * models. Services depend on this class — never on PrismaClient directly.
 *
 * Also implements {@link PublishablePort}: it is registered under
 * `PUBLISHABLE_REPOSITORY` so the PublishingScheduler flips due SCHEDULED
 * carousels live on its cron tick, purging the homepage cache afterwards.
 */
@Injectable()
export class CarouselRepository implements PublishablePort {
  constructor(private readonly prisma: PrismaService) {}

  /** Cache target purged when scheduled carousels go live (see PublishingScheduler). */
  readonly revalidateTarget: RevalidateTarget = {
    tags: ['carousels'],
    paths: ['/'],
  };

  /**
   * Find all PUBLISHED carousels ordered by sortOrder then createdAt ascending,
   * optionally narrowed to ONE placement. `status = PUBLISHED` is the single
   * public-visibility gate; `placement` only scopes WHERE they render, so an
   * omitted filter keeps returning every published carousel.
   */
  findAllPublished(params: FindPublishedParams = {}): Promise<Carousel[]> {
    const where: Prisma.CarouselWhereInput = {
      status: PublishStatus.PUBLISHED,
      ...(params.placement !== undefined && { placement: params.placement }),
    };

    return this.prisma.carousel.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Find all carousels (any status) with optional placement / status filters,
   * a title search and opt-in pagination. Admin listing.
   *
   * With neither `page` nor `limit` the query keeps its pre-TASK-357 shape — no
   * `skip`/`take`, and `total` comes from the rows we already hold rather than a
   * second `count` round-trip.
   *
   * Accepts a transaction client so the reorder endpoint can re-read the refreshed list
   * inside its own transaction.
   *
   * The `createdAt: 'asc'` tiebreaker is LOAD-BEARING (TASK-428): it used to be `'desc'`,
   * so while every `sortOrder` was still 0 (the pre-TASK-428 state of every row) the admin
   * list was the exact REVERSE of `findAllPublished`'s — the operator saw one order and
   * the shopper another. Both reads now tiebreak identically. Do not flip it back.
   */
  async findAllAdmin(
    params: FindAllAdminParams = {},
    client: CarouselDbClient = this.prisma,
  ): Promise<PaginatedCarouselsResult> {
    const where: Prisma.CarouselWhereInput = {
      ...(params.placement !== undefined && { placement: params.placement }),
      ...(params.status !== undefined && { status: params.status }),
      ...(params.search && { title: { contains: params.search, mode: 'insensitive' } }),
    };
    const orderBy: Prisma.CarouselOrderByWithRelationInput[] = [
      { placement: 'asc' },
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ];

    if (params.page === undefined && params.limit === undefined) {
      const carousels = await client.carousel.findMany({ where, orderBy });
      return { carousels, total: carousels.length };
    }

    const limit = params.limit ?? DEFAULT_ADMIN_PAGE_SIZE;
    const skip = ((params.page ?? 1) - 1) * limit;

    const [carousels, total] = await Promise.all([
      client.carousel.findMany({ where, orderBy, skip, take: limit }),
      client.carousel.count({ where }),
    ]);

    return { carousels, total };
  }

  /**
   * Rewrite the complete ordering of ONE placement bucket and return the refreshed FULL
   * admin carousel list (both placements), read inside the same transaction (TASK-428).
   *
   * `scope: { placement }` is the safety net: every write is `WHERE id = … AND placement =
   * …`, so an id forged from the other placement silently updates nothing instead of being
   * stolen into this bucket. Cross-placement moves are out of scope by design — they stay
   * a form edit.
   *
   * Throws the domain errors of `common/reorder/reorder.errors.ts`; the service maps them.
   */
  reorderPlacement(
    placement: CarouselPlacement,
    orderedIds: readonly string[],
  ): Promise<PaginatedCarouselsResult> {
    return reorderBucket<PaginatedCarouselsResult>(this.prisma, {
      resource: LOCK_RESOURCE,
      bucket: placement,
      orderedIds,
      scope: { placement },
      snapshot: (tx) => tx.carousel.findMany({ where: { placement }, select: { id: true } }),
      delegate: (tx) => tx.carousel,
      result: (tx) => this.findAllAdmin({}, tx),
    });
  }

  /**
   * Find a carousel by ID regardless of status (admin use).
   */
  findById(id: string): Promise<Carousel | null> {
    return this.prisma.carousel.findUnique({ where: { id } });
  }

  /**
   * Create a new carousel, APPENDED to the end of its placement bucket
   * (`sortOrder = max(bucket) + 1`, `0` for the first carousel in it) — TASK-428.
   *
   * The old `data.sortOrder ?? 0` default put every new carousel ON TOP OF the first one
   * the moment the admin form stopped sending a hand-typed number (which the reorder UI
   * removes): the whole bucket would sit at slot 0 and its order would be DB-arbitrary.
   * Same shape as `BannerRepository.create` — the `max + 1` read runs INSIDE a transaction
   * holding the bucket's advisory lock, so it cannot race a concurrent append or a
   * concurrent `reorderPlacement` and hand out a duplicate slot.
   *
   * An EXPLICIT `data.sortOrder` still wins — the append is only the default.
   */
  create(data: CreateCarouselInput): Promise<Carousel> {
    const placement = data.placement ?? CarouselPlacement.HOME_RAILS;

    return this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLocks(tx, [placementLockKey(placement)]);

      const sortOrder = data.sortOrder ?? (await this.nextSortOrder(tx, placement));

      return tx.carousel.create({
        data: {
          title: data.title,
          source: data.source,
          categoryId: data.categoryId ?? null,
          itemLimit: data.itemLimit ?? 12,
          placement,
          sortOrder,
          status: data.status,
          publishedAt: data.publishedAt,
          scheduledAt: data.scheduledAt,
        },
      });
    });
  }

  /** The append slot of a placement bucket: `max(sortOrder) + 1`, or 0 when it is empty. */
  private async nextSortOrder(tx: ReorderTx, placement: CarouselPlacement): Promise<number> {
    const { _max } = await tx.carousel.aggregate({
      where: { placement },
      _max: { sortOrder: true },
    });
    return _max.sortOrder === null ? 0 : _max.sortOrder + 1;
  }

  /**
   * Update a carousel's fields. Only provided fields are written.
   */
  update(id: string, data: UpdateCarouselInput): Promise<Carousel> {
    return this.prisma.carousel.update({
      where: { id },
      data,
    });
  }

  /**
   * Publish a carousel immediately: status = PUBLISHED, publishedAt = now,
   * scheduledAt cleared.
   */
  publish(id: string, now: Date = new Date()): Promise<Carousel> {
    return this.prisma.carousel.update({
      where: { id },
      data: {
        status: PublishStatus.PUBLISHED,
        publishedAt: now,
        scheduledAt: null,
      },
    });
  }

  /**
   * Unpublish a carousel — returns it to DRAFT: publishedAt & scheduledAt cleared.
   */
  unpublish(id: string): Promise<Carousel> {
    return this.prisma.carousel.update({
      where: { id },
      data: {
        status: PublishStatus.DRAFT,
        publishedAt: null,
        scheduledAt: null,
      },
    });
  }

  /**
   * Hard-delete a carousel. Carousels are admin content, not user data — no
   * tombstone. `CarouselItem` rows cascade automatically (`onDelete: Cascade`).
   */
  delete(id: string): Promise<Carousel> {
    return this.prisma.carousel.delete({ where: { id } });
  }

  /**
   * {@link PublishablePort.publishDue} — flip every SCHEDULED carousel whose
   * `scheduledAt` has passed to PUBLISHED, stamping `publishedAt = now` and
   * clearing `scheduledAt`. Returns the count flipped.
   */
  async publishDue(now: Date): Promise<number> {
    const { count } = await this.prisma.carousel.updateMany({
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

  /**
   * CarouselItem rows for one carousel — `productId` + `sortOrder` only,
   * ordered by `sortOrder` ascending. Feeds the resolver's MANUAL branch.
   */
  findItemIds(carouselId: string): Promise<CarouselItemIdRow[]> {
    return this.prisma.carouselItem.findMany({
      where: { carouselId },
      select: { productId: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * CarouselItem rows for one carousel joined with a minimal product summary
   * (name, price, active flag, primary image — falling back to the lowest
   * `sortOrder` image when none is flagged primary) in ONE query. Feeds the
   * admin item-management endpoint so the picker UI never does a follow-up
   * per-item fetch. Deliberately NOT `isActive`-filtered (admin-only read).
   */
  findItemsWithProducts(carouselId: string): Promise<CarouselItemWithProduct[]> {
    return this.prisma.carouselItem.findMany({
      where: { carouselId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        productId: true,
        sortOrder: true,
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            isActive: true,
            images: {
              select: { url: true },
              orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
              take: 1,
            },
          },
        },
      },
    });
  }

  /**
   * Full-replace the item set of one carousel in a single transaction:
   * `deleteMany` + `createMany`. Mirrors the "full-replace on write" precedent
   * (`ReorderImagesDto` persistence / `CategoryAddonTemplate`, plan 150).
   */
  async replaceItems(carouselId: string, items: ReplaceItemInput[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.carouselItem.deleteMany({ where: { carouselId } }),
      ...(items.length > 0
        ? [
            this.prisma.carouselItem.createMany({
              data: items.map((item) => ({
                carouselId,
                productId: item.productId,
                sortOrder: item.sortOrder,
              })),
            }),
          ]
        : []),
    ]);
  }
}
