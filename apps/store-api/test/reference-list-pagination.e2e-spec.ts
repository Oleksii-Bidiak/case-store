import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { BannerPlacement, PublishStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { BannerRepository } from '../src/banners/banners.repository';
import { BlogRepository } from '../src/blog/blog.repository';
import { DeviceRepository } from '../src/device/device.repository';
import { ProductGroupRepository } from '../src/product-group/product-group.repository';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the reference-list pagination added in TASK-357:
 *
 *   GET /api/admin/banners
 *   GET /api/admin/blog/categories
 *   GET /api/admin/devices/brands
 *   GET /api/product-groups
 *
 * Two things are under test, and the SECOND one is the reason this file exists.
 *
 * 1. `page` / `limit` / `search` reach the repository and come back with honest `meta`.
 *
 * 2. THE DEFAULT RESPONSE IS UNCHANGED. Every one of these four lists has a consumer that
 *    needs the COMPLETE set, and paginating by default would have broken it silently:
 *    the storefront homepage reads published banners and groups them by placement; the
 *    blog hub renders the whole category strip; the banner / blog-category / device-brand
 *    admin views are drag-and-drop reorderable and their reorder payload must name EVERY
 *    row of the bucket or the server 409s it as a lost update; and the product form's
 *    group picker fills a `<select>` from the group list. So the contract is: absence of
 *    `page` AND `limit` means "return everything", and these tests are what holds it.
 *
 * Repositories are mocked — no database. What is under test is the HTTP contract.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Reference-list pagination (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const idA = '550e8400-e29b-41d4-a716-446655440001';

  const authRepositoryMock = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    createUser: jest.fn(),
    findRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
    revokeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
  };

  const userRepositoryMock = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
  };

  const bannerRepositoryMock = {
    findAllPublished: jest.fn(),
    findAllAdmin: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
    delete: jest.fn(),
    publishDue: jest.fn(),
    reorderPlacement: jest.fn(),
    revalidateTarget: { tags: ['banners'], paths: ['/'] },
  };

  const blogRepositoryMock = {
    findAll: jest.fn(),
    findPublishedBySlug: jest.fn(),
    findAllAdmin: jest.fn(),
    findById: jest.fn(),
    findBySlugAny: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findAllCategories: jest.fn(),
    findAllCategoriesAdmin: jest.fn(),
    findCategoryById: jest.fn(),
    findCategoryBySlugAny: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
    countPostsInCategory: jest.fn(),
    reorderCategories: jest.fn(),
    publishDue: jest.fn(),
    revalidateTarget: { tags: ['blog'], paths: ['/blog'] },
  };

  const deviceRepositoryMock = {
    findBrands: jest.fn(),
    findBrandsWithCount: jest.fn(),
    findBrandById: jest.fn(),
    findBrandBySlug: jest.fn(),
    createBrand: jest.fn(),
    updateBrand: jest.fn(),
    findModels: jest.fn(),
    findModelById: jest.fn(),
    findModelBySlug: jest.fn(),
    findModelsByIds: jest.fn(),
    createModel: jest.fn(),
    updateModel: jest.fn(),
    reorderBrands: jest.fn(),
  };

  const productGroupRepositoryMock = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const bannerRow = {
    id: idA,
    placement: BannerPlacement.HERO_SLIDE,
    title: 'Summer Sale',
    subtitle: null,
    imageUrl: null,
    imageBlurDataUrl: null,
    ctaLabel: null,
    ctaHref: null,
    theme: null,
    sortOrder: 0,
    status: PublishStatus.PUBLISHED,
    publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    scheduledAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  const blogCategoryRow = {
    id: idA,
    slug: 'guides',
    name: 'Гайди',
    sortOrder: 0,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  const brandRow = {
    brand: { id: idA, name: 'Apple', slug: 'apple', isActive: true, sortOrder: 0 },
    modelCount: 7,
  };

  const groupRow = {
    id: idA,
    name: 'iPhone 15 cases',
    isActive: true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    axes: [{ name: 'Колір', sortOrder: 0 }],
    _count: { positions: 3 },
  };

  function adminToken(): string {
    return jwtService.sign(
      { sub: 'admin-e2e-1', email: 'admin-e2e-1@example.com', role: 'ADMIN' },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
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
      .overrideProvider(BannerRepository)
      .useValue(bannerRepositoryMock)
      .overrideProvider(BlogRepository)
      .useValue(blogRepositoryMock)
      .overrideProvider(DeviceRepository)
      .useValue(deviceRepositoryMock)
      .overrideProvider(ProductGroupRepository)
      .useValue(productGroupRepositoryMock)
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
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api', { exclude: ['health'] });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── GET /api/admin/banners ─────────────────────────────────────────────────

  describe('GET /api/admin/banners', () => {
    it('returns the COMPLETE list with single-page meta when page/limit are omitted', async () => {
      bannerRepositoryMock.findAllAdmin.mockResolvedValue({ banners: [bannerRow], total: 1 });

      const response = await request(app.getHttpServer())
        .get('/api/admin/banners')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(bannerRepositoryMock.findAllAdmin).toHaveBeenCalledWith({
        placement: undefined,
        status: undefined,
        page: undefined,
        limit: undefined,
        search: undefined,
      });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
    });

    it('forwards page, limit and search and reports the requested page', async () => {
      bannerRepositoryMock.findAllAdmin.mockResolvedValue({ banners: [bannerRow], total: 12 });

      const response = await request(app.getHttpServer())
        .get('/api/admin/banners?page=2&limit=5&search=sale')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(bannerRepositoryMock.findAllAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 5, search: 'sale' }),
      );
      expect(response.body.meta).toEqual({ total: 12, page: 2, limit: 5, totalPages: 3 });
    });

    it('rejects page = 0 with a 400 instead of computing a negative offset', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/banners?page=0')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);

      expect(bannerRepositoryMock.findAllAdmin).not.toHaveBeenCalled();
    });

    // THE TRAP. `/api/banners` is read server-side by the storefront homepage, which groups
    // the whole published set by placement. `page`/`limit` were added to the ADMIN subclass
    // only, so `forbidNonWhitelisted` rejects them here — the public read cannot start
    // paginating by accident.
    it('leaves the PUBLIC banner route unpaginated — ?page= is a 400 there', async () => {
      await request(app.getHttpServer()).get('/api/banners?page=2').expect(400);

      expect(bannerRepositoryMock.findAllPublished).not.toHaveBeenCalled();
    });

    it('still returns every published banner on the default public request', async () => {
      bannerRepositoryMock.findAllPublished.mockResolvedValue([bannerRow]);

      const response = await request(app.getHttpServer()).get('/api/banners').expect(200);

      expect(bannerRepositoryMock.findAllPublished).toHaveBeenCalledWith({ placement: undefined });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toBeUndefined();
    });
  });

  // ─── GET /api/admin/blog/categories ─────────────────────────────────────────

  describe('GET /api/admin/blog/categories', () => {
    it('returns the COMPLETE list with single-page meta when page/limit are omitted', async () => {
      blogRepositoryMock.findAllCategoriesAdmin.mockResolvedValue({
        categories: [blogCategoryRow],
        total: 1,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/blog/categories')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
    });

    it('forwards page, limit and search', async () => {
      blogRepositoryMock.findAllCategoriesAdmin.mockResolvedValue({
        categories: [blogCategoryRow],
        total: 9,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/blog/categories?page=2&limit=4&search=guide')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(blogRepositoryMock.findAllCategoriesAdmin).toHaveBeenCalledWith({
        page: 2,
        limit: 4,
        search: 'guide',
      });
      expect(response.body.meta).toEqual({ total: 9, page: 2, limit: 4, totalPages: 3 });
    });

    // Route-order guard: `categories/reorder` is declared BEFORE `categories/:id`. A query
    // string on the LIST route must not tempt the router into a different handler either.
    it('does not touch the single-category read when listing with a query', async () => {
      blogRepositoryMock.findAllCategoriesAdmin.mockResolvedValue({ categories: [], total: 0 });

      await request(app.getHttpServer())
        .get('/api/admin/blog/categories?limit=5')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(blogRepositoryMock.findCategoryById).not.toHaveBeenCalled();
    });

    // The blog hub renders the complete category strip, so the public read stays whole.
    it('leaves the PUBLIC category route unpaginated', async () => {
      blogRepositoryMock.findAllCategories.mockResolvedValue([blogCategoryRow]);

      const response = await request(app.getHttpServer()).get('/api/blog/categories').expect(200);

      expect(blogRepositoryMock.findAllCategories).toHaveBeenCalled();
      expect(blogRepositoryMock.findAllCategoriesAdmin).not.toHaveBeenCalled();
      expect(response.body.meta).toBeUndefined();
    });
  });

  // ─── GET /api/admin/devices/brands ──────────────────────────────────────────

  describe('GET /api/admin/devices/brands', () => {
    it('returns the COMPLETE list with single-page meta when page/limit are omitted', async () => {
      deviceRepositoryMock.findBrandsWithCount.mockResolvedValue({ brands: [brandRow], total: 1 });

      const response = await request(app.getHttpServer())
        .get('/api/admin/devices/brands')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(deviceRepositoryMock.findBrandsWithCount).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        search: undefined,
      });
      expect(response.body.data[0]).toMatchObject({ id: idA, modelCount: 7 });
      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
    });

    it('forwards page, limit and search', async () => {
      deviceRepositoryMock.findBrandsWithCount.mockResolvedValue({ brands: [brandRow], total: 11 });

      const response = await request(app.getHttpServer())
        .get('/api/admin/devices/brands?page=2&limit=5&search=app')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(deviceRepositoryMock.findBrandsWithCount).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        search: 'app',
      });
      expect(response.body.meta).toEqual({ total: 11, page: 2, limit: 5, totalPages: 3 });
    });

    it('rejects an unknown query field with a 400 (whitelist is on)', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/devices/brands?sortBy=name')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);

      expect(deviceRepositoryMock.findBrandsWithCount).not.toHaveBeenCalled();
    });

    // The public cascade picker reads ACTIVE brands through its own route, untouched here.
    it('leaves the PUBLIC brand cascade on its own unpaginated read', async () => {
      deviceRepositoryMock.findBrands.mockResolvedValue([brandRow.brand]);

      const response = await request(app.getHttpServer()).get('/api/device-brands').expect(200);

      expect(deviceRepositoryMock.findBrands).toHaveBeenCalledWith(true);
      expect(deviceRepositoryMock.findBrandsWithCount).not.toHaveBeenCalled();
      expect(response.body.data).toHaveLength(1);
    });
  });

  // ─── GET /api/product-groups ────────────────────────────────────────────────

  describe('GET /api/product-groups', () => {
    it('returns the COMPLETE list with single-page meta when page/limit are omitted', async () => {
      productGroupRepositoryMock.findAll.mockResolvedValue({ groups: [groupRow], total: 1 });

      const response = await request(app.getHttpServer())
        .get('/api/product-groups')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(productGroupRepositoryMock.findAll).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        search: undefined,
      });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
    });

    it('forwards page, limit and search', async () => {
      productGroupRepositoryMock.findAll.mockResolvedValue({ groups: [groupRow], total: 8 });

      const response = await request(app.getHttpServer())
        .get('/api/product-groups?page=2&limit=3&search=iphone')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(productGroupRepositoryMock.findAll).toHaveBeenCalledWith({
        page: 2,
        limit: 3,
        search: 'iphone',
      });
      expect(response.body.meta).toEqual({ total: 8, page: 2, limit: 3, totalPages: 3 });
    });

    it('rejects a limit above the cap with a 400 rather than clamping it silently', async () => {
      await request(app.getHttpServer())
        .get('/api/product-groups?limit=1000')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);

      expect(productGroupRepositoryMock.findAll).not.toHaveBeenCalled();
    });

    // Route-order guard: the list route must not be swallowed by `GET :id`.
    it('is matched by the list handler, NOT captured as an :id route', async () => {
      productGroupRepositoryMock.findAll.mockResolvedValue({ groups: [], total: 0 });

      await request(app.getHttpServer())
        .get('/api/product-groups')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(productGroupRepositoryMock.findById).not.toHaveBeenCalled();
    });
  });
});
