import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { CategoryRepository } from '../src/category/category.repository';
import {
  CategoryCycleError,
  CategoryMoveTargetHiddenError,
  CategoryMoveTargetInSubtreeError,
  CategoryMoveTargetRequiredError,
  CategoryNotFoundError,
} from '../src/category/category.errors';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the Category module.
 *
 * Uses mocked AuthRepository, UserRepository, CategoryRepository, and PrismaService
 * to avoid requiring a real database connection. JWT tokens are generated directly
 * via JwtService to bypass the rate-limited auth endpoints.
 *
 * ThrottlerGuard is overridden with a pass-through guard to avoid
 * rate limiting issues during test execution.
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('CategoryController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Mock AuthRepository — for JWT strategy user lookup
  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  // Mock UserRepository — for user management
  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
  };

  // Mock CategoryRepository — for category management
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
    // TASK-291: batch reorder/reparent + the subtree expansion the post-commit
    // re-index uses (best-effort, so its failure never reaches the response).
    applyTreeMoves: jest.fn(),
    setActiveMany: jest.fn(),
    findSubtreeIds: jest.fn(),
    // TASK-652/654: the subtree delete and the admin card's delete preview.
    deleteSubtreeWithMove: jest.fn(),
    countDeletionImpact: jest.fn(),
  };

  // Kept as a reference so the DELETE suite can hand managers different keys mid-suite
  // (`setGrants`) — every other suite here runs as the admin or a customer.
  const permissionRepositoryMock = createPermissionRepositoryMock();

  // Mock PrismaService — prevents database connection errors
  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  // Test data
  const testAdmin = {
    id: 'admin-e2e-1',
    email: 'e2e-admin@example.com',
    passwordHash: '$argon2id$hash',
    firstName: 'Admin',
    lastName: 'User',
    phone: null,
    role: 'ADMIN' as const,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const testCustomer = {
    id: 'customer-e2e-1',
    email: 'e2e-customer@example.com',
    passwordHash: '$argon2id$hash',
    firstName: 'Customer',
    lastName: 'User',
    phone: null,
    role: 'CUSTOMER' as const,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const testCategory = {
    id: 'cat-e2e-1',
    name: 'Phone Cases',
    slug: 'phone-cases',
    description: 'Protective cases for all smartphone models',
    image: 'https://example.com/images/phone-cases.jpg',
    parentId: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const testChildCategory = {
    id: 'cat-e2e-2',
    name: 'iPhone Cases',
    slug: 'iphone-cases',
    description: 'Cases for iPhone models',
    image: null,
    parentId: 'cat-e2e-1',
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  };

  /**
   * Generate a JWT access token for a given user ID and role.
   * Bypasses the rate-limited auth register endpoint.
   */
  function generateAccessToken(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '15m',
      },
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env'],
        }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(PermissionRepository)
      .useValue(permissionRepositoryMock)
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(CategoryRepository)
      .useValue(categoryRepositoryMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Registered exactly as `main.ts` does (DI-resolved, for its PinoLogger): the reorder
    // contract (plan 158 §3.5) depends on the STABLE error code surviving this filter's
    // envelope rebuild — it reads ONLY `error` + `message` off the thrown body and
    // discards every other property. Asserting the code on the wire is meaningless
    // without it.
    app.useGlobalFilters(moduleFixture.get(HttpExceptionFilter));

    app.setGlobalPrefix('api', {
      exclude: ['health'],
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Reset mocks between tests (resetAllMocks clears implementations too)
  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── GET /api/categories/tree (public) ──────────────────────────────────────

  describe('GET /api/categories/tree', () => {
    it('should return 200 with category tree', async () => {
      categoryRepositoryMock.findCategoryTree.mockResolvedValue([
        {
          ...testCategory,
          children: [
            {
              ...testChildCategory,
              children: [],
            },
          ],
        },
      ]);

      const response = await request(app.getHttpServer()).get('/api/categories/tree').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toHaveProperty('name', 'Phone Cases');
      expect(response.body.data[0]).toHaveProperty('children');
      expect(response.body.data[0].children).toHaveLength(1);
    });

    it('should return empty array when no categories exist', async () => {
      categoryRepositoryMock.findCategoryTree.mockResolvedValue([]);

      const response = await request(app.getHttpServer()).get('/api/categories/tree').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(0);
    });
  });

  // ─── GET /api/categories/admin/tree (admin, TASK-236) ───────────────────────

  describe('GET /api/categories/admin/tree', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/api/categories/admin/tree').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/categories/admin/tree')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with the full tree (incl. inactive) for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      // The admin tree surfaces inactive nodes the public tree would hide.
      categoryRepositoryMock.findCategoryTreeForAdmin.mockResolvedValue([
        {
          ...testCategory,
          children: [
            {
              ...testChildCategory,
              isActive: false,
              children: [],
            },
          ],
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/categories/admin/tree')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toHaveProperty('children');
      expect(response.body.data[0].children[0]).toHaveProperty('isActive', false);
      // Must use the admin (unfiltered) traversal, not the public one.
      expect(categoryRepositoryMock.findCategoryTreeForAdmin).toHaveBeenCalled();
    });
  });

  // ─── GET /api/categories (public) ──────────────────────────────────────────

  describe('GET /api/categories', () => {
    it('should return 200 with paginated root categories', async () => {
      categoryRepositoryMock.findRootCategories.mockResolvedValue({
        categories: [testCategory],
        total: 1,
      });

      const response = await request(app.getHttpServer()).get('/api/categories').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('limit');
      expect(response.body.meta).toHaveProperty('totalPages');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should pass query parameters for filtering', async () => {
      categoryRepositoryMock.findRootCategories.mockResolvedValue({
        categories: [testCategory],
        total: 1,
      });

      const response = await request(app.getHttpServer())
        .get('/api/categories?isActive=true&page=1&limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(categoryRepositoryMock.findRootCategories).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          page: 1,
          limit: 10,
        }),
      );
    });

    // ─── withdrawn categories are never publicly listed (TASK-297) ───────────

    it('filters to active categories even when the query sends no isActive at all', async () => {
      categoryRepositoryMock.findRootCategories.mockResolvedValue({ categories: [], total: 0 });

      await request(app.getHttpServer()).get('/api/categories').expect(200);

      expect(categoryRepositoryMock.findRootCategories).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('refuses to list withdrawn categories for a public caller sending ?isActive=false', async () => {
      // Two bugs met on this line: the DTO's `@Transform` read the ALREADY-COERCED
      // value (so `'false'` arrived as `true`), and the service forwarded whatever it
      // got. Even with the transform fixed, the public list must pin the filter to
      // `true` — otherwise this request enumerates exactly the withdrawn categories.
      categoryRepositoryMock.findRootCategories.mockResolvedValue({ categories: [], total: 0 });

      await request(app.getHttpServer()).get('/api/categories?isActive=false').expect(200);

      expect(categoryRepositoryMock.findRootCategories).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  // ─── GET /api/categories/:slug (public) ─────────────────────────────────────

  describe('GET /api/categories/:slug', () => {
    it('should return 200 with category and product count', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(testCategory);
      categoryRepositoryMock.findWithProductCount.mockResolvedValue({
        category: testCategory,
        productCount: 5,
        subtreeProductCount: 19,
      });

      const response = await request(app.getHttpServer())
        .get('/api/categories/phone-cases')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('productCount');
      expect(response.body.data).toHaveProperty('name', 'Phone Cases');
      expect(response.body.data).toHaveProperty('slug', 'phone-cases');
      expect(response.body.productCount).toBe(5);
      // TASK-408: the subtree rollup travels beside the direct count — this page
      // LISTS the whole subtree, so the direct number alone describes a different
      // set of products than the one on screen.
      expect(response.body.data.subtreeProductCount).toBe(19);
    });

    it('should return 404 for non-existent slug', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);

      await request(app.getHttpServer()).get('/api/categories/nonexistent-slug').expect(404);
    });

    // ─── a withdrawn category has no public page (TASK-297) ─────────────────
    //
    // The repository is mocked here, so the mock IMPLEMENTS its contract (active-only
    // unless told otherwise) — that is what lets this assert the HTTP outcome. The
    // Prisma `where` that produces the null is proven in `category.repository.spec.ts`.
    it('should return 404 for a DEACTIVATED category slug', async () => {
      const inactiveCategory = { ...testCategory, isActive: false };
      categoryRepositoryMock.findBySlug.mockImplementation(
        (_slug: string, options?: { activeOnly?: boolean }) =>
          Promise.resolve((options?.activeOnly ?? true) ? null : inactiveCategory),
      );

      await request(app.getHttpServer()).get('/api/categories/phone-cases').expect(404);

      // …and the 404 is earned by the public default, not by a missing row: the
      // service must NOT have opted out of the active-only filter.
      expect(categoryRepositoryMock.findBySlug).toHaveBeenCalledWith('phone-cases');
      expect(categoryRepositoryMock.findWithProductCount).not.toHaveBeenCalled();
    });
  });

  // ─── GET /api/admin/categories (admin) ──────────────────────────────────────

  describe('GET /api/admin/categories', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/api/admin/categories').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with paginated categories and product counts for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findAllWithProductCount.mockResolvedValue({
        categories: [
          { category: testCategory, productCount: 5, subtreeProductCount: 8 },
          { category: testChildCategory, productCount: 3, subtreeProductCount: 3 },
        ],
        total: 2,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('total');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('productCount');
      expect(response.body.data[0]).toHaveProperty('subtreeProductCount', 8); // TASK-408
    });
  });

  // ─── GET /api/admin/categories/:id (admin) ─────────────────────────────────

  describe('GET /api/admin/categories/:id', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/api/admin/categories/cat-e2e-1').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with category for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue(testCategory);
      categoryRepositoryMock.countDeletionImpact.mockResolvedValue({
        subcategoryCount: 1,
        productCount: 7,
        carouselCount: 2,
        carousels: [
          { id: 'car-1', name: 'Навушники тижня' },
          { id: 'car-2', name: 'Чохли' },
        ],
        deletedProductCount: 1,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', 'Phone Cases');
      expect(response.body.data).toHaveProperty('slug', 'phone-cases');
      // TASK-652/654: the delete dialog's preview travels with the admin card.
      expect(response.body.data.deletionImpact).toEqual({
        subcategoryCount: 1,
        productCount: 7,
        carouselCount: 2,
        // TASK-1776: named, so the dialog can say which carousels switch.
        carousels: [
          { id: 'car-1', name: 'Навушники тижня' },
          { id: 'car-2', name: 'Чохли' },
        ],
        deletedProductCount: 1,
      });
      expect(categoryRepositoryMock.countDeletionImpact).toHaveBeenCalledWith('cat-e2e-1');
    });

    it('should return 404 for non-existent category', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/admin/categories/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── Reads a delete-only manager needs (TASK-655) ───────────────────────────
  //
  // The delete dialog lives on the admin card and picks its target from the admin
  // tree, so `categories:delete` alone must open both reads — and nothing that writes.

  describe('category reads for a manager holding only categories:delete', () => {
    const managerId = 'manager-e2e-1';

    afterEach(() => {
      // Managers hold nothing again, as in every other suite of this file.
      permissionRepositoryMock.setGrants('MANAGER', []);
    });

    it('opens GET /api/categories/admin/tree', async () => {
      permissionRepositoryMock.setGrants('MANAGER', ['categories:delete']);
      const token = generateAccessToken(managerId, 'MANAGER');
      categoryRepositoryMock.findCategoryTreeForAdmin.mockResolvedValue([
        { ...testCategory, children: [] },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/categories/admin/tree')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });

    it('opens GET /api/admin/categories/:id with the deletion preview', async () => {
      permissionRepositoryMock.setGrants('MANAGER', ['categories:delete']);
      const token = generateAccessToken(managerId, 'MANAGER');
      categoryRepositoryMock.findById.mockResolvedValue(testCategory);
      categoryRepositoryMock.countDeletionImpact.mockResolvedValue({
        subcategoryCount: 0,
        productCount: 2,
        carouselCount: 0,
        carousels: [],
        deletedProductCount: 0,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.deletionImpact).toHaveProperty('productCount', 2);
    });

    it('still opens both reads for a manager holding only categories:write', async () => {
      permissionRepositoryMock.setGrants('MANAGER', ['categories:write']);
      const token = generateAccessToken(managerId, 'MANAGER');
      categoryRepositoryMock.findCategoryTreeForAdmin.mockResolvedValue([]);
      categoryRepositoryMock.findById.mockResolvedValue(testCategory);
      categoryRepositoryMock.countDeletionImpact.mockResolvedValue({
        subcategoryCount: 0,
        productCount: 0,
        carouselCount: 0,
        carousels: [],
        deletedProductCount: 0,
      });

      await request(app.getHttpServer())
        .get('/api/categories/admin/tree')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('refuses both reads to a manager holding neither key', async () => {
      permissionRepositoryMock.setGrants('MANAGER', ['products:write']);
      const token = generateAccessToken(managerId, 'MANAGER');

      await request(app.getHttpServer())
        .get('/api/categories/admin/tree')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    // Reading is all `categories:delete` buys: every write keeps `categories:write`.
    it('keeps every category write closed', async () => {
      permissionRepositoryMock.setGrants('MANAGER', ['categories:delete']);
      const token = generateAccessToken(managerId, 'MANAGER');
      const server = app.getHttpServer();
      const auth = `Bearer ${token}`;

      await request(server).get('/api/admin/categories').set('Authorization', auth).expect(403);
      await request(server)
        .post('/api/admin/categories')
        .set('Authorization', auth)
        .send({ name: 'New' })
        .expect(403);
      await request(server)
        .put('/api/admin/categories/cat-e2e-1')
        .set('Authorization', auth)
        .send({ name: 'Renamed' })
        .expect(403);
      await request(server)
        .patch('/api/admin/categories/cat-e2e-1/deactivate')
        .set('Authorization', auth)
        .expect(403);
      expect(categoryRepositoryMock.create).not.toHaveBeenCalled();
      expect(categoryRepositoryMock.update).not.toHaveBeenCalled();
      expect(categoryRepositoryMock.deactivate).not.toHaveBeenCalled();
    });
  });

  // ─── POST /api/admin/categories (admin) ──────────────────────────────────────

  describe('POST /api/admin/categories', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/categories')
        .send({ name: 'New Category' })
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New Category' })
        .expect(403);
    });

    it('should create a category and return 201 for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue(testCategory);

      const response = await request(app.getHttpServer())
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Phone Cases',
          slug: 'phone-cases',
        })
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', 'Phone Cases');
      expect(response.body.data).toHaveProperty('slug', 'phone-cases');
    });

    it('should return 409 when slug is already taken', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findBySlug.mockResolvedValue(testCategory);

      await request(app.getHttpServer())
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Duplicate Category',
          slug: 'phone-cases',
        })
        .expect(409);
    });

    it('should return 404 when parentId does not exist', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Sub Category',
          slug: 'sub-category',
          parentId: '550e8400-e29b-41d4-a716-446655440099',
        })
        .expect(404);
    });

    it('should return 400 when required fields are missing', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    // TASK-364. `@IsUrl()` defaults to `require_tld: true`, which rejects any host
    // without a dot — including `localhost`, the origin store-api serves its own
    // uploads from in dev. Since the seed now writes `Category.image` as
    // `http://localhost:3001/uploads/...`, the admin form (which PUTs the whole
    // entity back) got a 400 on every save, even for an unrelated field.
    it('should accept an image URL on the store-api uploads origin (localhost, no TLD)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.create.mockResolvedValue(testCategory);

      await request(app.getHttpServer())
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Phone Cases',
          slug: 'phone-cases',
          image: 'http://localhost:3001/uploads/products/seed-0123456789abcdef.webp',
        })
        .expect(201);
    });

    it.each([
      ['a javascript: URL', 'javascript:alert(1)'],
      ['a relative path', '/uploads/products/seed.webp'],
      ['plain text', 'not a url'],
    ])('should still return 400 for %s as the image', async (_label, image) => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findBySlug.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Phone Cases', slug: 'phone-cases', image })
        .expect(400);
    });
  });

  // ─── PUT /api/admin/categories/:id (admin) ───────────────────────────────────

  describe('PUT /api/admin/categories/:id', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .put('/api/admin/categories/cat-e2e-1')
        .send({ name: 'Updated Name' })
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .put('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(403);
    });

    it('should update a category and return 200 for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue(testCategory);
      categoryRepositoryMock.update.mockResolvedValue({
        category: {
          ...testCategory,
          name: 'Updated Category Name',
          updatedAt: new Date('2026-05-05T12:00:00.000Z'),
        },
        reparented: false,
      });

      const response = await request(app.getHttpServer())
        .put('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Category Name' })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.name).toBe('Updated Category Name');
    });

    // TASK-364 — the exact shape the admin category form submits: the whole entity
    // echoed back, including the seeded local `image`, with only the name changed.
    it('should update a category whose image is a seeded uploads URL', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue(testCategory);
      categoryRepositoryMock.update.mockResolvedValue({
        category: { ...testCategory, name: 'Чохли' },
        reparented: false,
      });

      await request(app.getHttpServer())
        .put('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Чохли',
          image: 'http://localhost:3001/uploads/products/seed-0123456789abcdef.webp',
        })
        .expect(200);
    });

    it('should return 404 when category is not found', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .put('/api/admin/categories/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(404);
    });

    it('should return 409 when updating slug to one already taken', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue(testCategory);
      categoryRepositoryMock.findBySlug.mockResolvedValue({
        ...testCategory,
        id: 'other-category-id',
        slug: 'taken-slug',
      });

      await request(app.getHttpServer())
        .put('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ slug: 'taken-slug' })
        .expect(409);
    });

    it('should return 400 when setting parent to a descendant (cycle)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      // `parentId` travels in the BODY, where `UpdateCategoryDto` validates it as
      // a UUID — unlike the path id, which the controller reads as a plain string
      // (the 404 case above posts `nonexistent-id` and gets past the pipe). With
      // the fixture's `cat-e2e-2` here the request never reached the service at
      // all: the ValidationPipe answered 400 first, and for years the assertion
      // `.expect(400)` was satisfied by that — the cycle branch below has in fact
      // never run in this suite. A UUID-shaped descendant id is what makes the
      // request reach `CategoryService.update` and its cycle guard.
      const descendantId = 'cae2e002-0000-4000-8000-000000000002';

      categoryRepositoryMock.findById.mockResolvedValue(testCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(testCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce({
        ...testChildCategory,
        id: descendantId,
      });
      categoryRepositoryMock.findDescendantIds.mockResolvedValue([descendantId]);

      const response = await request(app.getHttpServer())
        .put('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ parentId: descendantId })
        .expect(400);

      // TASK-408 (AD-CAT-08): the STATUS alone is not enough for the admin form —
      // it tells apart "you made a cycle" from every other 400 this route can
      // return by the stable `error` code, exactly as the reorder route does.
      expect(response.body).toHaveProperty('error', 'CATEGORY_CYCLE');
      expect(categoryRepositoryMock.update).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /api/admin/categories/reorder (admin, TASK-291) ──────────────────

  describe('PATCH /api/admin/categories/reorder', () => {
    // Real UUIDs — the DTO validates `@IsUUID('4')` on every id.
    const rootId = '550e8400-e29b-41d4-a716-446655440000';
    const childA = '550e8400-e29b-41d4-a716-446655440001';
    const childB = '550e8400-e29b-41d4-a716-446655440002';

    const adminTreeNode = {
      id: rootId,
      name: 'Phone Cases',
      slug: 'phone-cases',
      description: null,
      image: null,
      parentId: null,
      isActive: true,
      sortOrder: 0,
      metaTitle: null,
      metaDescription: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      productCount: 3,
      subtreeProductCount: 3,
      depth: 1,
      children: [],
    };

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/categories/reorder')
        .send({ groups: [{ parentId: null, orderedIds: [rootId] }] })
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ groups: [{ parentId: null, orderedIds: [rootId] }] })
        .expect(403);
    });

    it('should return 400 when an ordered id is not a uuid', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ groups: [{ parentId: null, orderedIds: ['not-a-uuid'] }] })
        .expect(400);

      expect(categoryRepositoryMock.applyTreeMoves).not.toHaveBeenCalled();
    });

    it('should return 400 when groups is missing', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(categoryRepositoryMock.applyTreeMoves).not.toHaveBeenCalled();
    });

    it('should return 400 on an extra property (forbidNonWhitelisted)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({
          groups: [{ parentId: null, orderedIds: [rootId] }],
          sortOrder: 3,
        })
        .expect(400);

      expect(categoryRepositoryMock.applyTreeMoves).not.toHaveBeenCalled();
    });

    // Regression guard (plan 158 §3.4): dragging the LAST child out of a parent sends
    // that parent an EMPTY orderedIds — `@ArrayNotEmpty()` on the group would 400 a
    // legal, day-one operator action.
    it('should ACCEPT a group with an empty orderedIds array', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.applyTreeMoves.mockResolvedValue({
        tree: [adminTreeNode],
        movedIds: [childA],
      });

      const groups = [
        { parentId: rootId, orderedIds: [] },
        { parentId: null, orderedIds: [rootId, childA] },
      ];

      const response = await request(app.getHttpServer())
        .patch('/api/admin/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ groups })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(categoryRepositoryMock.applyTreeMoves).toHaveBeenCalledWith(groups);
    });

    it('should surface the CATEGORY_CYCLE code in the 400 body’s error field', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.applyTreeMoves.mockRejectedValue(new CategoryCycleError());

      const response = await request(app.getHttpServer())
        .patch('/api/admin/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ groups: [{ parentId: childA, orderedIds: [rootId] }] })
        .expect(400);

      // The stable code must survive HttpExceptionFilter's envelope rebuild — it reads
      // ONLY `error` and `message` off the thrown body (plan 158 §3.5).
      expect(response.body).toHaveProperty('error', 'CATEGORY_CYCLE');
      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 200 with the refreshed admin tree for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.applyTreeMoves.mockResolvedValue({
        tree: [adminTreeNode],
        movedIds: [],
      });

      const response = await request(app.getHttpServer())
        .patch('/api/admin/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ groups: [{ parentId: rootId, orderedIds: [childB, childA] }] })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: rootId,
        parentId: null,
        productCount: 3,
        depth: 1,
      });
      expect(categoryRepositoryMock.applyTreeMoves).toHaveBeenCalledTimes(1);
      expect(categoryRepositoryMock.applyTreeMoves).toHaveBeenCalledWith([
        { parentId: rootId, orderedIds: [childB, childA] },
      ]);
    });
  });

  // ─── PATCH /api/admin/categories/status (admin, TASK-293) ───────────────────

  describe('PATCH /api/admin/categories/status', () => {
    const rootId = '550e8400-e29b-41d4-a716-446655440000';
    const childA = '550e8400-e29b-41d4-a716-446655440001';

    const adminTreeNode = {
      id: rootId,
      name: 'Phone Cases',
      slug: 'phone-cases',
      description: null,
      image: null,
      parentId: null,
      isActive: false,
      sortOrder: 0,
      metaTitle: null,
      metaDescription: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      productCount: 3,
      subtreeProductCount: 3,
      depth: 1,
      children: [],
    };

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/categories/status')
        .send({ ids: [rootId], isActive: false })
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [rootId], isActive: false })
        .expect(403);
    });

    // The route-order trap: `status` must be matched by the bulk handler, never captured
    // as `:id` by `PATCH /:id/...`. A 404/400 "category not found: status" here would mean
    // the declaration order regressed.
    it('is matched by the bulk handler, not captured as an `:id`', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.setActiveMany.mockResolvedValue({
        tree: [adminTreeNode],
        updatedCount: 2,
      });

      const response = await request(app.getHttpServer())
        .patch('/api/admin/categories/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [rootId, childA], isActive: false })
        .expect(200);

      expect(response.body.data[0]).toMatchObject({ id: rootId, isActive: false });
      expect(categoryRepositoryMock.setActiveMany).toHaveBeenCalledWith([rootId, childA], false);
    });

    it('should return 400 on an empty id list', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [], isActive: true })
        .expect(400);

      expect(categoryRepositoryMock.setActiveMany).not.toHaveBeenCalled();
    });

    it('should return 400 when an id is not a uuid', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: ['not-a-uuid'], isActive: true })
        .expect(400);

      expect(categoryRepositoryMock.setActiveMany).not.toHaveBeenCalled();
    });

    it('should return 400 when isActive is missing', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [rootId] })
        .expect(400);

      expect(categoryRepositoryMock.setActiveMany).not.toHaveBeenCalled();
    });

    it('should return 404 when the batch names an unknown category', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.setActiveMany.mockRejectedValue(
        new CategoryNotFoundError(`Unknown category id(s): ${childA}`),
      );

      const response = await request(app.getHttpServer())
        .patch('/api/admin/categories/status')
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [rootId, childA], isActive: true })
        .expect(404);

      expect(response.body).toHaveProperty('error', 'CATEGORY_NOT_FOUND');
    });
  });

  // ─── PATCH /api/admin/categories/:id/deactivate (admin) ─────────────────────

  describe('PATCH /api/admin/categories/:id/deactivate', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/categories/some-id/deactivate')
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/some-id/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should deactivate category and return updated category for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue({
        ...testCategory,
        isActive: true,
      });
      categoryRepositoryMock.deactivate.mockResolvedValue({
        ...testCategory,
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .patch('/api/admin/categories/cat-e2e-1/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.isActive).toBe(false);
    });

    it('should return 404 when deactivating non-existent category', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/admin/categories/nonexistent-id/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── PATCH /api/admin/categories/:id/activate (admin) ────────────────────────

  describe('PATCH /api/admin/categories/:id/activate', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/categories/some-id/activate')
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/admin/categories/some-id/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should activate category and return updated category for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue({
        ...testCategory,
        isActive: false,
      });
      categoryRepositoryMock.activate.mockResolvedValue({
        ...testCategory,
        isActive: true,
      });

      const response = await request(app.getHttpServer())
        .patch('/api/admin/categories/cat-e2e-1/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.isActive).toBe(true);
    });

    it('should return 404 when activating non-existent category', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      categoryRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/admin/categories/nonexistent-id/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── DELETE /api/admin/categories/:id (TASK-654) ─────────────────────────────

  describe('DELETE /api/admin/categories/:id', () => {
    const TARGET_ID = '550e8400-e29b-41d4-a716-446655440000';
    const url = '/api/admin/categories/cat-e2e-1';
    const moveToId = { moveToId: TARGET_ID };
    const moveToNew = { moveToNew: { name: 'Інші аксесуари' } };
    const managerId = 'manager-e2e-1';

    beforeEach(() => {
      // The node and the target both exist; anything else is unknown.
      categoryRepositoryMock.findById.mockImplementation((id: string) =>
        Promise.resolve(
          id === testCategory.id
            ? testCategory
            : id === TARGET_ID
              ? { ...testCategory, id: TARGET_ID, slug: 'target' }
              : null,
        ),
      );
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);
      categoryRepositoryMock.deleteSubtreeWithMove.mockResolvedValue({
        targetId: TARGET_ID,
        targetCreated: false,
        subtreeIds: [testCategory.id],
        movedProducts: 3,
        switchedCarousels: 0,
      });
      // The post-commit subtree re-index is best-effort; give it something to walk.
      categoryRepositoryMock.findSubtreeIds.mockResolvedValue([TARGET_ID]);
    });

    afterEach(() => {
      // Managers hold nothing again, as in every other suite of this file.
      permissionRepositoryMock.setGrants('MANAGER', []);
    });

    it('returns 401 without an auth token', async () => {
      await request(app.getHttpServer()).delete(url).send(moveToId).expect(401);
    });

    it('returns 403 for a customer', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send(moveToId)
        .expect(403);
      expect(categoryRepositoryMock.deleteSubtreeWithMove).not.toHaveBeenCalled();
    });

    // The route's own key REPLACES the controller-wide `categories:write` — editing
    // categories is not a licence to delete a branch and move its products.
    it('returns 403 for a manager who holds only categories:write', async () => {
      permissionRepositoryMock.setGrants('MANAGER', ['categories:write']);
      const token = generateAccessToken(managerId, 'MANAGER');

      await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send(moveToId)
        .expect(403);
      expect(categoryRepositoryMock.deleteSubtreeWithMove).not.toHaveBeenCalled();
    });

    it('returns 200 for a manager with categories:delete moving into an existing category', async () => {
      permissionRepositoryMock.setGrants('MANAGER', ['categories:delete']);
      const token = generateAccessToken(managerId, 'MANAGER');

      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send(moveToId)
        .expect(200);
      // TASK-1775: what the delete did, counted in its own transaction — nothing else.
      expect(response.body).toEqual({
        data: { targetId: TARGET_ID, movedProducts: 3, switchedCarousels: 0 },
      });
      expect(categoryRepositoryMock.deleteSubtreeWithMove).toHaveBeenCalledWith(testCategory.id, {
        kind: 'existing',
        id: TARGET_ID,
        allowHidden: false,
      });
    });

    // TASK-1837: a hidden target takes the moved products off the storefront — the
    // repository refuses it under the lock unless the request carries the consent flag.
    describe('hidden move target', () => {
      it('returns 409 CATEGORY_MOVE_TARGET_HIDDEN without allowHiddenTarget', async () => {
        const token = generateAccessToken(testAdmin.id, 'ADMIN');
        categoryRepositoryMock.deleteSubtreeWithMove.mockRejectedValue(
          new CategoryMoveTargetHiddenError(),
        );

        const response = await request(app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${token}`)
          .send(moveToId)
          .expect(409);
        expect(response.body).toHaveProperty('error', 'CATEGORY_MOVE_TARGET_HIDDEN');
        expect(response.body).toHaveProperty('statusCode', 409);
      });

      it('returns 200 with allowHiddenTarget: true and passes the consent on', async () => {
        const token = generateAccessToken(testAdmin.id, 'ADMIN');

        await request(app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${token}`)
          .send({ ...moveToId, allowHiddenTarget: true })
          .expect(200);
        expect(categoryRepositoryMock.deleteSubtreeWithMove).toHaveBeenCalledWith(testCategory.id, {
          kind: 'existing',
          id: TARGET_ID,
          allowHidden: true,
        });
      });

      it('returns 400 for a non-boolean allowHiddenTarget — a string is not consent', async () => {
        const token = generateAccessToken(testAdmin.id, 'ADMIN');

        await request(app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${token}`)
          .send({ ...moveToId, allowHiddenTarget: 'false' })
          .expect(400);
        expect(categoryRepositoryMock.deleteSubtreeWithMove).not.toHaveBeenCalled();
      });
    });

    // Creating the target is a category WRITE: the delete key alone must not be a back
    // door to it. Checked in the service (it depends on the body), before any write.
    it('returns 403 for a manager with categories:delete but not categories:write in moveToNew mode', async () => {
      permissionRepositoryMock.setGrants('MANAGER', ['categories:delete']);
      const token = generateAccessToken(managerId, 'MANAGER');

      await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send(moveToNew)
        .expect(403);
      expect(categoryRepositoryMock.deleteSubtreeWithMove).not.toHaveBeenCalled();
    });

    it('returns 200 for a manager holding both keys in moveToNew mode', async () => {
      permissionRepositoryMock.setGrants('MANAGER', ['categories:delete', 'categories:write']);
      const token = generateAccessToken(managerId, 'MANAGER');

      await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send(moveToNew)
        .expect(200);
      expect(categoryRepositoryMock.deleteSubtreeWithMove).toHaveBeenCalledWith(
        testCategory.id,
        expect.objectContaining({ kind: 'new', name: 'Інші аксесуари', parentId: null }),
      );
    });

    // TASK-1775: the dialog learns the id of the target it asked the server to create —
    // no more re-reading the tree to find it by a slug guessed from the name.
    it('returns 200 with the CREATED target id and the real counts in moveToNew mode', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      categoryRepositoryMock.deleteSubtreeWithMove.mockResolvedValue({
        targetId: 'created-target-id',
        targetCreated: true,
        subtreeIds: [testCategory.id, 'child-id'],
        movedProducts: 7,
        switchedCarousels: 2,
      });

      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send(moveToNew)
        .expect(200);
      // Exactly the three fields — the tombstoned ids and targetCreated stay internal.
      expect(response.body).toEqual({
        data: { targetId: 'created-target-id', movedProducts: 7, switchedCarousels: 2 },
      });
    });

    it('returns 400 CATEGORY_MOVE_TARGET_REQUIRED for both modes', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ ...moveToId, ...moveToNew })
        .expect(400);
      expect(response.body).toHaveProperty('error', 'CATEGORY_MOVE_TARGET_REQUIRED');
      expect(categoryRepositoryMock.deleteSubtreeWithMove).not.toHaveBeenCalled();
    });

    // TASK-655 (ДН-2.9): neither mode is a target-less delete of a truly empty category.
    // Emptiness is decided by the repository under its locks.
    describe('neither mode (target-less delete)', () => {
      beforeEach(() => {
        categoryRepositoryMock.deleteSubtreeWithMove.mockResolvedValue({
          targetId: null,
          targetCreated: false,
          subtreeIds: [testCategory.id],
          movedProducts: 0,
          switchedCarousels: 0,
        });
      });

      it.each([
        ['an empty JSON body', (req: request.Test) => req.send({})],
        ['no body at all', (req: request.Test) => req],
      ])('returns 200 for %s and passes kind "none"', async (_label, withBody) => {
        const token = generateAccessToken(testAdmin.id, 'ADMIN');

        const response = await withBody(
          request(app.getHttpServer()).delete(url).set('Authorization', `Bearer ${token}`),
        ).expect(200);
        // Nothing moved, so there is no target (TASK-1775).
        expect(response.body).toEqual({
          data: { targetId: null, movedProducts: 0, switchedCarousels: 0 },
        });
        expect(categoryRepositoryMock.deleteSubtreeWithMove).toHaveBeenCalledWith(testCategory.id, {
          kind: 'none',
        });
      });

      // Nothing is created, so `categories:delete` alone is enough.
      it('returns 200 for a manager holding only categories:delete', async () => {
        permissionRepositoryMock.setGrants('MANAGER', ['categories:delete']);
        const token = generateAccessToken(managerId, 'MANAGER');

        await request(app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(200);
      });

      it('returns 400 CATEGORY_MOVE_TARGET_REQUIRED when the category is not empty', async () => {
        const token = generateAccessToken(testAdmin.id, 'ADMIN');
        categoryRepositoryMock.deleteSubtreeWithMove.mockRejectedValue(
          new CategoryMoveTargetRequiredError(),
        );

        const response = await request(app.getHttpServer())
          .delete(url)
          .set('Authorization', `Bearer ${token}`)
          .send({})
          .expect(400);
        expect(response.body).toHaveProperty('error', 'CATEGORY_MOVE_TARGET_REQUIRED');
      });
    });

    it('returns 400 CATEGORY_MOVE_TARGET_IN_SUBTREE when the target is inside the subtree', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      categoryRepositoryMock.deleteSubtreeWithMove.mockRejectedValue(
        new CategoryMoveTargetInSubtreeError(),
      );

      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send(moveToId)
        .expect(400);
      expect(response.body).toHaveProperty('error', 'CATEGORY_MOVE_TARGET_IN_SUBTREE');
    });

    it('returns 400 for an invalid body (non-UUID target, empty new name)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ moveToId: 'not-a-uuid' })
        .expect(400);
      await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ moveToNew: { name: '   ' } })
        .expect(400);
      expect(categoryRepositoryMock.deleteSubtreeWithMove).not.toHaveBeenCalled();
    });

    it('returns 404 CATEGORY_MOVE_TARGET_NOT_FOUND for an unknown target', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      const response = await request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${token}`)
        .send({ moveToId: '650e8400-e29b-41d4-a716-446655440000' })
        .expect(404);
      expect(response.body).toHaveProperty('error', 'CATEGORY_MOVE_TARGET_NOT_FOUND');
    });

    it('returns 404 for an unknown category', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .delete('/api/admin/categories/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .send(moveToId)
        .expect(404);
    });
  });
});
