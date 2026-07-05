import { Injectable } from '@nestjs/common';
import { Brand, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Parameters for the paginated admin brand list.
 */
export interface FindAllAdminParams {
  page: number;
  limit: number;
  isActive?: boolean;
  search?: string;
}

/**
 * Allowed fields for creating a brand. Slug is resolved by the service (auto-
 * generated from name when absent) before it reaches the repository.
 */
export interface CreateBrandInput {
  name: string;
  slug?: string;
  logo?: string | null;
  isActive?: boolean;
}

/**
 * Allowed fields for updating a brand. Only provided fields are written.
 */
export interface UpdateBrandInput {
  name?: string;
  slug?: string;
  logo?: string | null;
  isActive?: boolean;
}

/**
 * Result of a paginated admin brand query.
 */
export interface PaginatedBrandsResult {
  brands: Brand[];
  total: number;
}

/**
 * Repository encapsulating all Prisma access for the Brand model (TASK-189).
 * Services depend on this class — never on PrismaClient directly.
 */
@Injectable()
export class BrandRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a brand by ID. Returns the brand record or null if not found.
   */
  findById(id: string): Promise<Brand | null> {
    return this.prisma.brand.findUnique({ where: { id } });
  }

  /**
   * Find a brand by slug. Returns the brand record or null if not found.
   */
  findBySlug(slug: string): Promise<Brand | null> {
    return this.prisma.brand.findUnique({ where: { slug } });
  }

  /**
   * List all active brands, ordered by name. Backs the public storefront filter
   * dropdown and the "Популярні бренди" strip — no pagination needed at the
   * expected brand-count scale (dozens).
   */
  findAllActive(): Promise<Brand[]> {
    return this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Paginated admin listing (all statuses) with optional active-status filter
   * and name search. Ordered by name ascending for a stable admin table.
   */
  async findAllAdmin(params: FindAllAdminParams): Promise<PaginatedBrandsResult> {
    const { page, limit, isActive, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.BrandWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [brands, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.brand.count({ where }),
    ]);

    return { brands, total };
  }

  /**
   * Create a new brand. Slug is required here — the service generates it from
   * `name` when the client omits it.
   */
  create(data: CreateBrandInput & { slug: string }): Promise<Brand> {
    return this.prisma.brand.create({
      data: {
        name: data.name,
        slug: data.slug,
        logo: data.logo ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Update a brand's fields. Only provided fields are written.
   */
  update(id: string, data: UpdateBrandInput): Promise<Brand> {
    return this.prisma.brand.update({
      where: { id },
      data,
    });
  }

  /**
   * Toggle a brand's active status (reversible visibility flag).
   */
  setActive(id: string, isActive: boolean): Promise<Brand> {
    return this.prisma.brand.update({
      where: { id },
      data: { isActive },
    });
  }
}
