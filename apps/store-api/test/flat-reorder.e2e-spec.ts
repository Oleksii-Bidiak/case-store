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
import {
  ReorderDuplicateIdError,
  ReorderNotFoundError,
  ReorderStaleError,
} from '../src/common/reorder';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the three FLAT reorder endpoints (TASK-295):
 *
 *   PATCH /api/admin/banners/reorder
 *   PATCH /api/admin/blog/categories/reorder
 *   PATCH /api/admin/devices/brands/reorder
 *
 * Repositories are mocked (no database) — what is under test here is the HTTP contract:
 * the admin guard, DTO validation, ROUTE MATCHING (each `reorder` must be captured by its
 * own handler and NOT swallowed by the neighbouring `:id` route), the `{ data }` envelope
 * carrying the refreshed list, and the stable domain error codes surviving
 * `HttpExceptionFilter`'s envelope rebuild.
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Flat reorder endpoints (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Real UUIDs — every id field is `@IsUUID('4')`.
  const idA = '550e8400-e29b-41d4-a716-446655440001';
  const idB = '550e8400-e29b-41d4-a716-446655440002';

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
    ...testAdmin,
    id: 'customer-e2e-1',
    email: 'e2e-customer@example.com',
    role: 'CUSTOMER' as const,
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

  function generateAccessToken(userId: string, role: 'ADMIN' | 'CUSTOMER'): string {
    return jwtService.sign(
      { sub: userId, email: `${userId}@example.com`, role },
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

    // Registered exactly as `main.ts` does: the reorder contract depends on the STABLE
    // error code surviving this filter's envelope rebuild (it reads ONLY `error` +
    // `message` off the thrown body), so asserting the code on the wire needs it.
    app.useGlobalFilters(moduleFixture.get(HttpExceptionFilter));

    app.setGlobalPrefix('api', { exclude: ['health'] });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── PATCH /api/admin/banners/reorder ───────────────────────────────────────

  describe('PATCH /api/admin/banners/reorder', () => {
    const body = { placement: BannerPlacement.HERO_SLIDE, orderedIds: [idB, idA] };

    it('returns 401 without an auth token', async () => {
      await request(app.getHttpServer()).patch('/api/admin/banners/reorder').send(body).expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/admin/banners/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(403);

      expect(bannerRepositoryMock.reorderPlacement).not.toHaveBeenCalled();
    });

    it('returns 400 when an ordered id is not a uuid', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/banners/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ placement: BannerPlacement.HERO_SLIDE, orderedIds: ['not-a-uuid'] })
        .expect(400);

      expect(bannerRepositoryMock.reorderPlacement).not.toHaveBeenCalled();
    });

    it('returns 400 on an unknown placement', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/banners/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ placement: 'NOWHERE', orderedIds: [idA] })
        .expect(400);

      expect(bannerRepositoryMock.reorderPlacement).not.toHaveBeenCalled();
    });

    // Route-order regression guard: `reorder` is declared BEFORE `:id`, so it must reach
    // the reorder handler — never `GET/PUT :id` with `id = 'reorder'`.
    it('is matched by the reorder handler, NOT captured as an :id route', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      bannerRepositoryMock.reorderPlacement.mockResolvedValue([bannerRow]);

      await request(app.getHttpServer())
        .patch('/api/admin/banners/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(bannerRepositoryMock.reorderPlacement).toHaveBeenCalledTimes(1);
      expect(bannerRepositoryMock.findById).not.toHaveBeenCalled();
      expect(bannerRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('returns 200 with the refreshed full admin banner list', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      bannerRepositoryMock.reorderPlacement.mockResolvedValue([bannerRow]);

      const response = await request(app.getHttpServer())
        .patch('/api/admin/banners/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data[0]).toMatchObject({
        id: idA,
        placement: BannerPlacement.HERO_SLIDE,
      });
      expect(bannerRepositoryMock.reorderPlacement).toHaveBeenCalledWith(
        BannerPlacement.HERO_SLIDE,
        [idB, idA],
      );
    });

    it('surfaces REORDER_STALE as a 409 with the stable code', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      bannerRepositoryMock.reorderPlacement.mockRejectedValue(new ReorderStaleError());

      const response = await request(app.getHttpServer())
        .patch('/api/admin/banners/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(409);

      expect(response.body).toMatchObject({ error: 'REORDER_STALE', statusCode: 409 });
    });
  });

  // ─── PATCH /api/admin/blog/categories/reorder ───────────────────────────────

  describe('PATCH /api/admin/blog/categories/reorder', () => {
    const body = { orderedIds: [idB, idA] };

    it('returns 401 without an auth token', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/blog/categories/reorder')
        .send(body)
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/admin/blog/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(403);

      expect(blogRepositoryMock.reorderCategories).not.toHaveBeenCalled();
    });

    it('returns 400 when an ordered id is not a uuid', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/blog/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderedIds: ['not-a-uuid'] })
        .expect(400);

      expect(blogRepositoryMock.reorderCategories).not.toHaveBeenCalled();
    });

    // Route-order regression guard — `categories/reorder` must not hit `categories/:id`.
    it('is matched by the reorder handler, NOT captured as a categories/:id route', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      blogRepositoryMock.reorderCategories.mockResolvedValue([blogCategoryRow]);

      await request(app.getHttpServer())
        .patch('/api/admin/blog/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(blogRepositoryMock.reorderCategories).toHaveBeenCalledTimes(1);
      expect(blogRepositoryMock.findCategoryById).not.toHaveBeenCalled();
      expect(blogRepositoryMock.updateCategory).not.toHaveBeenCalled();
    });

    it('returns 200 with the refreshed category list', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      blogRepositoryMock.reorderCategories.mockResolvedValue([blogCategoryRow]);

      const response = await request(app.getHttpServer())
        .patch('/api/admin/blog/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({ id: idA, slug: 'guides', sortOrder: 0 });
      expect(blogRepositoryMock.reorderCategories).toHaveBeenCalledWith([idB, idA]);
    });

    it('surfaces REORDER_NOT_FOUND as a 404 with the stable code', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      blogRepositoryMock.reorderCategories.mockRejectedValue(new ReorderNotFoundError());

      const response = await request(app.getHttpServer())
        .patch('/api/admin/blog/categories/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(404);

      expect(response.body).toMatchObject({ error: 'REORDER_NOT_FOUND', statusCode: 404 });
    });
  });

  // ─── PATCH /api/admin/devices/brands/reorder ────────────────────────────────

  describe('PATCH /api/admin/devices/brands/reorder', () => {
    const body = { orderedIds: [idB, idA] };

    it('returns 401 without an auth token', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/devices/brands/reorder')
        .send(body)
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/admin/devices/brands/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(403);

      expect(deviceRepositoryMock.reorderBrands).not.toHaveBeenCalled();
    });

    it('returns 400 when an ordered id is not a uuid', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/devices/brands/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderedIds: ['not-a-uuid'] })
        .expect(400);

      expect(deviceRepositoryMock.reorderBrands).not.toHaveBeenCalled();
    });

    // Route-order regression guard — `brands/reorder` must not hit `brands/:id`.
    it('is matched by the reorder handler, NOT captured as a brands/:id route', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      deviceRepositoryMock.reorderBrands.mockResolvedValue([brandRow]);

      await request(app.getHttpServer())
        .patch('/api/admin/devices/brands/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(deviceRepositoryMock.reorderBrands).toHaveBeenCalledTimes(1);
      expect(deviceRepositoryMock.findBrandById).not.toHaveBeenCalled();
      expect(deviceRepositoryMock.updateBrand).not.toHaveBeenCalled();
    });

    it('returns 200 with the refreshed admin brand list (model counts included)', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      deviceRepositoryMock.reorderBrands.mockResolvedValue([brandRow]);

      const response = await request(app.getHttpServer())
        .patch('/api/admin/devices/brands/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({ id: idA, name: 'Apple', modelCount: 7 });
      expect(deviceRepositoryMock.reorderBrands).toHaveBeenCalledWith([idB, idA]);
    });

    it('surfaces REORDER_DUPLICATE_ID as a 400 with the stable code', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      deviceRepositoryMock.reorderBrands.mockRejectedValue(new ReorderDuplicateIdError());

      const response = await request(app.getHttpServer())
        .patch('/api/admin/devices/brands/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(400);

      expect(response.body).toMatchObject({ error: 'REORDER_DUPLICATE_ID', statusCode: 400 });
    });
  });
});
