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
import { ProductRepository, ProductsNotFoundError } from '../src/product/product.repository';
import { CategoryRepository } from '../src/category/category.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the Product module.
 *
 * Uses mocked AuthRepository, UserRepository, ProductRepository, and PrismaService
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

describe('ProductController (e2e)', () => {
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

  // Mock ProductRepository — for product management
  const productRepositoryMock = {
    findById: jest.fn(),
    findBySlug: jest.fn(),
    findBySku: jest.fn(),
    findBySlugWithRelations: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
    setActiveMany: jest.fn(),
    // TASK-254: adminFindAll/findById/preview enrich with the derived reserved
    // aggregate; default to an empty map (no reservations) for these mocked reads.
    getReservedQtyByProductId: jest.fn().mockResolvedValue(new Map<string, number>()),
  };

  // Mock CategoryRepository — ProductService depends on it for the TASK-236
  // subtree rollup. `findSubtreeIds` echoes the requested id as a single-element
  // subtree so the (mocked) ProductRepository receives a well-formed id list.
  const categoryRepositoryMock = {
    findSubtreeIds: jest.fn((id: string) => Promise.resolve([id])),
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
    // The public PDP hydrates device compatibility (TASK-190) via the real
    // ProductDeviceCompatRepository; default to no compat rows so the detail
    // path resolves cleanly with an empty `compatibleDeviceModels`.
    productDeviceCompat: {
      findMany: jest.fn().mockResolvedValue([]),
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

  const testProduct = {
    id: 'product-e2e-1',
    name: 'iPhone 15 Pro Case — Clear MagSafe',
    slug: 'iphone-15-pro-case-clear-magsafe',
    description: 'Premium clear case with MagSafe compatibility',
    price: { toString: () => '29.99' },
    compareAtPrice: { toString: () => '39.99' },
    sku: 'IP15-PRO-CASE-CLR',
    categoryId: 'category-e2e-1',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const testProductWithRelations = {
    ...testProduct,
    category: { id: 'category-e2e-1', name: 'Phone Cases', slug: 'phone-cases' },
    group: null,
    images: [],
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
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(ProductRepository)
      .useValue(productRepositoryMock)
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

    app.setGlobalPrefix('api', {
      exclude: ['health'],
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Reset mocks between tests
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /api/products (public) ──────────────────────────────────────────────

  describe('GET /api/products', () => {
    it('should return 200 with paginated product list (no auth required)', async () => {
      productRepositoryMock.findAll.mockResolvedValue({
        products: [testProduct],
        total: 1,
      });

      const response = await request(app.getHttpServer()).get('/api/products').expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('limit');
      expect(response.body.meta).toHaveProperty('totalPages');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should pass query parameters for filtering', async () => {
      productRepositoryMock.findAll.mockResolvedValue({
        products: [testProduct],
        total: 1,
      });

      const response = await request(app.getHttpServer())
        .get(
          '/api/products?categoryId=550e8400-e29b-41d4-a716-446655440000&isActive=true&search=iphone&page=1&limit=10',
        )
        .expect(200);

      expect(response.body).toHaveProperty('data');
      // TASK-236: the single categoryId is resolved to its subtree id list
      // before hitting the repository (here a single-element subtree from the
      // mock). The rollup itself is proven in product-rollup.int-spec.ts.
      expect(categoryRepositoryMock.findSubtreeIds).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryIds: ['550e8400-e29b-41d4-a716-446655440000'],
          isActive: true,
          search: 'iphone',
          page: 1,
          limit: 10,
        }),
      );
    });

    // TASK-230: deactivated products leaked into the public list because the
    // service forwarded `isActive` as-is (undefined = no filter). The public
    // endpoint must be active-only whatever the caller sends. A unique search
    // term keeps these requests out of the (real) list cache shared across
    // tests — a cache HIT would skip the repository and void the assertion.
    it('forces the active-only filter when no isActive is sent (no inactive leak)', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await request(app.getHttpServer())
        .get(`/api/products?search=task230-default-${Date.now()}`)
        .expect(200);

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('overrides an explicit isActive=false from a public caller', async () => {
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await request(app.getHttpServer())
        .get(`/api/products?isActive=false&search=task230-override-${Date.now()}`)
        .expect(200);

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });
  });

  // ─── GET /api/products/admin/list (admin, TASK-230) ──────────────────────────

  describe('GET /api/products/admin/list', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).get('/api/products/admin/list').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/products/admin/list')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('lists ALL products (no isActive filter) for an admin by default', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      productRepositoryMock.findAll.mockResolvedValue({
        products: [{ ...testProduct, isActive: false }],
        total: 1,
      });

      const response = await request(app.getHttpServer())
        .get('/api/products/admin/list')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // The literal "list" segment must route here, not into admin/:id.
      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: undefined }),
      );
      expect(response.body.data[0].isActive).toBe(false);
    });

    it('respects an explicit isActive=false filter for an admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      productRepositoryMock.findAll.mockResolvedValue({ products: [], total: 0 });

      await request(app.getHttpServer())
        .get('/api/products/admin/list?isActive=false')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(productRepositoryMock.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  // ─── GET /api/products/:slug (public) ────────────────────────────────────────

  describe('GET /api/products/:slug', () => {
    it('should return 200 with product detail for valid slug', async () => {
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(testProductWithRelations);

      const response = await request(app.getHttpServer())
        .get('/api/products/iphone-15-pro-case-clear-magsafe')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('category');
      expect(response.body).toHaveProperty('group');
      expect(response.body).toHaveProperty('images');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('slug');
      expect(response.body.data).toHaveProperty('price');
    });

    it('should return 404 for non-existent slug', async () => {
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(null);

      await request(app.getHttpServer()).get('/api/products/nonexistent-slug').expect(404);
    });

    it('should return 404 when the repository returns null (deactivated or missing product) (TASK-145)', async () => {
      // After the guard fix, a deactivated product's slug resolves to null in the
      // repository (isActive: true filter), so the endpoint must return 404 —
      // identical to a missing slug, leaking nothing about the hidden product.
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(null);

      await request(app.getHttpServer()).get('/api/products/discontinued-case').expect(404);
    });

    it('should return 200 for an active product slug (TASK-145 regression guard)', async () => {
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(testProductWithRelations);

      const response = await request(app.getHttpServer())
        .get('/api/products/iphone-15-pro-case-clear-magsafe')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('slug');
    });
  });

  // ─── GET /api/products/admin/preview/:slug (admin) ───────────────────────────

  describe('GET /api/products/admin/preview/:slug', () => {
    const inactiveProductWithRelations = {
      ...testProduct,
      id: 'product-e2e-inactive',
      name: 'Discontinued Case',
      slug: 'discontinued-case',
      stock: 0,
      groupId: null,
      attributes: {},
      positionOrder: 0,
      isActive: false,
      category: { id: 'category-e2e-1', name: 'Phone Cases', slug: 'phone-cases' },
      group: null,
      images: [],
    };

    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/products/admin/preview/discontinued-case')
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/products/admin/preview/discontinued-case')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 200 with full detail for a deactivated product (admin)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(inactiveProductWithRelations);

      const response = await request(app.getHttpServer())
        .get('/api/products/admin/preview/discontinued-case')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('category');
      expect(response.body).toHaveProperty('group');
      expect(response.body).toHaveProperty('images');
      expect(response.body.data.slug).toBe('discontinued-case');
      expect(response.body.data.isActive).toBe(false);
      // The "preview" string must route to this handler, not to admin/:id.
      expect(productRepositoryMock.findBySlugWithRelations).toHaveBeenCalledWith(
        'discontinued-case',
        {
          activeOnly: false,
        },
      );
    });

    it('should return 404 when the repository returns null (admin)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      productRepositoryMock.findBySlugWithRelations.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/products/admin/preview/missing-slug')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── POST /api/products (admin) ──────────────────────────────────────────────

  describe('POST /api/products', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post('/api/products')
        .send({
          name: 'New Product',
          price: 29.99,
          categoryId: 'category-uuid-1',
        })
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New Product',
          price: 29.99,
          categoryId: 'category-uuid-1',
        })
        .expect(403);
    });

    it('should create a product and return 201 for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue(testProduct);

      const response = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'iPhone 15 Pro Case — Clear MagSafe',
          slug: 'iphone-15-pro-case-clear-magsafe',
          price: 29.99,
          compareAtPrice: 39.99,
          sku: 'IP15-PRO-CASE-CLR',
          categoryId: '550e8400-e29b-41d4-a716-446655440000',
        })
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('slug');
    });

    it('accepts and persists metaTitle/metaDescription (TASK-241)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findBySlug.mockResolvedValue(null);
      productRepositoryMock.create.mockResolvedValue({
        ...testProduct,
        metaTitle: 'Clear MagSafe Case | Store',
        metaDescription: 'MagSafe-ready clear case for iPhone 15 Pro.',
      });

      const response = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'iPhone 15 Pro Case — Clear MagSafe',
          slug: 'iphone-15-pro-case-clear-magsafe',
          price: 29.99,
          categoryId: '550e8400-e29b-41d4-a716-446655440000',
          metaTitle: 'Clear MagSafe Case | Store',
          metaDescription: 'MagSafe-ready clear case for iPhone 15 Pro.',
        })
        .expect(201);

      expect(productRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metaTitle: 'Clear MagSafe Case | Store',
          metaDescription: 'MagSafe-ready clear case for iPhone 15 Pro.',
        }),
      );
      expect(response.body.data.metaTitle).toBe('Clear MagSafe Case | Store');
      expect(response.body.data.metaDescription).toBe(
        'MagSafe-ready clear case for iPhone 15 Pro.',
      );
    });

    it('should return 409 when slug is already taken', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findBySlug.mockResolvedValue(testProduct);

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Duplicate Product',
          slug: 'iphone-15-pro-case-clear-magsafe',
          price: 19.99,
          categoryId: '550e8400-e29b-41d4-a716-446655440000',
        })
        .expect(409);
    });

    it('should return 400 when required fields are missing', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Missing required fields' })
        .expect(400);
    });
  });

  // ─── PUT /api/products/:id (admin) ───────────────────────────────────────────

  describe('PUT /api/products/:id', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .put('/api/products/product-e2e-1')
        .send({ name: 'Updated Name' })
        .expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .put('/api/products/product-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(403);
    });

    it('should update a product and return updated product for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue(testProduct);
      productRepositoryMock.update.mockResolvedValue({
        ...testProduct,
        name: 'Updated Product Name',
        updatedAt: new Date('2026-05-05T12:00:00.000Z'),
      });

      const response = await request(app.getHttpServer())
        .put('/api/products/product-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Product Name' })
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.name).toBe('Updated Product Name');
    });

    it('should return 404 when product is not found', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .put('/api/products/nonexistent-id')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name' })
        .expect(404);
    });

    it('should return 409 when updating slug to one already taken', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue(testProduct);
      productRepositoryMock.findBySlug.mockResolvedValue({
        ...testProduct,
        id: 'other-product-id',
        slug: 'taken-slug',
      });

      await request(app.getHttpServer())
        .put('/api/products/product-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ slug: 'taken-slug' })
        .expect(409);
    });

    // TASK-397. The admin form round-trips the ids it was given: it reads
    // categoryId/groupId/brandId out of the product it just fetched and sends
    // them straight back. When the DTO pinned `@IsUUID(4)` any row whose id was
    // not specifically a v4 — every seeded ProductGroup, because the seed's
    // `deterministicUuid` never set the version nibble — made "save" answer 400
    // with no way for the operator to save the product at all.
    //
    // The pin is now `'loose'` at all 33 `@IsUUID` sites, not the `'all'` default:
    // `'all'` still demands a version nibble in `[1-8]` and a variant in `[89ab]`
    // (node_modules/validator/lib/isUUID.js), and only 11% of the ids the old seed
    // wrote satisfy that — so `'all'` would have left the 400 in place on the
    // database as it stands today. `SEED_SHAPED_GROUP_ID` below is deliberately
    // outside `[1-8]`/`[89ab]`: it passes `'loose'` and fails `'all'`.
    const SEED_SHAPED_GROUP_ID = 'aaaaaaaa-bbbb-0ccc-0ddd-eeeeeeeeeeee';

    it('accepts a non-v4 groupId that already exists in the database (TASK-397)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      // A well-formed UUID whose version nibble is 1, not 4.
      const nonV4GroupId = '11f6ad8e-c52a-11d4-abaa-fd7c3b516503';

      productRepositoryMock.findById.mockResolvedValue({
        ...testProduct,
        groupId: nonV4GroupId,
      });
      productRepositoryMock.update.mockResolvedValue({
        ...testProduct,
        groupId: nonV4GroupId,
        name: 'Updated Product Name',
      });

      const response = await request(app.getHttpServer())
        .put('/api/products/product-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Product Name', groupId: nonV4GroupId })
        .expect(200);

      expect(response.body.data.name).toBe('Updated Product Name');
      // Read positionally rather than with toHaveBeenCalledWith: the service
      // passes a third `slugRename` argument, so a two-argument expectation would
      // fail on the arity instead of on the id under test.
      const [updatedId, updatePayload] = productRepositoryMock.update.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(updatedId).toBe('product-e2e-1');
      expect(updatePayload).toEqual(expect.objectContaining({ groupId: nonV4GroupId }));
    });

    it('accepts a seed-shaped groupId whose version nibble is outside [1-8] (TASK-397)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue({
        ...testProduct,
        groupId: SEED_SHAPED_GROUP_ID,
      });
      productRepositoryMock.update.mockResolvedValue({
        ...testProduct,
        groupId: SEED_SHAPED_GROUP_ID,
        name: 'Updated Product Name',
      });

      const response = await request(app.getHttpServer())
        .put('/api/products/product-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Product Name', groupId: SEED_SHAPED_GROUP_ID })
        .expect(200);

      expect(response.body.data.name).toBe('Updated Product Name');
      const [, updatePayload] = productRepositoryMock.update.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(updatePayload).toEqual(expect.objectContaining({ groupId: SEED_SHAPED_GROUP_ID }));
    });

    // The second half of the TASK-397 acceptance run: "lower the quantity and
    // save". It is the same PUT with the same round-tripped groupId, so it failed
    // for the same reason — worth its own case because stock is what the operator
    // actually edits day to day.
    it('saves a lower stock alongside the seed-shaped groupId (TASK-397)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue({
        ...testProduct,
        groupId: SEED_SHAPED_GROUP_ID,
        stock: 12,
      });
      productRepositoryMock.update.mockResolvedValue({
        ...testProduct,
        groupId: SEED_SHAPED_GROUP_ID,
        stock: 3,
      });

      const response = await request(app.getHttpServer())
        .put('/api/products/product-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ stock: 3, groupId: SEED_SHAPED_GROUP_ID })
        .expect(200);

      expect(response.body.data.stock).toBe(3);
      const [, updatePayload] = productRepositoryMock.update.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(updatePayload).toEqual(
        expect.objectContaining({ stock: 3, groupId: SEED_SHAPED_GROUP_ID }),
      );
    });

    it('still rejects an id that is not a UUID at all (TASK-397)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue(testProduct);

      const response = await request(app.getHttpServer())
        .put('/api/products/product-e2e-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ groupId: 'not-a-uuid' })
        .expect(400);

      expect(JSON.stringify(response.body.message)).toContain('Group ID must be a valid UUID');
      expect(productRepositoryMock.update).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /api/products/:id/deactivate (admin) ─────────────────────────────

  // ─── PATCH /api/products/status (bulk, admin, TASK-355) ─────────────────────

  describe('PATCH /api/products/status', () => {
    const bulkUrl = '/api/products/status';

    it('is not shadowed by the :id routes — `status` reaches the bulk handler', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      productRepositoryMock.setActiveMany.mockResolvedValue([
        { id: '11111111-1111-4111-8111-111111111111', slug: 'a', isActive: false },
      ]);

      const response = await request(app.getHttpServer())
        .patch(bulkUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: ['11111111-1111-4111-8111-111111111111'], isActive: false })
        .expect(200);

      expect(response.body.data.updatedCount).toBe(1);
      expect(productRepositoryMock.setActiveMany).toHaveBeenCalled();
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .patch(bulkUrl)
        .send({ ids: ['11111111-1111-4111-8111-111111111111'], isActive: true })
        .expect(401);
    });

    it('returns 403 for a customer', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch(bulkUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: ['11111111-1111-4111-8111-111111111111'], isActive: true })
        .expect(403);
    });

    it('rejects an empty id list rather than writing nothing silently', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch(bulkUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [], isActive: true })
        .expect(400);

      expect(productRepositoryMock.setActiveMany).not.toHaveBeenCalled();
    });

    it('rejects a repeated id instead of 404ing on a product that exists', async () => {
      // Prisma's `id: { in: }` collapses duplicates, so the repository's
      // found-vs-asked count check would read `[X, X]` as one missing id and
      // abort the whole batch with a 404 that names no ids at all.
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      const id = '11111111-1111-4111-8111-111111111111';

      await request(app.getHttpServer())
        .patch(bulkUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: [id, id], isActive: true })
        .expect(400);

      expect(productRepositoryMock.setActiveMany).not.toHaveBeenCalled();
    });

    it('rejects non-UUID ids', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch(bulkUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({ ids: ['not-a-uuid'], isActive: true })
        .expect(400);

      expect(productRepositoryMock.setActiveMany).not.toHaveBeenCalled();
    });

    it('rejects an unknown id with 404 — the batch is all-or-nothing', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      productRepositoryMock.setActiveMany.mockRejectedValue(
        new ProductsNotFoundError(['22222222-2222-4222-8222-222222222222']),
      );

      await request(app.getHttpServer())
        .patch(bulkUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({
          ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
          isActive: false,
        })
        .expect(404);
    });

    it('rejects an unexpected extra field (global forbidNonWhitelisted)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch(bulkUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({
          ids: ['11111111-1111-4111-8111-111111111111'],
          isActive: true,
          cascade: true,
        })
        .expect(400);
    });
  });

  describe('PATCH /api/products/:id/deactivate', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).patch('/api/products/some-id/deactivate').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/products/some-id/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should deactivate product and return updated product for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue({
        ...testProduct,
        id: 'product-to-deactivate',
        isActive: true,
      });
      productRepositoryMock.deactivate.mockResolvedValue({
        ...testProduct,
        id: 'product-to-deactivate',
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .patch('/api/products/product-to-deactivate/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.isActive).toBe(false);
    });

    it('should return 404 when deactivating non-existent product', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/products/nonexistent-id/deactivate')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  // ─── PATCH /api/products/:id/activate (admin) ───────────────────────────────

  describe('PATCH /api/products/:id/activate', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer()).patch('/api/products/some-id/activate').expect(401);
    });

    it('should return 403 for non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/products/some-id/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should activate product and return updated product for admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue({
        ...testProduct,
        id: 'product-to-activate',
        isActive: false,
      });
      productRepositoryMock.activate.mockResolvedValue({
        ...testProduct,
        id: 'product-to-activate',
        isActive: true,
      });

      const response = await request(app.getHttpServer())
        .patch('/api/products/product-to-activate/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data.isActive).toBe(true);
    });

    it('should return 404 when activating non-existent product', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      productRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .patch('/api/products/nonexistent-id/activate')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
