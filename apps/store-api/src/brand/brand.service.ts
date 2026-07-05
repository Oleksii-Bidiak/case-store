import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import {
  BrandRepository,
  CreateBrandInput,
  UpdateBrandInput,
  FindAllAdminParams,
} from './brand.repository';
import { BrandEntity } from './entities';
import { CreateBrandDto, UpdateBrandDto, BrandListQueryDto } from './dto';
import { generateSlug } from '../common/utils';

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
  constructor(private readonly brandRepository: BrandRepository) {}

  /**
   * List all active brands (public storefront filter + strip). No pagination.
   */
  async findAllActive(): Promise<BrandListResponse> {
    const brands = await this.brandRepository.findAllActive();
    return { data: brands.map((brand) => BrandEntity.fromPrisma(brand)) };
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
    return BrandEntity.fromPrisma(updated);
  }
}
