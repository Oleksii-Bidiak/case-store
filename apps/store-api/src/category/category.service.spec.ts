import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
  PaginatedCategoriesResult,
  PaginatedCategoriesWithCountResult,
} from './category.repository';
import { CategoryService } from './category.service';
import {
  AdminCategoryTreeNodeEntity,
  CategoryEntity,
  CategoryTreeNodeEntity,
  CategoryWithCountEntity,
} from './entities';
import { CategoryListQueryDto } from './dto';
import {
  CategoryCycleError,
  CategoryDuplicateIdError,
  CategoryMaxDepthError,
  CategoryNotFoundError,
  CategorySelfParentError,
  CategoryTreeStaleError,
} from './category.errors';
import { CacheService, PRODUCT_CACHE_PREFIX, PRODUCT_LIST_PREFIX } from '../cache';
import { CategorySubtreeIndexer } from '../common/ports/category-subtree-indexer.port';

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
  applyTreeMoves: jest.fn(),
  setActiveMany: jest.fn(),
};

const cacheMock = {
  delByPrefix: jest.fn().mockResolvedValue(undefined),
};

const subtreeIndexerMock = {
  reindexSubtrees: jest.fn().mockResolvedValue(undefined),
};

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    cacheMock.delByPrefix.mockResolvedValue(undefined);
    subtreeIndexerMock.reindexSubtrees.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: CategoryRepository,
          useValue: categoryRepositoryMock,
        },
        { provide: CacheService, useValue: cacheMock },
        { provide: CategorySubtreeIndexer, useValue: subtreeIndexerMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
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
        // TASK-297: the public list is unconditionally active-only.
        isActive: true,
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

    // TASK-297: the public list used to send `isActive: undefined` (= NO filter) when
    // the param was omitted, so withdrawn categories were listed — and a hostile
    // `?isActive=false` would have listed ONLY them. Both are now impossible.
    it('forces the active-only filter when the query omits isActive', async () => {
      categoryRepositoryMock.findRootCategories.mockResolvedValue(paginatedResult);

      await service.getRootCategories({ page: 1, limit: 20 });

      expect(categoryRepositoryMock.findRootCategories).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('overrides an explicit isActive=false from a public caller with true', async () => {
      categoryRepositoryMock.findRootCategories.mockResolvedValue(paginatedResult);

      await service.getRootCategories({ page: 1, limit: 20, isActive: false });

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
    // Since TASK-291 the repository assembles the flat admin read into
    // AdminCategoryTreeNodeEntity nodes itself (parentId / productCount / depth), so the
    // service is a pass-through — there is no mapping step left to assert.
    it('returns the repository’s admin tree unchanged, with the admin-only fields intact', async () => {
      const child = AdminCategoryTreeNodeEntity.fromRow(
        { ...mockInactiveCategory, parentId: mockCategory.id, _count: { products: 3 } },
        2,
      );
      const root = AdminCategoryTreeNodeEntity.fromRow(
        { ...mockCategory, parentId: null, _count: { products: 7 } },
        1,
      );
      root.children = [child];
      categoryRepositoryMock.findCategoryTreeForAdmin.mockResolvedValue([root]);

      const result = await service.getCategoryTreeForAdmin();

      expect(categoryRepositoryMock.findCategoryTreeForAdmin).toHaveBeenCalled();
      // Uses the admin (unfiltered) traversal, NOT the public isActive-filtered one.
      expect(categoryRepositoryMock.findCategoryTree).not.toHaveBeenCalled();
      expect(result.data[0]).toBeInstanceOf(AdminCategoryTreeNodeEntity);
      // Still a CategoryTreeNodeEntity — the admin node is a strict superset.
      expect(result.data[0]).toBeInstanceOf(CategoryTreeNodeEntity);
      expect(result.data[0].productCount).toBe(7);
      expect(result.data[0].depth).toBe(1);
      expect(result.data[0].parentId).toBeNull();
      // Inactive child is present (not filtered out) and carries the admin fields.
      expect(result.data[0].children[0].isActive).toBe(false);
      expect(result.data[0].children[0].parentId).toBe(mockCategory.id);
      expect(result.data[0].children[0].productCount).toBe(3);
      expect(result.data[0].children[0].depth).toBe(2);
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
      // No `activeOnly` override: the PUBLIC read leans on the repository's
      // active-only DEFAULT (TASK-297), which is what makes a withdrawn category
      // 404 here. Passing `{ activeOnly: false }` — as the uniqueness checks in
      // create/update must — would silently re-expose it.
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

      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('phone-cases', {
        activeOnly: false,
      });
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

    // ─── a PUT that flips isActive is a withdrawal (TASK-297) ────────────────
    //
    // The admin edit form carries the «Активна» switch, so PUT is a first-class
    // route to deactivation — yet it used to fire NONE of the side effects the
    // dedicated toggle endpoints do, leaving the withdrawn category's products
    // cached and still indexed in Meilisearch.
    it('runs the full status-change side effects when the PUT deactivates the category', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory); // isActive: true
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...mockCategory, isActive: false },
        reparented: false,
      });

      await service.update('cat-uuid-1', { isActive: false }, 'admin-1');

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_CACHE_PREFIX);
      expect(subtreeIndexerMock.reindexSubtrees).toHaveBeenCalledWith(['cat-uuid-1']);
      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'category.status',
          ids: ['cat-uuid-1'],
          isActive: false,
          actorId: 'admin-1',
        }),
        expect.any(String),
      );
    });

    it('runs them again on re-activation, so the products return to the index', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockInactiveCategory); // isActive: false
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...mockInactiveCategory, isActive: true },
        reparented: false,
      });

      await service.update('cat-uuid-3', { isActive: true }, 'admin-1');

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_CACHE_PREFIX);
      expect(subtreeIndexerMock.reindexSubtrees).toHaveBeenCalledWith(['cat-uuid-3']);
    });

    it('does NOT fire the status side effects when the PUT re-sends the unchanged isActive', async () => {
      // A full-object PUT from the edit form always carries `isActive` — resending
      // the current value must stay as cheap as any other rename.
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory); // isActive: true
      categoryRepositoryMock.update.mockResolvedValue({
        category: mockCategory,
        reparented: false,
      });

      await service.update('cat-uuid-1', { name: 'Renamed', isActive: true }, 'admin-1');

      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(subtreeIndexerMock.reindexSubtrees).not.toHaveBeenCalled();
    });

    it('should update a category and return CategoryEntity', async () => {
      const updatedCategory = {
        ...mockCategory,
        name: 'Updated Category Name',
        updatedAt: new Date('2026-05-05T12:00:00.000Z'),
      };
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.update.mockResolvedValue({
        category: updatedCategory,
        reparented: false,
      });

      const result = await service.update('cat-uuid-1', updateInput);

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(result.name).toBe('Updated Category Name');
      // No slug change → no slugRename forwarded (third arg undefined).
      expect(categoryRepositoryMock.update).toHaveBeenCalledWith(
        'cat-uuid-1',
        updateInput,
        undefined,
      );
    });

    it('records a slug redirect when renaming an ACTIVE category', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory); // isActive: true
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...mockCategory, slug: 'new-slug' },
        reparented: false,
      });

      await service.update('cat-uuid-1', { slug: 'new-slug' });

      expect(categoryRepositoryMock.update).toHaveBeenCalledWith(
        'cat-uuid-1',
        expect.objectContaining({ slug: 'new-slug' }),
        { oldSlug: 'phone-cases', newSlug: 'new-slug' },
      );
    });

    it('does NOT record a redirect when renaming an INACTIVE category', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockInactiveCategory); // isActive: false
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...mockInactiveCategory, slug: 'new-slug' },
        reparented: false,
      });

      await service.update('cat-uuid-3', { slug: 'new-slug' });

      expect(categoryRepositoryMock.update).toHaveBeenCalledWith(
        'cat-uuid-3',
        expect.objectContaining({ slug: 'new-slug' }),
        undefined,
      );
    });

    it('still records the redirect when renaming AND deactivating in the same call (pre-write snapshot)', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory); // isActive: true BEFORE the write
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...mockCategory, slug: 'new-slug', isActive: false },
        reparented: false,
      });

      await service.update('cat-uuid-1', { slug: 'new-slug', isActive: false });

      expect(categoryRepositoryMock.update).toHaveBeenCalledWith(
        'cat-uuid-1',
        expect.objectContaining({ slug: 'new-slug', isActive: false }),
        { oldSlug: 'phone-cases', newSlug: 'new-slug' },
      );
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
      categoryRepositoryMock.update.mockResolvedValue({
        category: mockCategory,
        reparented: false,
      });

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
        category: { ...mockChildCategory, parentId: null },
        reparented: true,
      });

      const updateClearParent: UpdateCategoryInput = { parentId: null };

      const result = await service.update('cat-uuid-2', updateClearParent);

      expect(result).toBeInstanceOf(CategoryEntity);
      expect(result.parentId).toBeNull();
      // null short-circuits parent-existence/cycle checks — no extra lookups.
      expect(categoryRepositoryMock.findDescendantIds).not.toHaveBeenCalled();
      expect(categoryRepositoryMock.update).toHaveBeenCalledWith(
        'cat-uuid-2',
        { parentId: null },
        undefined,
      );
    });
  });

  // ─── update — parent-change guards + side effects (TASK-291-D) ───────────────

  describe('update — parent change (plan 158 §3.10 / §3.13)', () => {
    it('rejects a self-parent with a coded 400 and never reaches the repository', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);

      await expect(service.update('cat-uuid-1', { parentId: 'cat-uuid-1' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.update('cat-uuid-1', { parentId: 'cat-uuid-1' })).rejects.toMatchObject({
        response: { error: 'CATEGORY_SELF_PARENT' },
      });
      expect(categoryRepositoryMock.update).not.toHaveBeenCalled();
      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(subtreeIndexerMock.reindexSubtrees).not.toHaveBeenCalled();
    });

    it('maps the repository depth guard (level + height − 1 > 4) to a coded 400', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockChildCategory); // the node
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockCategory); // the new parent
      categoryRepositoryMock.findDescendantIds.mockResolvedValue([]);
      categoryRepositoryMock.update.mockRejectedValue(new CategoryMaxDepthError());

      await expect(service.update('cat-uuid-2', { parentId: 'cat-uuid-1' })).rejects.toMatchObject({
        status: 400,
        response: { error: 'CATEGORY_MAX_DEPTH' },
      });
      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(subtreeIndexerMock.reindexSubtrees).not.toHaveBeenCalled();
    });

    it('maps the repository cycle guard to a coded 400', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockChildCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockCategory);
      categoryRepositoryMock.findDescendantIds.mockResolvedValue([]);
      categoryRepositoryMock.update.mockRejectedValue(new CategoryCycleError());

      await expect(service.update('cat-uuid-2', { parentId: 'cat-uuid-1' })).rejects.toMatchObject({
        status: 400,
        response: { error: 'CATEGORY_CYCLE' },
      });
    });

    it('evicts the product-list cache AFTER the write and reindexes the moved subtree', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockChildCategory); // cat-uuid-2
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockCategory); // new parent
      categoryRepositoryMock.findDescendantIds.mockResolvedValue([]);
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...mockChildCategory, parentId: 'cat-uuid-3' },
        reparented: true,
      });

      await service.update('cat-uuid-2', { parentId: 'cat-uuid-3' });

      expect(cacheMock.delByPrefix).toHaveBeenCalledTimes(1);
      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheMock.delByPrefix.mock.invocationCallOrder[0]).toBeGreaterThan(
        categoryRepositoryMock.update.mock.invocationCallOrder[0],
      );
      expect(subtreeIndexerMock.reindexSubtrees).toHaveBeenCalledTimes(1);
      expect(subtreeIndexerMock.reindexSubtrees).toHaveBeenCalledWith(['cat-uuid-2']);
    });

    it('does NOT evict or reindex when the parent is not changing', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...mockCategory, name: 'Renamed' },
        reparented: false,
      });

      await service.update('cat-uuid-1', { name: 'Renamed' });

      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(subtreeIndexerMock.reindexSubtrees).not.toHaveBeenCalled();
    });

    // The side effects are gated on the repository's AUTHORITATIVE, tree-locked verdict —
    // NOT on the service's pre-lock `input.parentId !== category.parentId` comparison.
    // A full-object PUT re-sending the parent it read a moment ago looks like "no change"
    // here, yet the repository (which re-reads the parent under the tree lock, after a
    // concurrent admin moved the node elsewhere) legitimately moves it back. Missing the
    // eviction/reindex here rots the product-list cache and the indexed ancestor chains.
    it('evicts and reindexes when the repository reports a reparent the pre-lock read did not predict', async () => {
      // mockChildCategory.parentId === 'cat-uuid-1'; the payload re-sends exactly that.
      categoryRepositoryMock.findById.mockResolvedValue(mockChildCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockChildCategory); // the node
      categoryRepositoryMock.update.mockResolvedValue({
        category: mockChildCategory,
        reparented: true, // …but under the lock the node DID move (back) — a real reparent
      });

      await service.update('cat-uuid-2', { parentId: 'cat-uuid-1' });

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(subtreeIndexerMock.reindexSubtrees).toHaveBeenCalledWith(['cat-uuid-2']);
    });

    // The mirror image: the pre-lock read says "changing", but under the lock a concurrent
    // write had already put the node there, so NOTHING moved — no side effects.
    it('does NOT evict or reindex when the repository reports no actual reparent', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockChildCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockCategory);
      categoryRepositoryMock.findDescendantIds.mockResolvedValue([]);
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...mockChildCategory, parentId: 'cat-uuid-3' },
        reparented: false,
      });

      await service.update('cat-uuid-2', { parentId: 'cat-uuid-3' });

      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(subtreeIndexerMock.reindexSubtrees).not.toHaveBeenCalled();
    });

    it('does not fail the request when the subtree reindex rejects', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockChildCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(mockCategory);
      categoryRepositoryMock.findDescendantIds.mockResolvedValue([]);
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...mockChildCategory, parentId: 'cat-uuid-3' },
        reparented: true,
      });
      subtreeIndexerMock.reindexSubtrees.mockRejectedValue(new Error('meili down'));

      await expect(
        service.update('cat-uuid-2', { parentId: 'cat-uuid-3' }),
      ).resolves.toBeInstanceOf(CategoryEntity);
    });
  });

  // ─── reorderTree (admin, TASK-291-D) ─────────────────────────────────────────

  describe('reorderTree', () => {
    const adminTree = [
      {
        id: 'cat-uuid-1',
        name: 'Phone Cases',
        slug: 'phone-cases',
        parentId: null,
        productCount: 2,
        depth: 1,
        children: [],
      },
    ] as unknown as AdminCategoryTreeNodeEntity[];

    const groups = [
      { parentId: null, orderedIds: ['cat-uuid-1'] },
      { parentId: 'cat-uuid-1', orderedIds: ['cat-uuid-2'] },
    ];

    it('returns the refreshed admin tree and calls the repository EXACTLY ONCE', async () => {
      categoryRepositoryMock.applyTreeMoves.mockResolvedValue({
        tree: adminTree,
        movedIds: ['cat-uuid-2'],
      });

      const result = await service.reorderTree({ groups }, 'admin-1');

      expect(result).toEqual({ data: adminTree });
      expect(categoryRepositoryMock.applyTreeMoves).toHaveBeenCalledTimes(1);
      expect(categoryRepositoryMock.applyTreeMoves).toHaveBeenCalledWith(groups);
    });

    it('evicts the product-list cache exactly once, AFTER the transaction', async () => {
      categoryRepositoryMock.applyTreeMoves.mockResolvedValue({
        tree: adminTree,
        movedIds: ['cat-uuid-2'],
      });

      await service.reorderTree({ groups }, 'admin-1');

      expect(cacheMock.delByPrefix).toHaveBeenCalledTimes(1);
      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_LIST_PREFIX);
      expect(cacheMock.delByPrefix.mock.invocationCallOrder[0]).toBeGreaterThan(
        categoryRepositoryMock.applyTreeMoves.mock.invocationCallOrder[0],
      );
    });

    it('reindexes exactly once with the moved-root ids reported by the repository', async () => {
      categoryRepositoryMock.applyTreeMoves.mockResolvedValue({
        tree: adminTree,
        movedIds: ['cat-uuid-2', 'cat-uuid-3'],
      });

      await service.reorderTree({ groups }, 'admin-1');

      expect(subtreeIndexerMock.reindexSubtrees).toHaveBeenCalledTimes(1);
      expect(subtreeIndexerMock.reindexSubtrees).toHaveBeenCalledWith(['cat-uuid-2', 'cat-uuid-3']);
    });

    it('does NOT fail the request when the Meilisearch reindex rejects', async () => {
      categoryRepositoryMock.applyTreeMoves.mockResolvedValue({
        tree: adminTree,
        movedIds: ['cat-uuid-2'],
      });
      subtreeIndexerMock.reindexSubtrees.mockRejectedValue(new Error('meili down'));

      await expect(service.reorderTree({ groups }, 'admin-1')).resolves.toEqual({
        data: adminTree,
      });
    });

    it('logs one structured line with the event, groups, movedIds and actorId', async () => {
      categoryRepositoryMock.applyTreeMoves.mockResolvedValue({
        tree: adminTree,
        movedIds: ['cat-uuid-2'],
      });

      await service.reorderTree({ groups }, 'admin-1');

      expect(pinoLoggerMock.info).toHaveBeenCalledTimes(1);
      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'category.reorder',
          groups,
          movedIds: ['cat-uuid-2'],
          actorId: 'admin-1',
        }),
        expect.any(String),
      );
    });

    it.each([
      [new CategoryCycleError(), 400, 'CATEGORY_CYCLE'],
      [new CategoryMaxDepthError(), 400, 'CATEGORY_MAX_DEPTH'],
      [new CategorySelfParentError(), 400, 'CATEGORY_SELF_PARENT'],
      [new CategoryDuplicateIdError(), 400, 'CATEGORY_DUPLICATE_ID'],
      [new CategoryNotFoundError(), 404, 'CATEGORY_NOT_FOUND'],
      [new CategoryTreeStaleError(), 409, 'CATEGORY_TREE_STALE'],
    ])('maps %s to HTTP %i with the code in the envelope', async (domainError, status, code) => {
      categoryRepositoryMock.applyTreeMoves.mockRejectedValue(domainError);

      await expect(service.reorderTree({ groups }, 'admin-1')).rejects.toMatchObject({
        status,
        response: { error: code },
      });

      // A rejected batch runs NO side effects.
      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(subtreeIndexerMock.reindexSubtrees).not.toHaveBeenCalled();
      expect(pinoLoggerMock.info).not.toHaveBeenCalled();
    });

    it('rethrows a non-domain repository failure untouched', async () => {
      const boom = new Error('connection reset');
      categoryRepositoryMock.applyTreeMoves.mockRejectedValue(boom);

      await expect(service.reorderTree({ groups }, 'admin-1')).rejects.toBe(boom);
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

    // TASK-293: the per-row toggle used to write the row and stop there — no cache
    // eviction, no re-index, no log line — so a deactivated category kept selling.
    // TASK-297 widened the eviction from the list prefix to the WHOLE product
    // namespace: the products' PDPs now 404, so their cached detail entries must go
    // too — otherwise the withdrawn pages keep serving for the rest of their TTL.
    it('evicts the whole product cache namespace, reindexes and logs (TASK-293/297)', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(mockCategory);
      categoryRepositoryMock.deactivate.mockResolvedValue(mockInactiveCategory);

      await service.deactivate('cat-uuid-3', 'admin-1');

      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_CACHE_PREFIX);
      expect(subtreeIndexerMock.reindexSubtrees).toHaveBeenCalledWith(['cat-uuid-3']);
      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'category.status',
          ids: ['cat-uuid-3'],
          isActive: false,
          actorId: 'admin-1',
        }),
        expect.any(String),
      );
    });

    it('does not touch the cache when the category does not exist', async () => {
      categoryRepositoryMock.findById.mockResolvedValue(null);

      await expect(service.deactivate('nonexistent-id')).rejects.toThrow(NotFoundException);

      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(subtreeIndexerMock.reindexSubtrees).not.toHaveBeenCalled();
    });
  });

  // ─── setStatusMany (admin, TASK-293) ─────────────────────────────────────────

  describe('setStatusMany', () => {
    const tree = [{ id: 'cat-uuid-1' }] as never[];

    it('writes the ids, returns the refreshed tree and runs the side effects', async () => {
      categoryRepositoryMock.setActiveMany.mockResolvedValue({ tree, updatedCount: 2 });

      const result = await service.setStatusMany(['cat-uuid-1', 'cat-uuid-2'], false, 'admin-1');

      expect(categoryRepositoryMock.setActiveMany).toHaveBeenCalledWith(
        ['cat-uuid-1', 'cat-uuid-2'],
        false,
      );
      expect(result).toEqual({ data: tree });
      expect(cacheMock.delByPrefix).toHaveBeenCalledWith(PRODUCT_CACHE_PREFIX);
      expect(subtreeIndexerMock.reindexSubtrees).toHaveBeenCalledWith(['cat-uuid-1', 'cat-uuid-2']);
      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'category.status',
          ids: ['cat-uuid-1', 'cat-uuid-2'],
          isActive: false,
          updatedCount: 2,
          actorId: 'admin-1',
        }),
        expect.any(String),
      );
    });

    it('maps an unknown id onto a 404 and skips the side effects', async () => {
      categoryRepositoryMock.setActiveMany.mockRejectedValue(
        new CategoryNotFoundError('Unknown category id(s): ghost'),
      );

      await expect(service.setStatusMany(['ghost'], true)).rejects.toThrow(NotFoundException);

      expect(cacheMock.delByPrefix).not.toHaveBeenCalled();
      expect(subtreeIndexerMock.reindexSubtrees).not.toHaveBeenCalled();
    });

    it('evicts the cache only AFTER the write commits', async () => {
      categoryRepositoryMock.setActiveMany.mockResolvedValue({ tree, updatedCount: 1 });

      await service.setStatusMany(['cat-uuid-1'], true);

      expect(cacheMock.delByPrefix.mock.invocationCallOrder[0]).toBeGreaterThan(
        categoryRepositoryMock.setActiveMany.mock.invocationCallOrder[0],
      );
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

      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('premium-phone-cases', {
        activeOnly: false,
      });
    });

    it('should handle special characters in name', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue({
        ...mockCategory,
        slug: 'iphone-15-pro-case',
      });

      await service.create({ name: 'iPhone 15 Pro — Case!' });

      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('iphone-15-pro-case', {
        activeOnly: false,
      });
    });

    it('should collapse multiple hyphens in generated slug', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue({
        ...mockCategory,
        slug: 'best-phone-cases',
      });

      await service.create({ name: 'Best   Phone   Cases' });

      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('best-phone-cases', {
        activeOnly: false,
      });
    });
  });
});
