import { Injectable } from '@nestjs/common';
import { Carousel, CarouselSource, Prisma, PublishStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import type { PublishablePort, RevalidateTarget } from '../publishing';

/**
 * Filter params for the admin carousel list (all statuses).
 */
export interface FindAllAdminParams {
  status?: PublishStatus;
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

  /** Cache target purged when scheduled carousels go live (see PublishingScheduler). */
  readonly revalidateTarget: RevalidateTarget = {
    tags: ['carousels'],
    paths: ['/'],
  };

  /**
   * Find all PUBLISHED carousels ordered by sortOrder then createdAt ascending.
   * `status = PUBLISHED` is the single public-visibility gate.
   */
  findAllPublished(): Promise<Carousel[]> {
    return this.prisma.carousel.findMany({
      where: { status: PublishStatus.PUBLISHED },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Find all carousels (any status) with an optional status filter. Admin listing.
   */
  findAllAdmin(params: FindAllAdminParams = {}): Promise<Carousel[]> {
    const where: Prisma.CarouselWhereInput = {
      ...(params.status !== undefined && { status: params.status }),
    };

    return this.prisma.carousel.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Find a carousel by ID regardless of status (admin use).
   */
  findById(id: string): Promise<Carousel | null> {
    return this.prisma.carousel.findUnique({ where: { id } });
  }

  /**
   * Create a new carousel.
   */
  create(data: CreateCarouselInput): Promise<Carousel> {
    return this.prisma.carousel.create({
      data: {
        title: data.title,
        source: data.source,
        categoryId: data.categoryId ?? null,
        itemLimit: data.itemLimit ?? 12,
        sortOrder: data.sortOrder ?? 0,
        status: data.status,
        publishedAt: data.publishedAt,
        scheduledAt: data.scheduledAt,
      },
    });
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
