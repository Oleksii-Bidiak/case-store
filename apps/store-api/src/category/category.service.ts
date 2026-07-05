import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
  FindRootParams,
  FindAllParams,
} from './category.repository';
import { CategoryEntity, CategoryTreeNodeEntity, CategoryWithCountEntity } from './entities';
import { CategoryListQueryDto } from './dto';
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
 * Paginated response envelope for category lists.
 */
interface PaginatedCategoriesResponse {
  data: CategoryEntity[];
  meta: PaginationMeta;
}

/**
 * Paginated response envelope for categories with product counts.
 */
interface PaginatedCategoriesWithCountResponse {
  data: CategoryWithCountEntity[];
  meta: PaginationMeta;
}

/**
 * Category tree response for navigation.
 */
interface CategoryTreeResponse {
  data: CategoryTreeNodeEntity[];
}

/**
 * Category detail response with product count.
 */
interface CategoryWithCountResponse {
  data: CategoryWithCountEntity;
  productCount: number;
}

@Injectable()
export class CategoryService {
  constructor(private readonly categoryRepository: CategoryRepository) {}

  /**
   * Get a paginated list of root categories (parentId = null).
   * Public endpoint — used for storefront category browsing.
   */
  async getRootCategories(query: CategoryListQueryDto): Promise<PaginatedCategoriesResponse> {
    const params: FindRootParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      isActive: query.isActive,
      sortBy: query.sortBy ?? 'sortOrder',
      sortOrder: query.sortOrder ?? 'asc',
    };

    const { categories, total } = await this.categoryRepository.findRootCategories(params);
    const totalPages = Math.ceil(total / params.limit);

    return {
      data: categories.map((category) => CategoryEntity.fromPrisma(category)),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
      },
    };
  }

  /**
   * Get the full category tree for navigation.
   * Public endpoint — returns nested categories for menus/breadcrumbs.
   */
  async getCategoryTree(): Promise<CategoryTreeResponse> {
    const tree = await this.categoryRepository.findCategoryTree();

    return {
      data: tree.map((node) => CategoryTreeNodeEntity.fromPrisma(node)),
    };
  }

  /**
   * Get the FULL category tree for admin tooling (TASK-236) — all `isActive`
   * states, still capped at 3 levels. Used by the admin product form so staff
   * can assign a product to a leaf category (including temporarily deactivated
   * ones). Reuses {@link CategoryTreeNodeEntity}.
   */
  async getCategoryTreeForAdmin(): Promise<CategoryTreeResponse> {
    const tree = await this.categoryRepository.findCategoryTreeForAdmin();

    return {
      data: tree.map((node) => CategoryTreeNodeEntity.fromPrisma(node)),
    };
  }

  /**
   * Get a category by slug with its product count.
   * Public endpoint — used for category detail pages.
   * Throws NotFoundException if the category is not found.
   */
  async findBySlug(slug: string): Promise<CategoryWithCountResponse> {
    const category = await this.categoryRepository.findBySlug(slug);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const result = await this.categoryRepository.findWithProductCount(category.id);

    if (!result) {
      throw new NotFoundException('Category not found');
    }

    return {
      data: CategoryWithCountEntity.fromPrisma(result.category, result.productCount),
      productCount: result.productCount,
    };
  }

  /**
   * Get a category by ID (admin-only).
   * Throws NotFoundException if the category is not found.
   */
  async findById(id: string): Promise<CategoryEntity> {
    const category = await this.categoryRepository.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return CategoryEntity.fromPrisma(category);
  }

  /**
   * Create a new category (admin-only).
   * Validates slug uniqueness and parent existence before creating.
   * Auto-generates slug from name if not provided.
   * Throws ConflictException if slug is already taken.
   * Throws NotFoundException if parentId does not exist.
   */
  async create(input: CreateCategoryInput): Promise<CategoryEntity> {
    // Auto-generate slug from name if not provided
    const slug = input.slug ?? generateSlug(input.name);

    // Check slug uniqueness
    const existingBySlug = await this.categoryRepository.findBySlug(slug);
    if (existingBySlug) {
      throw new ConflictException('A category with this slug already exists');
    }

    // Validate parent category exists if parentId is provided
    if (input.parentId) {
      const parent = await this.categoryRepository.findById(input.parentId);
      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }
    }

    const category = await this.categoryRepository.create({
      ...input,
      slug,
    });

    return CategoryEntity.fromPrisma(category);
  }

  /**
   * Update a category (admin-only).
   * Validates slug uniqueness if it is being changed.
   * Validates parent existence if parentId is being changed.
   * Detects circular references if parentId is being changed.
   * Throws NotFoundException if the category is not found.
   * Throws ConflictException if the new slug is already taken.
   * Throws BadRequestException if setting parent to a descendant (cycle).
   */
  async update(id: string, input: UpdateCategoryInput): Promise<CategoryEntity> {
    // Verify the category exists
    const category = await this.categoryRepository.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // If slug is being changed, check uniqueness
    if (input.slug !== undefined && input.slug !== category.slug) {
      const existingBySlug = await this.categoryRepository.findBySlug(input.slug);
      if (existingBySlug && existingBySlug.id !== id) {
        throw new ConflictException('A category with this slug already exists');
      }
    }

    // If parentId is being changed, validate the new parent
    if (input.parentId !== undefined && input.parentId !== category.parentId) {
      // Setting to null (making it a root category) is always valid
      if (input.parentId !== null) {
        // Validate parent exists
        const parent = await this.categoryRepository.findById(input.parentId);
        if (!parent) {
          throw new NotFoundException('Parent category not found');
        }

        // Detect cycles: cannot set parent to one of our own descendants
        const descendantIds = await this.categoryRepository.findDescendantIds(id);
        if (descendantIds.includes(input.parentId)) {
          throw new BadRequestException(
            'Cannot set parent to a descendant category (circular reference)',
          );
        }
      }
    }

    const updatedCategory = await this.categoryRepository.update(id, input);

    return CategoryEntity.fromPrisma(updatedCategory);
  }

  /**
   * Deactivate a category by setting isActive = false (admin-only).
   * Throws NotFoundException if the category is not found.
   */
  async deactivate(id: string): Promise<CategoryEntity> {
    const category = await this.categoryRepository.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const deactivatedCategory = await this.categoryRepository.deactivate(id);

    return CategoryEntity.fromPrisma(deactivatedCategory);
  }

  /**
   * Activate a category by setting isActive = true (admin-only).
   * Throws NotFoundException if the category is not found.
   */
  async activate(id: string): Promise<CategoryEntity> {
    const category = await this.categoryRepository.findById(id);

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const activatedCategory = await this.categoryRepository.activate(id);

    return CategoryEntity.fromPrisma(activatedCategory);
  }

  /**
   * Get all categories with their product counts (admin-only).
   * Supports pagination and filtering.
   */
  async findAllWithProductCount(
    query: CategoryListQueryDto,
  ): Promise<PaginatedCategoriesWithCountResponse> {
    const params: FindAllParams = {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      isActive: query.isActive,
      parentId: query.parentId,
      search: query.search,
      sortBy: query.sortBy ?? 'sortOrder',
      sortOrder: query.sortOrder ?? 'asc',
    };

    const { categories, total } = await this.categoryRepository.findAllWithProductCount(params);
    const totalPages = Math.ceil(total / params.limit);

    return {
      data: categories.map((item) =>
        CategoryWithCountEntity.fromPrisma(item.category, item.productCount),
      ),
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
      },
    };
  }
}
