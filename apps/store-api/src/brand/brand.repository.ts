import { Injectable } from '@nestjs/common';
import { Brand, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { PUBLIC_PRODUCT_WHERE } from '../product/product-visibility';

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
  brands: BrandWithProductCount[];
  total: number;
}

/**
 * One admin-list row: the brand plus how many LIVE products carry it (TASK-840).
 */
export interface BrandWithProductCount {
  brand: Brand;
  productCount: number;
}

/**
 * Which products the admin brand list counts (TASK-840): every product that is not
 * soft-deleted, visible or hidden.
 *
 * Deliberately NOT the active-only count the admin category tree shows
 * (`category.repository.ts`, `findCategoryTreeForAdmin`). The question this column
 * answers for a brand is «is it in use?» — before renaming, hiding or cleaning up a
 * brand — and a hidden product still carries its brand. It matters in practice: a
 * catalogue import files every new position as a HIDDEN draft (TASK-361), so right
 * after an import an active-only count would read 0 for brands that own dozens of
 * products. Tombstones are excluded: a deleted product no longer belongs to anyone.
 */
export const BRAND_COUNTED_PRODUCT_WHERE: Prisma.ProductWhereInput = { deletedAt: null };

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
   *
   * With `categoryIds` (TASK-414) the list is narrowed to brands that actually
   * have something on sale in that category subtree. The nested `products.some`
   * mirrors the PUBLIC listing's own visibility rules — active, not
   * soft-deleted, and in the requested categories — so the dropdown can never
   * offer a brand that filters the grid to nothing. The caller expands the
   * subtree (`CategoryRepository.findSubtreeIds`); this repository does not own
   * that cross-entity rule, exactly as `ProductRepository.findAll` does not.
   *
   * The fourth rule — `category: { isActive: true }` — is NOT redundant with
   * the subtree filter, which is the trap this mirror fell into first. Asking
   * for a PARENT category expands to every descendant regardless of its own
   * `isActive` (`CategoryRepository.findSubtreeIds` has no such predicate), so a
   * brand stocked only inside a deactivated child was offered in the parent's
   * dropdown and then filtered the grid to nothing — the listing drops those
   * products through its own `categoryActiveOnly`.
   */
  findAllActive(categoryIds?: string[]): Promise<Brand[]> {
    const where: Prisma.BrandWhereInput = { isActive: true };

    if (categoryIds !== undefined) {
      where.products = {
        some: { ...PUBLIC_PRODUCT_WHERE, categoryId: { in: categoryIds } },
      };
    }

    return this.prisma.brand.findMany({ where, orderBy: { name: 'asc' } });
  }

  /**
   * Paginated admin listing (all statuses) with optional active-status filter
   * and name search. Ordered by name ascending for a stable admin table. Each row
   * carries its live product count (TASK-840, see {@link BRAND_COUNTED_PRODUCT_WHERE})
   * — one grouped `_count` in the same query, not a request per brand.
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

    const [rows, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { products: { where: BRAND_COUNTED_PRODUCT_WHERE } } },
        },
      }),
      this.prisma.brand.count({ where }),
    ]);

    const brands = rows.map(({ _count, ...brand }) => ({
      brand: brand as Brand,
      productCount: _count.products,
    }));
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
