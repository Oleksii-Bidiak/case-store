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
import { CategoryCycleError } from '../src/category/category.errors';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';

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
    findSubtreeIds: jest.fn(),
  };

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
  });

  // ─── GET /api/categories/:slug (public) ─────────────────────────────────────

  describe('GET /api/categories/:slug', () => {
    it('should return 200 with category and product count', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(testCategory);
      categoryRepositoryMock.findWithProductCount.mockResolvedValue({
        category: testCategory,
        productCount: 5,
      });

      const response = await request(app.getHttpServer())
        .get('/api/categories/phone-cases')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('productCount');
      expect(response.body.data).toHaveProperty('name', 'Phone Cases');
      expect(response.body.data).toHaveProperty('slug', 'phone-cases');
      expect(response.body.productCount).toBe(5);
    });

    it('should return 404 for non-existent slug', async () => {
      categoryRepositoryMock.findBySlug.mockResolvedValue(null);

      await request(app.getHttpServer()).get('/api/categories/nonexistent-slug').expect(404);
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
          { category: testCategory, productCount: 5 },
          { category: testChildCategory, productCount: 3 },
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

      const response = await request(app.getHttpServer())
        .get('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name', 'Phone Cases');
      expect(response.body.data).toHaveProperty('slug', 'phone-cases');
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

      categoryRepositoryMock.findById.mockResolvedValue(testCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(testCategory);
      categoryRepositoryMock.findById.mockResolvedValueOnce(testChildCategory);
      categoryRepositoryMock.findDescendantIds.mockResolvedValue(['cat-e2e-2']);

      await request(app.getHttpServer())
        .put('/api/admin/categories/cat-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ parentId: 'cat-e2e-2' })
        .expect(400);
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
});
