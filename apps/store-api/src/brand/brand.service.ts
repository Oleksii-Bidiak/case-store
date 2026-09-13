import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BrandRepository,
  CreateBrandInput,
  UpdateBrandInput,
  FindAllAdminParams,
} from './brand.repository';
import { BrandEntity } from './entities';
import { CreateBrandDto, UpdateBrandDto, BrandListQueryDto } from './dto';
import { generateSlug } from '../common/utils';
import { CategoryRepository } from '../category/category.repository';
import { CacheService } from '../cache';
// Direct file import: the `../cache` barrel is outside this change's file scope.
import { BRAND_LIST_PREFIX, brandListCategoryKey } from '../cache/cache-key.util';

/** Fallback TTL (seconds) when REDIS_CACHE_TTL_SECONDS is not configured. */
const DEFAULT_CACHE_TTL_SECONDS = 300;

/**
 * Pagination metadata returned alongside paginated results.
 */
interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Response envelope for a plain brand list (public).
 */
interface BrandListResponse {
  data: BrandEntity[];
}

/**
 * Paginated response envelope for the admin brand list.
 */
interface PaginatedBrandsResponse {
  data: BrandEntity[];
  meta: PaginationMeta;
}

/**
 * Business logic for brands (TASK-189). Thin over the repository: slug
 * auto-generation + uniqueness validation on write, existence checks on
 * mutation. Never touches PrismaClient directly.
 */
@Injectable()
export class BrandService {
  private readonly cacheTtlSeconds: number;

  constructor(
    private readonly brandRepository: BrandRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {
    this.cacheTtlSeconds =
      this.config.get<number>('REDIS_CACHE_TTL_SECONDS') ?? DEFAULT_CACHE_TTL_SECONDS;
  }

  /**
   * List active brands (public storefront filter + strip). No pagination.
   *
   * With `categoryId` (TASK-414) the list is narrowed to brands that have a
   * purchasable product in that category's SUBTREE — the same self+descendants
   * rollup the product listing uses (TASK-236), so the filter dropdown and the
   * grid it filters always agree. An unknown category id resolves to a subtree
   * of just itself and therefore returns an empty list, which is the honest
   * answer rather than a silent fallback to "every brand".
   *
   * Cache-aside, keyed per category. Two sides invalidate it, because the list
   * is derived from BOTH: `ProductService` on every catalogue write (filing a
   * product under a brand changes which brands a category offers), and every
   * brand mutation below (the query also reads `brand.isActive` and
   * `brand.name`, which only these mutations touch).
   */
  async findAllActive(categoryId?: string): Promise<BrandListResponse> {
    const cacheKey = brandListCategoryKey(categoryId);
    const cached = await this.cache.get<BrandListResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const categoryIds = categoryId
      ? await this.categoryRepository.findSubtreeIds(categoryId)
      : undefined;
    const brands = await this.brandRepository.findAllActive(categoryIds);
    const response = { data: brands.map((brand) => BrandEntity.fromPrisma(brand)) };

    await this.cache.set(cacheKey, response, this.cacheTtlSeconds);
    return response;
  }

  /**
   * Paginated admin listing (all statuses) with optional status filter + search.
   */
  async findAllAdmin(query: BrandListQueryDto): Promise<PaginatedBrandsResponse> {
    const params: FindAllAdminParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      isActive: query.isActive,
      search: query.search,
    };

    const { brands, total } = await this.brandRepository.findAllAdmin(params);
    const totalPages = Math.ceil(total / params.limit);

    return {
      data: brands.map((brand) => BrandEntity.fromPrisma(brand)),
      meta: { total, page: params.page, limit: params.limit, totalPages },
    };
  }

  /**
   * Get a brand by ID (admin). Throws NotFoundException when not found.
   */
  async findById(id: string): Promise<BrandEntity> {
    const brand = await this.brandRepository.findById(id);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    return BrandEntity.fromPrisma(brand);
  }

  /**
   * Create a brand (admin). Auto-generates the slug from `name` when not
   * provided and rejects a duplicate slug with a 409.
   */
  async create(dto: CreateBrandDto): Promise<BrandEntity> {
    const slug = dto.slug ?? generateSlug(dto.name);

    const existingBySlug = await this.brandRepository.findBySlug(slug);
    if (existingBySlug) {
      throw new ConflictException('A brand with this slug already exists');
    }

    const input: CreateBrandInput = {
      name: dto.name,
      slug,
      logo: dto.logo,
      isActive: dto.isActive,
    };

    const brand = await this.brandRepository.create({ ...input, slug });
    await this.purgeBrandLists();
    return BrandEntity.fromPrisma(brand);
  }

  /**
   * Update a brand (admin). Validates slug uniqueness when the slug changes.
   * Throws NotFoundException when the brand is missing, ConflictException on a
   * duplicate slug.
   */
  async update(id: string, dto: UpdateBrandDto): Promise<BrandEntity> {
    const brand = await this.brandRepository.findById(id);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }

    if (dto.slug !== undefined && dto.slug !== brand.slug) {
      const existingBySlug = await this.brandRepository.findBySlug(dto.slug);
      if (existingBySlug && existingBySlug.id !== id) {
        throw new ConflictException('A brand with this slug already exists');
      }
    }

    const input: UpdateBrandInput = {
      name: dto.name,
      slug: dto.slug,
      logo: dto.logo,
      isActive: dto.isActive,
    };

    const updated = await this.brandRepository.update(id, input);
    await this.purgeBrandLists();
    return BrandEntity.fromPrisma(updated);
  }

  /**
   * Toggle a brand's active status (admin). Throws NotFoundException when the
   * brand is missing.
   */
  async setActive(id: string, isActive: boolean): Promise<BrandEntity> {
    const brand = await this.brandRepository.findById(id);
    if (!brand) {
      throw new NotFoundException('Brand not found');
    }
    const updated = await this.brandRepository.setActive(id, isActive);
    await this.purgeBrandLists();
    return BrandEntity.fromPrisma(updated);
  }

  /**
   * Drop every per-category brand-list entry.
   *
   * Wholesale rather than per-category on purpose: the cached VALUE is computed
   * over a category subtree, so one brand change can affect the entry of every
   * ancestor category. Working out which ones would cost a tree walk to save a
   * cache that refills on the next request.
   */
  private async purgeBrandLists(): Promise<void> {
    await this.cache.delByPrefix(BRAND_LIST_PREFIX);
  }
}
