import { Injectable } from '@nestjs/common';
import { Carousel, CarouselSource, Prisma, PublishStatus } from '@prisma/client';
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

/**
 * Carousels are ONE global list since TASK-660. Where a carousel shows on the homepage
 * belongs to the homepage block pointing at it, not to the carousel, so the per-placement
 * buckets of TASK-428 are gone and the admin order is a single sequence under one lock.
 */
const LIST_LOCK_KEY = lockKey(LOCK_RESOURCE, null);

/** Any client the reads accept: the injected singleton or an interactive-transaction client. */
type CarouselDbClient = PrismaService | ReorderTx;

/**
 * Filter params for the admin carousel list (all statuses).
 *
 * `page` / `limit` are OPTIONAL and jointly opt-in: with both absent the read
 * returns the complete list, exactly as it did before TASK-357.
 */
export interface FindAllAdminParams {
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

  /**
   * Cache target purged when scheduled carousels go live (see PublishingScheduler).
   * `home-blocks` too (TASK-660): the homepage reads carousels THROUGH its blocks, so a
   * carousel going live changes the `/api/home-blocks` payload the storefront caches.
   */
  readonly revalidateTarget: RevalidateTarget = {
    tags: ['carousels', 'home-blocks'],
    paths: ['/'],
  };

  /**
   * Find all PUBLISHED carousels ordered by sortOrder then createdAt ascending.
   * `status = PUBLISHED` is the single public-visibility gate. Since TASK-660 this is
   * NOT the homepage read — the homepage shows the carousels its blocks point at
   * (`GET /api/home-blocks`).
   */
  findAllPublished(): Promise<Carousel[]> {
    return this.prisma.carousel.findMany({
      where: { status: PublishStatus.PUBLISHED },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Find all carousels (any status) with an optional status filter, a title search and
   * opt-in pagination. Admin listing.
   *
   * With neither `page` nor `limit` the query keeps its pre-TASK-357 shape — no
   * `skip`/`take`, and `total` comes from the rows we already hold rather than a
   * second `count` round-trip.
   *
   * Accepts a transaction client so the reorder endpoint can re-read the refreshed list
   * inside its own transaction.
   *
   * The `createdAt: 'asc'` tiebreaker is LOAD-BEARING (TASK-428): it used to be `'desc'`,
   * so while every `sortOrder` was still 0 the admin list was the exact REVERSE of
   * `findAllPublished`'s. Both reads now tiebreak identically. Do not flip it back.
   */
  async findAllAdmin(
    params: FindAllAdminParams = {},
    client: CarouselDbClient = this.prisma,
  ): Promise<PaginatedCarouselsResult> {
    const where: Prisma.CarouselWhereInput = {
      ...(params.status !== undefined && { status: params.status }),
      ...(params.search && { title: { contains: params.search, mode: 'insensitive' } }),
    };
    const orderBy: Prisma.CarouselOrderByWithRelationInput[] = [
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
   * Rewrite the complete ordering of the carousel list and return the refreshed admin
   * list, read inside the same transaction (TASK-428; one global list since TASK-660).
   *
   * Throws the domain errors of `common/reorder/reorder.errors.ts`; the service maps them.
   */
  reorder(orderedIds: readonly string[]): Promise<PaginatedCarouselsResult> {
    return reorderBucket<PaginatedCarouselsResult>(this.prisma, {
      resource: LOCK_RESOURCE,
      bucket: null,
      orderedIds,
      snapshot: (tx) => tx.carousel.findMany({ select: { id: true, sortOrder: true } }),
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
   * Find several carousels by ID regardless of status — used to validate the carousels a
   * homepage block points at in one round-trip (TASK-661). Order is not guaranteed.
   */
  findByIds(ids: readonly string[]): Promise<Carousel[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.carousel.findMany({ where: { id: { in: [...ids] } } });
  }

  /**
   * Create a new carousel, APPENDED to the end of the list (`sortOrder = max + 1`, `0` for
   * the first carousel) — TASK-428.
   *
   * The old `data.sortOrder ?? 0` default put every new carousel ON TOP OF the first one
   * the moment the admin form stopped sending a hand-typed number (which the reorder UI
   * removes): the whole list would sit at slot 0 and its order would be DB-arbitrary.
   * Same shape as `BannerRepository.create` — the `max + 1` read runs INSIDE a transaction
   * holding the list's advisory lock, so it cannot race a concurrent append or a
   * concurrent `reorder` and hand out a duplicate slot.
   *
   * An EXPLICIT `data.sortOrder` still wins — the append is only the default.
   */
  create(data: CreateCarouselInput): Promise<Carousel> {
    return this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLocks(tx, [LIST_LOCK_KEY]);

      const sortOrder = data.sortOrder ?? (await this.nextSortOrder(tx));

      return tx.carousel.create({
        data: {
          title: data.title,
          source: data.source,
          categoryId: data.categoryId ?? null,
          itemLimit: data.itemLimit ?? 12,
          sortOrder,
          status: data.status,
          publishedAt: data.publishedAt,
          scheduledAt: data.scheduledAt,
        },
      });
    });
  }

  /** The append slot of the list: `max(sortOrder) + 1`, or 0 when it is empty. */
  private async nextSortOrder(tx: ReorderTx): Promise<number> {
    const { _max } = await tx.carousel.aggregate({
      _max: { sortOrder: true },
    });
    return _max.sortOrder === null ? 0 : _max.sortOrder + 1;
  }

  /**
   * Update a carousel's fields IN PLACE. Only provided fields are written.
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
   * tombstone. `CarouselItem` rows and homepage tabs cascade; a homepage CAROUSEL
   * block pointing at it survives with `carouselId = null` (SetNull — the admin
   * flags it as orphaned, TASK-660).
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
