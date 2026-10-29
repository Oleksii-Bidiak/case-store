import { Injectable, NotFoundException } from '@nestjs/common';
import { Carousel, CarouselSource, PublishStatus } from '@prisma/client';
import {
  CarouselRepository,
  CreateCarouselInput,
  UpdateCarouselInput,
  FindAllAdminParams,
} from './carousels.repository';
import { CarouselEntity, CarouselItemEntity, PublicCarouselEntity } from './entities';
import {
  CreateCarouselDto,
  UpdateCarouselDto,
  AdminCarouselListQueryDto,
  SetCarouselItemsDto,
  ReorderCarouselsDto,
} from './dto';
import { ProductListQueryDto, ProductService, PublicProductEntity } from '../product';
import { CategoryRepository } from '../category';
import { RevalidationNotifier, resolvePublishState, type RevalidateTarget } from '../publishing';
import { reorderErrorToHttp } from '../common/reorder';
import type { Paginated, PaginationMeta } from '../common/pagination';
import { mapWithConcurrency } from '../common/utils';

/**
 * How many carousels `resolvePublic` resolves at once (TASK-1894). Each resolution is a
 * catalog query on the shared Prisma pool; four keeps a cold homepage fast without
 * letting one page render take the pool over.
 */
export const RESOLVE_CONCURRENCY = 4;

/**
 * The admin carousel list is a `Paginated` page even for an unpaginated read: the
 * admin panel needs an honest row count, and a list whose shape changed with the
 * query would force the client to branch on it.
 */
@Injectable()
export class CarouselService {
  /**
   * Homepage cache target purged after any admin write that changes visibility.
   * `home-blocks` too (TASK-660): the homepage reads carousels through its blocks, so a
   * carousel change alters the `/api/home-blocks` payload the storefront caches.
   */
  private readonly revalidateTarget: RevalidateTarget = {
    tags: ['carousels', 'home-blocks'],
    paths: ['/'],
  };

  constructor(
    private readonly carouselRepository: CarouselRepository,
    private readonly productService: ProductService,
    private readonly categoryRepository: CategoryRepository,
    private readonly revalidation: RevalidationNotifier,
  ) {}

  /**
   * List published carousels (public storefront) with their RESOLVED product
   * lists. Carousels whose resolution comes back empty are INCLUDED (honest
   * "what's published" list — the storefront hides empty sections client-side,
   * §Empty-carousel behavior, plan 154). Since TASK-660 the homepage does not read
   * this list: it shows the carousels its blocks point at (`GET /api/home-blocks`).
   */
  async findAllPublished(): Promise<PublicCarouselEntity[]> {
    const carousels = await this.carouselRepository.findAllPublished();
    return this.resolvePublic(carousels);
  }

  /**
   * Resolve already-loaded carousel rows into public carousels with their product lists,
   * in the order given (TASK-661). The homepage-block read loads the carousels together
   * with the blocks in one query and hands them here, so the product resolution stays in
   * ONE place — bestseller ranking, the on-sale definition and the category-subtree
   * rollup cannot drift between `/api/carousels` and `/api/home-blocks`.
   *
   * Status is NOT checked here: the caller decides what may be shown (a signed preview
   * resolves draft carousels too). Each distinct carousel id is resolved once, so a
   * carousel that two blocks point at costs one resolution, not two.
   *
   * The distinct carousels resolve in parallel, at most {@link RESOLVE_CONCURRENCY} at a
   * time (TASK-1894): on a cold cache a homepage of N carousels used to pay N catalog
   * queries back to back, while an unbounded fan-out would take N pool connections at
   * once. The result keeps the INPUT order whatever finishes first.
   */
  async resolvePublic(carousels: readonly Carousel[]): Promise<PublicCarouselEntity[]> {
    const distinct = new Map<string, Carousel>();
    for (const carousel of carousels) {
      if (!distinct.has(carousel.id)) distinct.set(carousel.id, carousel);
    }

    const productLists = await mapWithConcurrency(
      [...distinct.values()],
      RESOLVE_CONCURRENCY,
      (carousel) => this.resolveProducts(carousel),
    );
    const resolved = new Map<string, PublicProductEntity[]>();
    [...distinct.keys()].forEach((id, index) => resolved.set(id, productLists[index]));

    return carousels.map((carousel) =>
      PublicCarouselEntity.fromEntity(carousel, resolved.get(carousel.id) ?? []),
    );
  }

  /**
   * Find several carousels by id regardless of status — the homepage-block service
   * validates the carousels a block points at with this (TASK-661). Order not guaranteed.
   */
  async findByIds(ids: readonly string[]): Promise<CarouselEntity[]> {
    const rows = await this.carouselRepository.findByIds(ids);
    return rows.map((row) => CarouselEntity.fromPrisma(row));
  }

  /**
   * List all carousels including drafts (admin), optionally filtered by
   * status, searched by title and paginated. Omitting `page`/`limit` returns the
   * complete list (TASK-357).
   */
  async findAllAdmin(query: AdminCarouselListQueryDto): Promise<Paginated<CarouselEntity>> {
    const params: FindAllAdminParams = {
      status: query.status,
      page: query.page,
      limit: query.limit,
      search: query.search,
    };
    const { carousels, total } = await this.carouselRepository.findAllAdmin(params);

    return {
      items: carousels.map((carousel) => CarouselEntity.fromPrisma(carousel)),
      meta: this.buildMeta(total, query.page, query.limit),
    };
  }

  /**
   * Get a carousel by ID (admin). Throws NotFoundException when not found.
   */
  async findByIdAdmin(id: string): Promise<CarouselEntity> {
    const carousel = await this.carouselRepository.findById(id);

    if (!carousel) {
      throw new NotFoundException('Carousel not found');
    }

    return CarouselEntity.fromPrisma(carousel);
  }

  /**
   * Create a carousel (admin). Verifies the target category exists when
   * `source = CATEGORY`, resolves publish state, and revalidates the homepage
   * when the new carousel is live. A non-CATEGORY source stores no categoryId.
   */
  async create(dto: CreateCarouselDto): Promise<CarouselEntity> {
    const categoryId = await this.resolveCategoryId(dto.source, dto.categoryId);

    const publishState = resolvePublishState(
      {
        status: dto.status ?? PublishStatus.DRAFT,
        scheduledAt: this.parseScheduledAt(dto.scheduledAt),
      },
      new Date(),
    );

    const input: CreateCarouselInput = {
      title: dto.title,
      source: dto.source,
      categoryId,
      itemLimit: dto.itemLimit,
      sortOrder: dto.sortOrder,
      status: publishState.status,
      publishedAt: publishState.publishedAt,
      scheduledAt: publishState.scheduledAt,
    };

    const carousel = await this.carouselRepository.create(input);
    const entity = CarouselEntity.fromPrisma(carousel);
    if (entity.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }
    return entity;
  }

  /**
   * Update a carousel (admin). Only provided fields are written; publish fields
   * are resolved only when `status` is supplied. When the EFFECTIVE source is
   * CATEGORY the effective categoryId (incoming or existing) must resolve to a
   * real category. Revalidates the homepage whenever public visibility could
   * have changed.
   */
  async update(id: string, dto: UpdateCarouselDto): Promise<CarouselEntity> {
    const carousel = await this.carouselRepository.findById(id);
    if (!carousel) {
      throw new NotFoundException('Carousel not found');
    }

    const wasPublished = carousel.status === PublishStatus.PUBLISHED;

    const input: UpdateCarouselInput = {
      title: dto.title,
      source: dto.source,
      itemLimit: dto.itemLimit,
      sortOrder: dto.sortOrder,
    };

    // Category handling: validate against the EFFECTIVE source (incoming or
    // existing). Switching away from CATEGORY clears the stored categoryId.
    const effectiveSource = dto.source ?? carousel.source;
    if (effectiveSource === CarouselSource.CATEGORY) {
      const effectiveCategoryId = dto.categoryId ?? carousel.categoryId ?? undefined;
      input.categoryId = await this.resolveCategoryId(effectiveSource, effectiveCategoryId);
    } else if (dto.source !== undefined || dto.categoryId !== undefined) {
      input.categoryId = null;
    }

    // Only touch publish fields when the admin actually sent a `status`.
    if (dto.status !== undefined) {
      const resolved = resolvePublishState(
        { status: dto.status, scheduledAt: this.parseScheduledAt(dto.scheduledAt) },
        new Date(),
      );
      input.status = resolved.status;
      input.scheduledAt = resolved.scheduledAt;
      // Preserve the ORIGINAL publish time when the carousel was already live
      // and stays live — re-saving a published carousel must not reset publishedAt.
      input.publishedAt =
        resolved.status === PublishStatus.PUBLISHED && wasPublished && carousel.publishedAt
          ? carousel.publishedAt
          : resolved.publishedAt;
    }

    const updated = await this.carouselRepository.update(id, input);
    const entity = CarouselEntity.fromPrisma(updated);
    // Revalidate whenever public visibility could have changed: the carousel is
    // live now, or it was live before (e.g. just unpublished or edited in place).
    if (wasPublished || entity.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }
    return entity;
  }

  /**
   * Publish a carousel (status = PUBLISHED). Throws NotFoundException when missing.
   */
  async publish(id: string): Promise<CarouselEntity> {
    await this.ensureExists(id);
    const carousel = await this.carouselRepository.publish(id);
    const entity = CarouselEntity.fromPrisma(carousel);
    await this.notifyRevalidation();
    return entity;
  }

  /**
   * Unpublish a carousel (status = DRAFT). Throws NotFoundException when missing.
   */
  async unpublish(id: string): Promise<CarouselEntity> {
    await this.ensureExists(id);
    const carousel = await this.carouselRepository.unpublish(id);
    const entity = CarouselEntity.fromPrisma(carousel);
    // Purge the now-stale published copy from the storefront cache.
    await this.notifyRevalidation();
    return entity;
  }

  /**
   * Hard-delete a carousel (admin). Item rows cascade in the database.
   * Revalidates the homepage when a live carousel is removed.
   */
  async delete(id: string): Promise<void> {
    const carousel = await this.carouselRepository.findById(id);
    if (!carousel) {
      throw new NotFoundException('Carousel not found');
    }
    await this.carouselRepository.delete(id);
    if (carousel.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }
  }

  /**
   * Reorder the carousel list (admin, TASK-428 — one global list since TASK-660) and
   * return the refreshed admin list so the panel resyncs in a single round-trip, exactly
   * as the banner reorder does. This order is the ADMIN list's only: the homepage order
   * belongs to the homepage blocks.
   *
   * The repository's domain errors are mapped to HTTP here, so the wire body carries the
   * stable `error` code the admin panel keys its UA announcements off.
   */
  async reorder(dto: ReorderCarouselsDto): Promise<Paginated<CarouselEntity>> {
    let carousels;
    let total;
    try {
      ({ carousels, total } = await this.carouselRepository.reorder(dto.orderedIds));
    } catch (error) {
      throw reorderErrorToHttp(error);
    }

    // NO storefront revalidation (TASK-660): the homepage order is the homepage blocks'
    // (`/api/home-blocks`), not this list's, and nothing on the storefront reads
    // `/api/carousels` any more (TASK-1895). Purging `home-blocks` / `carousels` / `/`
    // here would only re-render a homepage that cannot have changed.

    // Shape parity with `findAllAdmin` is load-bearing: the admin panel writes this
    // response straight into the list query's cache (`useReorderLifecycle` →
    // `setQueryData`), and a response missing `meta` would blank the row counter the
    // moment someone drags a row.
    return {
      items: carousels.map((carousel) => CarouselEntity.fromPrisma(carousel)),
      meta: this.buildMeta(total),
    };
  }

  /**
   * Admin read of a carousel's hand-picked items with joined product summaries.
   * Throws NotFoundException when the carousel is missing.
   */
  async getItems(id: string): Promise<CarouselItemEntity[]> {
    await this.ensureExists(id);
    const rows = await this.carouselRepository.findItemsWithProducts(id);
    return rows.map((row) => CarouselItemEntity.fromRepository(row));
  }

  /**
   * Full-replace a carousel's hand-picked item set (admin). Deliberately does
   * NOT require `source = MANUAL`: item rows on a non-MANUAL carousel are inert
   * (never read by the resolver) until an admin switches the source, letting a
   * manual list be staged before flipping the switch. Revalidates the homepage
   * only when the carousel is currently PUBLISHED (a DRAFT write changes
   * nothing public). Returns the fresh item list.
   */
  async setItems(id: string, dto: SetCarouselItemsDto): Promise<CarouselItemEntity[]> {
    const carousel = await this.carouselRepository.findById(id);
    if (!carousel) {
      throw new NotFoundException('Carousel not found');
    }

    await this.carouselRepository.replaceItems(
      id,
      dto.items.map((item) => ({ productId: item.productId, sortOrder: item.sortOrder })),
    );

    if (carousel.status === PublishStatus.PUBLISHED) {
      await this.notifyRevalidation();
    }

    const rows = await this.carouselRepository.findItemsWithProducts(id);
    return rows.map((row) => CarouselItemEntity.fromRepository(row));
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

  /**
   * Turn one carousel row into an ordered public product list — entirely by
   * delegating to ProductService, so bestseller ranking, the on-sale
   * definition, and category-subtree rollup stay in lock-step with the public
   * catalog (§Source resolution semantics, plan 154).
   */
  private async resolveProducts(carousel: Carousel): Promise<PublicProductEntity[]> {
    switch (carousel.source) {
      case CarouselSource.BESTSELLING:
        return this.listFromCatalog(carousel, { sortBy: 'bestselling' });
      case CarouselSource.NEWEST:
        return this.listFromCatalog(carousel, {});
      case CarouselSource.ON_SALE:
        return this.listFromCatalog(carousel, { onSale: true });
      case CarouselSource.CATEGORY: {
        // Defensive: the DTO requires a categoryId for CATEGORY, but the FK is
        // SetNull — the category can disappear after the fact. Resolve to [].
        if (!carousel.categoryId) {
          return [];
        }
        return this.listFromCatalog(carousel, { categoryId: carousel.categoryId });
      }
      case CarouselSource.MANUAL: {
        const items = await this.carouselRepository.findItemIds(carousel.id);
        if (items.length === 0) {
          return [];
        }
        // Rows arrive ordered by sortOrder ASC; getCardsByIds preserves request
        // order and silently drops unknown/deactivated/deleted ids.
        return this.productService.getCardsByIds(items.map((item) => item.productId));
      }
    }
  }

  /**
   * Run one rule-based source through the SAME code path as `GET /products`.
   * Built via an actual `ProductListQueryDto` instance — its defaults are class
   * field initializers that only apply when the class is instantiated, not
   * when a same-shaped object literal is passed (plan 154 §Technical Design).
   */
  private async listFromCatalog(
    carousel: Carousel,
    overrides: Partial<ProductListQueryDto>,
  ): Promise<PublicProductEntity[]> {
    const query = Object.assign(new ProductListQueryDto(), {
      isActive: true,
      page: 1,
      limit: carousel.itemLimit,
      sortBy: overrides.sortBy ?? 'createdAt',
      sortOrder: 'desc',
      ...overrides,
    });
    const { items } = await this.productService.findAll(query);
    return items;
  }

  /**
   * Normalize + verify the stored categoryId for a given source: CATEGORY
   * requires a categoryId resolving to a real category (NotFoundException
   * otherwise — a clean 404 instead of a raw Prisma FK error); any other
   * source stores null.
   */
  private async resolveCategoryId(
    source: CarouselSource,
    categoryId: string | undefined,
  ): Promise<string | null> {
    if (source !== CarouselSource.CATEGORY) {
      return null;
    }
    if (!categoryId) {
      throw new NotFoundException('Category not found');
    }
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return categoryId;
  }

  private async ensureExists(id: string): Promise<void> {
    const carousel = await this.carouselRepository.findById(id);
    if (!carousel) {
      throw new NotFoundException('Carousel not found');
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
