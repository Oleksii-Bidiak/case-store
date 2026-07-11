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
} from './dto';
import { ProductService } from '../product/product.service';
import { ProductListQueryDto } from '../product/dto';
import { PublicProductEntity } from '../product/entities';
import { CategoryRepository } from '../category';
import { RevalidationNotifier, resolvePublishState, type RevalidateTarget } from '../publishing';

/**
 * Response envelope for an admin carousel list.
 */
interface CarouselListResponse {
  data: CarouselEntity[];
}

/**
 * Response envelope for the public carousel list (published + resolved products).
 */
interface PublicCarouselListResponse {
  data: PublicCarouselEntity[];
}

@Injectable()
export class CarouselService {
  /** Homepage cache target purged after any admin write that changes visibility. */
  private readonly revalidateTarget: RevalidateTarget = {
    tags: ['carousels'],
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
   * §Empty-carousel behavior, plan 154).
   */
  async findAllPublished(): Promise<PublicCarouselListResponse> {
    const carousels = await this.carouselRepository.findAllPublished();

    const data: PublicCarouselEntity[] = [];
    for (const carousel of carousels) {
      const products = await this.resolveProducts(carousel);
      data.push(PublicCarouselEntity.fromEntity(carousel, products));
    }

    return { data };
  }

  /**
   * List all carousels including drafts (admin), optionally filtered by status.
   */
  async findAllAdmin(query: AdminCarouselListQueryDto): Promise<CarouselListResponse> {
    const params: FindAllAdminParams = { status: query.status };
    const carousels = await this.carouselRepository.findAllAdmin(params);

    return { data: carousels.map((carousel) => CarouselEntity.fromPrisma(carousel)) };
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
        const { data } = await this.productService.getCardsByIds(
          items.map((item) => item.productId),
        );
        return data;
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
    const { data } = await this.productService.findAll(query);
    return data;
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
