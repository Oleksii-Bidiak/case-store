import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import {
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
  PaginatedCategoriesResult,
  PaginatedCategoriesWithCountResult,
} from './category.repository';
import { CategoryService } from './category.service';
import { CategoryEntity, CategoryTreeNodeEntity, CategoryWithCountEntity } from './entities';
import { CategoryListQueryDto } from './dto';

// ─── Mock data ────────────────────────────────────────────────────────────────

const mockCategory = {
  id: 'cat-uuid-1',
  name: 'Phone Cases',
  slug: 'phone-cases',
  description: 'Protective cases for all smartphone models',
  image: 'https://example.com/images/phone-cases.jpg',
  parentId: null,
  isActive: true,
  sortOrder: 0,
  metaTitle: null,
  metaDescription: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const mockChildCategory = {
  id: 'cat-uuid-2',
  name: 'iPhone Cases',
  slug: 'iphone-cases',
  description: 'Cases for iPhone models',
  image: null,
  parentId: 'cat-uuid-1',
  isActive: true,
  sortOrder: 0,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
};

const mockInactiveCategory = {
  ...mockCategory,
  id: 'cat-uuid-3',
  name: 'Discontinued Category',
  slug: 'discontinued-category',
  isActive: false,
};

// ─── CategoryRepository mock ──────────────────────────────────────────────────

const categoryRepositoryMock = {
  findById: jest.fn(),
  findBySlug: jest.fn(),
  findRootCategories: jest.fn(),
  findAll: jest.fn(),
  findCategoryTree: jest.fn(),
  findCategoryTreeForAdmin: jest.fn(),
  findWithProductCount: jest.fn(),
  findAllWithProductCount: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
  activate: jest.fn(),
  findChildren: jest.fn(),
  findDescendantIds: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: CategoryRepository,
          useValue: categoryRepositoryMock,
        },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  // ─── getRootCategories (public) ─────────────────────────────────────────────

  describe('getRootCategories', () => {
    const query: CategoryListQueryDto = {
      page: 1,
      limit: 20,
    };

    const paginatedResult: PaginatedCategoriesResult = {
      categories: [mockCategory],
      total: 1,
    };

    it('should return paginated root categories with meta', async () => {
      categoryRepositoryMock.findRootCategories.mockResolvedValue(paginatedResult);

      const result = await service.getRootCategories(query);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(CategoryEntity);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.totalPages).toBe(1);
      expect(categoryRepositoryMock.findRootCategories).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        isActive: undefined,
        sortBy: 'sortOrder',
        sortOrder: 'asc',
      });
    });

    it('should calculate totalPages correctly for multiple pages', async () => {
      categoryRepositoryMock.findRootCategories.mockResolvedValue({
        categories: [mockCategory],
        total: 42,
      });

      const result = await service.getRootCategories({ ...query, limit: 20 });

      expect(result.meta.totalPages).toBe(3); // ceil(42/20) = 3
    });

    it('should pass isActive filter to repository', async () => {
      categoryRepositoryMock.findRootCategories.mockResolvedValue(paginatedResult);

      await service.getRootCategories({ page: 1, limit: 20, isActive: true });

      expect(categoryRepositoryMock.findRootCategories).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  // ─── getCategoryTree (public) ────────────────────────────────────────────────

  describe('getCategoryTree', () => {
    it('should return a tree of CategoryTreeNodeEntity', async () => {
      const treeData = [
        {
          ...mockCategory,
          children: [
            {
              ...mockChildCategory,
              children: [],
            },
          ],
        },
      ];
      categoryRepositoryMock.findCategoryTree.mockResolvedValue(treeData as any);

      const result = await service.getCategoryTree();

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(CategoryTreeNodeEntity);
      expect(result.data[0].name).toBe('Phone Cases');
      expect(result.data[0].children).toHaveLength(1);
      expect(result.data[0].children[0]).toBeInstanceOf(CategoryTreeNodeEntity);
      expect(result.data[0].children[0].name).toBe('iPhone Cases');
      expect(categoryRepositoryMock.findCategoryTree).toHaveBeenCalled();
    });

    it('should return empty array when no categories exist', async () => {
      categoryRepositoryMock.findCategoryTree.mockResolvedValue([]);

      const result = await service.getCategoryTree();

      expect(result.data).toHaveLength(0);
    });

    // TASK-247: the admin SEO overrides must reach the public tree so the
    // storefront's resolveSeo() tier-1 (entity meta) can light up for the
    // category-filtered /products listing.
    it('surfaces metaTitle/metaDescription unchanged at both root and nested-child level', async () => {
      const treeData = [
        {
          ...mockCategory,
          metaTitle: 'Чохли — Преміум захист',
          metaDescription: 'Магазин преміальних чохлів для будь-якої моделі.',
          children: [
            {
              ...mockChildCategory,
              metaTitle: 'Чохли для iPhone | Store',
              metaDescription: 'Захисні чохли для всіх моделей iPhone.',
              children: [],
            },
          ],
        },
      ];
      categoryRepositoryMock.findCategoryTree.mockResolvedValue(treeData as any);

      const result = await service.getCategoryTree();

      expect(result.data[0].metaTitle).toBe('Чохли — Преміум захист');
      expect(result.data[0].metaDescription).toBe(
        'Магазин преміальних чохлів для будь-якої моделі.',
      );
      expect(result.data[0].children[0].metaTitle).toBe('Чохли для iPhone | Store');
      expect(result.data[0].children[0].metaDescription).toBe(
        'Захисні чохли для всіх моделей iPhone.',
      );
    });

    // TASK-277: sitemap `lastModified` for /categories/[slug] landing pages
    // reads `updatedAt` off the public tree — it must survive the entity
    // mapping unchanged at every nesting level.
    it('surfaces updatedAt unchanged at both root and nested-child level', async () => {
      const treeData = [
        {
          ...mockCategory,
          children: [
            {
              ...mockChildCategory,
              children: [],
            },
          ],
        },
      ];
      categoryRepositoryMock.findCategoryTree.mockResolvedValue(treeData as any);

      const result = await service.getCategoryTree();

      expect(result.data[0].updatedAt).toEqual(mockCategory.updatedAt);
      expect(result.data[0].children[0].updatedAt).toEqual(mockChildCategory.updatedAt);
    });

    it('maps a missing metaTitle/metaDescription to null (not undefined)', async () => {
      const treeData = [{ ...mockChildCategory, children: [] }]; // mockChildCategory omits both fields
      categoryRepositoryMock.findCategoryTree.mockResolvedValue(treeData as any);

      const result = await service.getCategoryTree();

      expect(result.data[0].metaTitle).toBeNull();
      expect(result.data[0].metaDescription).toBeNull();
    });
  });

  // ─── getCategoryTreeForAdmin (admin, TASK-236) ───────────────────────────────

  describe('getCategoryTreeForAdmin', () => {
    it('maps the full (incl. inactive) tree to CategoryTreeNodeEntity via the admin repo call', async () => {
      const treeData = [
        {
          ...mockCategory,
          children: [
            {
              ...mockInactiveCategory,
              children: [],
            },
          ],
        },
      ];
      categoryRepositoryMock.findCategoryTreeForAdmin.mockResolvedValue(treeData as any);

      const result = await service.getCategoryTreeForAdmin();

      expect(categoryRepositoryMock.findCategoryTreeForAdmin).toHaveBeenCalled();
      // Uses the admin (unfiltered) traversal, NOT the public isActive-filtered one.
      expect(categoryRepositoryMock.findCategoryTree).not.toHaveBeenCalled();
      expect(result.data[0]).toBeInstanceOf(CategoryTreeNodeEntity);
      expect(result.data[0].children[0]).toBeInstanceOf(CategoryTreeNodeEntity);
      // Inactive child is present (not filtered out).
      expect(result.data[0].children[0].isActive).toBe(false);
    });
  });

  // ─── findBySlug (public) ─────────────────────────────────────────────────────

  describe('findBySlug', () => {
    it('should return category with product count when found', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findWithProductCount.mockResolvedValue({
        category: mockCategory,
        productCount: 5,
      });

      const result = await service.findBySlug('phone-cases');

      expect(result.data).toBeInstanceOf(CategoryWithCountEntity);
      expect(result.data.name).toBe('Phone Cases');
      expect(result.productCount).toBe(5);
      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('phone-cases');
    });

    it('should throw NotFoundException when category slug is not found', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);

      await expect(service.findBySlug('nonexistent-slug')).rejects.toThrow(NotFoundException);
      expect(categoryRepositoryMock.findWithProductCount).not.toHaveBeenCalled();
    });
  });

  // ─── findById (admin) ────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return CategoryEntity when category is found', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);

      const result = await service.findById('cat-uuid-1');

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(result.id).toBe('cat-uuid-1');
      expect(result.name).toBe('Phone Cases');
      expect(categoryRepositoryMock.findById).toHaveBeenCalledWith('cat-uuid-1');
    });

    it('should throw NotFoundException when category is not found', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(categoryRepositoryMock.findById).toHaveBeenCalledWith('nonexistent-id');
    });
  });

  // ─── create (admin) ─────────────────────────────────────────────────────────

  describe('create', () => {
    const createInput: CreateCategoryInput = {
      name: 'Phone Cases',
      slug: 'phone-cases',
    };

    it('should create a category and return CategoryEntity', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue(mockCategory);

      const result = await service.create(createInput);

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(result.name).toBe('Phone Cases');
      expect(categoryRepositoryMock.create).toHaveBeenCalledWith(createInput);
    });

    it('forwards SEO meta fields (TASK-236) through to the repository', async () => {
      const inputWithMeta: CreateCategoryInput = {
        name: 'Phone Cases',
        slug: 'phone-cases',
        metaTitle: 'Phone Cases — Premium Protection',
        metaDescription: 'Shop premium protective phone cases.',
      };
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue({
        ...mockCategory,
        metaTitle: 'Phone Cases — Premium Protection',
        metaDescription: 'Shop premium protective phone cases.',
      });

      const result = await service.create(inputWithMeta);

      expect(categoryRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metaTitle: 'Phone Cases — Premium Protection',
          metaDescription: 'Shop premium protective phone cases.',
        }),
      );
      expect(result.metaTitle).toBe('Phone Cases — Premium Protection');
      expect(result.metaDescription).toBe('Shop premium protective phone cases.');
    });

    it('should auto-generate slug from name when slug is not provided', async () => {
      const inputWithoutSlug: CreateCategoryInput = {
        name: 'Phone Cases',
      };
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue({
        ...mockCategory,
        slug: 'phone-cases',
      });

      const result = await service.create(inputWithoutSlug);

      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('phone-cases');
      expect(categoryRepositoryMock.create).toHaveBeenCalled();
      expect(result).toBeInstanceOf(CategoryEntity);
    });

    it('should throw ConflictException when slug is already taken', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(mockCategory);

      await expect(service.create(createInput)).rejects.toThrow(ConflictException);
      expect(categoryRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when parentId does not exist', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.findById.mockResolvedValue(null);

      const inputWithInvalidParent: CreateCategoryInput = {
        name: 'Sub Category',
        slug: 'sub-category',
        parentId: 'nonexistent-parent-id',
      };

      await expect(service.create(inputWithInvalidParent)).rejects.toThrow(NotFoundException);
      expect(categoryRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('should create category with valid parentId', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.create.mockResolvedValue(mockChildCategory);

      const inputWithParent: CreateCategoryInput = {
        name: 'iPhone Cases',
        slug: 'iphone-cases',
        parentId: 'cat-uuid-1',
      };

      const result = await service.create(inputWithParent);

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(categoryRepositoryMock.findById).toHaveBeenCalledWith('cat-uuid-1');
      expect(categoryRepositoryMock.create).toHaveBeenCalled();
    });
  });

  // ─── update (admin) ──────────────────────────────────────────────────────────

  describe('update', () => {
    const updateInput: UpdateCategoryInput = {
      name: 'Updated Category Name',
    };

    it('should update a category and return CategoryEntity', async () => {
      const updatedCategory = {
        ...mockCategory,
        name: 'Updated Category Name',
        updatedAt: new Date('2026-05-05T12:00:00.000Z'),
      };
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.update.mockResolvedValue(updatedCategory);

      const result = await service.update('cat-uuid-1', updateInput);

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(result.name).toBe('Updated Category Name');
      expect(categoryRepositoryMock.update).toHaveBeenCalledWith('cat-uuid-1', updateInput);
    });

    it('should throw NotFoundException when category is not found', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('nonexistent-id', updateInput)).rejects.toThrow(
        NotFoundException,
      );
      expect(categoryRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when updating slug to one already taken', async () => {
      const updateWithSlug: UpdateCategoryInput = {
        slug: 'taken-slug',
      };
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findBySlug.mockResolvedValue({
        ...mockCategory,
        id: 'other-category-id',
        slug: 'taken-slug',
      });

      await expect(service.update('cat-uuid-1', updateWithSlug)).rejects.toThrow(ConflictException);
      expect(categoryRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should allow keeping the same slug without conflict', async () => {
      const updateWithSameSlug: UpdateCategoryInput = {
        slug: 'phone-cases', // same as current
      };
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findBySlug.mockResolvedValue(mockCategory); // same category
      categoryRepositoryMock.update.mockResolvedValue(mockCategory);

      const result = await service.update('cat-uuid-1', updateWithSameSlug);

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(categoryRepositoryMock.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when new parentId does not exist', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(null);

      const updateWithParent: UpdateCategoryInput = {
        parentId: 'nonexistent-parent-id',
      };

      await expect(service.update('cat-uuid-1', updateWithParent)).rejects.toThrow(
        NotFoundException,
      );
      expect(categoryRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when setting parent to a descendant (cycle)', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockChildCategory);
      categoryRepositoryMock.findDescendantIds.mockResolvedValue(['cat-uuid-2']);

      const updateWithCycle: UpdateCategoryInput = {
        parentId: 'cat-uuid-2', // child of cat-uuid-1
      };

      await expect(service.update('cat-uuid-1', updateWithCycle)).rejects.toThrow(
        BadRequestException,
      );
      expect(categoryRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('should clear the parent when parentId is null (make root)', async () => {
      // mockChildCategory has parentId 'cat-uuid-1'; clearing it makes it a root.
      categoryRepositoryMock.findById.mockResolvedValue(mockChildCategory);
      categoryRepositoryMock.update.mockResolvedValue({
        ...mockChildCategory,
        parentId: null,
      });

      const updateClearParent: UpdateCategoryInput = { parentId: null };

      const result = await service.update('cat-uuid-2', updateClearParent);

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(result.parentId).toBeNull();
      // null short-circuits parent-existence/cycle checks — no extra lookups.
      expect(categoryRepositoryMock.findDescendantIds).not.toHaveBeenCalled();
      expect(categoryRepositoryMock.update).toHaveBeenCalledWith('cat-uuid-2', {
        parentId: null,
      });
    });
  });

  // ─── deactivate (admin) ──────────────────────────────────────────────────────

  describe('deactivate', () => {
    it('should set isActive to false and return CategoryEntity', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.deactivate.mockResolvedValue(mockInactiveCategory);

      const result = await service.deactivate('cat-uuid-3');

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(result.isActive).toBe(false);
      expect(categoryRepositoryMock.findById).toHaveBeenCalledWith('cat-uuid-3');
      expect(categoryRepositoryMock.deactivate).toHaveBeenCalledWith('cat-uuid-3');
    });

    it('should throw NotFoundException when category is not found', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(categoryRepositoryMock.deactivate).not.toHaveBeenCalled();
    });
  });

  // ─── activate (admin) ────────────────────────────────────────────────────────

  describe('activate', () => {
    it('should set isActive to true and return CategoryEntity', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockInactiveCategory);
      categoryRepositoryMock.activate.mockResolvedValue({
        ...mockInactiveCategory,
        isActive: true,
      });

      const result = await service.activate('cat-uuid-3');

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(result.isActive).toBe(true);
      expect(categoryRepositoryMock.findById).toHaveBeenCalledWith('cat-uuid-3');
      expect(categoryRepositoryMock.activate).toHaveBeenCalledWith('cat-uuid-3');
    });

    it('should throw NotFoundException when category is not found', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.activate('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(categoryRepositoryMock.activate).not.toHaveBeenCalled();
    });
  });

  // ─── findAllWithProductCount (admin) ─────────────────────────────────────────

  describe('findAllWithProductCount', () => {
    const query: CategoryListQueryDto = {
      page: 1,
      limit: 20,
    };

    const paginatedWithCount: PaginatedCategoriesWithCountResult = {
      categories: [
        { category: mockCategory, productCount: 5 },
        { category: mockChildCategory, productCount: 3 },
      ],
      total: 2,
    };

    it('should return paginated categories with product counts and meta', async () => {
      categoryRepositoryMock.findAllWithProductCount.mockResolvedValue(paginatedWithCount);

      const result = await service.findAllWithProductCount(query);

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBeInstanceOf(CategoryWithCountEntity);
      expect(result.data[0].productCount).toBe(5);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should pass filter parameters to repository', async () => {
      categoryRepositoryMock.findAllWithProductCount.mockResolvedValue(paginatedWithCount);

      const filterQuery: CategoryListQueryDto = {
        page: 2,
        limit: 10,
        isActive: true,
        parentId: 'cat-uuid-1',
        search: 'phone',
        sortBy: 'name',
        sortOrder: 'asc',
      };

      await service.findAllWithProductCount(filterQuery);

      expect(categoryRepositoryMock.findAllWithProductCount).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        isActive: true,
        parentId: 'cat-uuid-1',
        search: 'phone',
        sortBy: 'name',
        sortOrder: 'asc',
      });
    });
  });

  // ─── generateSlug (private) ──────────────────────────────────────────────────

  describe('generateSlug', () => {
    it('should generate slug from name via create', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue({
        ...mockCategory,
        slug: 'premium-phone-cases',
      });

      await service.create({ name: 'Premium Phone Cases' });

      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('premium-phone-cases');
    });

    it('should handle special characters in name', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue({
        ...mockCategory,
        slug: 'iphone-15-pro-case',
      });

      await service.create({ name: 'iPhone 15 Pro — Case!' });

      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('iphone-15-pro-case');
    });

    it('should collapse multiple hyphens in generated slug', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue({
        ...mockCategory,
        slug: 'best-phone-cases',
      });

      await service.create({ name: 'Best   Phone   Cases' });

      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('best-phone-cases');
    });
  });
});
