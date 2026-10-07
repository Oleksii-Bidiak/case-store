import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CarouselSource, PublishStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CarouselRepository } from '../src/carousels/carousels.repository';
import { CategoryRepository } from '../src/category';
import { ProductService } from '../src/product/product.service';
import { RevalidationNotifier } from '../src/publishing';
import { HttpExceptionFilter } from '../src/common/filters';
import { ReorderNotFoundError, ReorderStaleError } from '../src/common/reorder';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the carousel HTTP contract after TASK-660 removed `Carousel.placement`:
 *
 *   GET   /api/carousels                — public list, no placement on the payload
 *   PUT   /api/admin/carousels/:id      — in-place edit; a `placement` is now a 400
 *   GET   /api/admin/carousels          — admin list; `?placement=` is now a 400
 *   PATCH /api/admin/carousels/reorder  — ONE global list, no placement bucket
 *
 * Where a carousel renders on the homepage belongs to the homepage blocks now
 * (`test/home-blocks.e2e-spec.ts`). The repository is mocked (no database).
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Carousels (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const tabsId = '550e8400-e29b-41d4-a716-446655440001';
  const railId = '550e8400-e29b-41d4-a716-446655440002';

  const baseRow = {
    categoryId: null as string | null,
    itemLimit: 12,
    status: PublishStatus.PUBLISHED,
    publishedAt: new Date('2026-07-01T00:00:00.000Z'),
    scheduledAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  const tabsCarousel = {
    ...baseRow,
    id: tabsId,
    title: 'Хіти',
    source: CarouselSource.BESTSELLING,
    sortOrder: 0,
  };

  const railCarousel = {
    ...baseRow,
    id: railId,
    title: 'Новинки',
    source: CarouselSource.NEWEST,
    sortOrder: 1,
  };

  const publishedRows = [tabsCarousel, railCarousel];

  const carouselRepositoryMock = {
    findAllPublished: jest.fn(),
    findAllAdmin: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
    delete: jest.fn(),
    publishDue: jest.fn(),
    findItemIds: jest.fn(),
    findItemsWithProducts: jest.fn(),
    replaceItems: jest.fn(),
    reorder: jest.fn(),
    findByIds: jest.fn(),
    revalidateTarget: { tags: ['carousels', 'home-blocks'], paths: ['/'] },
  };

  const productServiceMock = {
    findAll: jest.fn(),
    getCardsByIds: jest.fn(),
  };

  const categoryRepositoryMock = { findById: jest.fn() };
  const revalidationMock = { revalidate: jest.fn() };

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
      .overrideProvider(CarouselRepository)
      .useValue(carouselRepositoryMock)
      .overrideProvider(ProductService)
      .useValue(productServiceMock)
      .overrideProvider(CategoryRepository)
      .useValue(categoryRepositoryMock)
      .overrideProvider(RevalidationNotifier)
      .useValue(revalidationMock)
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
    app.useGlobalFilters(moduleFixture.get(HttpExceptionFilter));
    app.setGlobalPrefix('api', { exclude: ['health'] });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    revalidationMock.revalidate.mockResolvedValue(undefined);
    productServiceMock.findAll.mockResolvedValue({ items: [], meta: {} });
    carouselRepositoryMock.findAllPublished.mockResolvedValue(publishedRows);
  });

  // ─── GET /api/carousels ─────────────────────────────────────────────────────

  describe('GET /api/carousels', () => {
    it('returns every published carousel, with no placement on the payload (TASK-660)', async () => {
      const response = await request(app.getHttpServer()).get('/api/carousels').expect(200);

      expect(carouselRepositoryMock.findAllPublished).toHaveBeenCalledWith();
      expect(response.body.data.map((carousel: { id: string }) => carousel.id)).toEqual([
        tabsId,
        railId,
      ]);
      expect(response.body.data[0]).toMatchObject({
        id: tabsId,
        title: 'Хіти',
        status: PublishStatus.PUBLISHED,
        sortOrder: 0,
        products: [],
      });
      expect(response.body.data[0]).not.toHaveProperty('placement');
    });
  });

  // ─── PUT /api/admin/carousels/:id ───────────────────────────────────────────

  describe('PUT /api/admin/carousels/:id', () => {
    it('returns 401 without an auth token', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .send({ title: 'Новинки 2' })
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const token = generateAccessToken('customer-e2e-1', 'CUSTOMER');

      await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Новинки 2' })
        .expect(403);

      expect(carouselRepositoryMock.update).not.toHaveBeenCalled();
    });

    // The field is gone, not ignored: an old admin bundle still sending it gets a clear
    // 400 instead of believing it moved a carousel between homepage sections.
    it('rejects a placement with 400 — the field no longer exists (TASK-660)', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ placement: 'HOME_TABS' })
        .expect(400);

      expect(carouselRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('edits a live carousel in place and purges the carousels + home-blocks cache', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.findById.mockResolvedValue(railCarousel);
      carouselRepositoryMock.update.mockResolvedValue({ ...railCarousel, title: 'Новинки 2' });

      const response = await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Новинки 2' })
        .expect(200);

      expect(carouselRepositoryMock.update).toHaveBeenCalledTimes(1);
      expect(response.body.data.title).toBe('Новинки 2');
      expect(response.body.data).not.toHaveProperty('placement');
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({
        tags: ['carousels', 'home-blocks'],
        paths: ['/'],
      });
    });

    it('returns 404 for a missing carousel', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'x' })
        .expect(404);
    });
  });

  // ─── GET /api/admin/carousels ───────────────────────────────────────────────

  describe('GET /api/admin/carousels', () => {
    it('rejects the retired placement filter with 400 (TASK-660)', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .get('/api/admin/carousels?placement=HOME_TABS')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(carouselRepositoryMock.findAllAdmin).not.toHaveBeenCalled();
    });

    // ─── TASK-357 ─────────────────────────────────────────────────────────────

    it('reports the complete list as one page when page/limit are omitted', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.findAllAdmin.mockResolvedValue({
        carousels: [tabsCarousel],
        total: 1,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/carousels')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(carouselRepositoryMock.findAllAdmin).toHaveBeenCalledWith({
        status: undefined,
        page: undefined,
        limit: undefined,
        search: undefined,
      });
      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
    });

    it('forwards page, limit and search to the repository', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.findAllAdmin.mockResolvedValue({
        carousels: [tabsCarousel],
        total: 7,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/carousels?page=2&limit=3&search=xit')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(carouselRepositoryMock.findAllAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: 3, search: 'xit' }),
      );
      expect(response.body.meta).toEqual({ total: 7, page: 2, limit: 3, totalPages: 3 });
    });

    it('rejects a non-integer page with a 400 rather than silently defaulting', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .get('/api/admin/carousels?page=abc')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(carouselRepositoryMock.findAllAdmin).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /api/admin/carousels/reorder (TASK-428, one list since TASK-660) ─

  describe('PATCH /api/admin/carousels/reorder', () => {
    const body = { orderedIds: [railId, tabsId] };

    it('returns 401 without an auth token', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/carousels/reorder')
        .send(body)
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const token = generateAccessToken('customer-e2e-1', 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/admin/carousels/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(403);

      expect(carouselRepositoryMock.reorder).not.toHaveBeenCalled();
    });

    it('rejects the retired placement key with 400', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/carousels/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ placement: 'HOME_RAILS', orderedIds: [railId] })
        .expect(400);

      expect(carouselRepositoryMock.reorder).not.toHaveBeenCalled();
    });

    it('returns 400 when an ordered id is not a uuid', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/carousels/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderedIds: ['not-a-uuid'] })
        .expect(400);

      expect(carouselRepositoryMock.reorder).not.toHaveBeenCalled();
    });

    // Route-order regression guard: `reorder` is declared BEFORE `:id`, so it must reach
    // the reorder handler — never `GET/PUT :id` with `id = 'reorder'`.
    it('is matched by the reorder handler, NOT captured as an :id route', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.reorder.mockResolvedValue({
        carousels: publishedRows,
        total: 2,
      });

      await request(app.getHttpServer())
        .patch('/api/admin/carousels/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(carouselRepositoryMock.reorder).toHaveBeenCalledTimes(1);
      expect(carouselRepositoryMock.findById).not.toHaveBeenCalled();
      expect(carouselRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('returns 200 with the refreshed full admin list', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.reorder.mockResolvedValue({
        carousels: publishedRows,
        total: 2,
      });

      const response = await request(app.getHttpServer())
        .patch('/api/admin/carousels/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta).toEqual({ total: 2, page: 1, limit: 2, totalPages: 1 });
      expect(carouselRepositoryMock.reorder).toHaveBeenCalledWith([railId, tabsId]);
    });

    // The stable codes are the contract the admin panel keys its UA announcements off —
    // and they only reach the wire because `HttpExceptionFilter` rebuilds the envelope
    // from `error` + `message`.
    it('surfaces REORDER_STALE as 409 with the stable code', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.reorder.mockRejectedValue(new ReorderStaleError());

      const response = await request(app.getHttpServer())
        .patch('/api/admin/carousels/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(409);

      expect(response.body.error).toBe('REORDER_STALE');
    });

    it('surfaces REORDER_NOT_FOUND as 404 with the stable code', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.reorder.mockRejectedValue(new ReorderNotFoundError());

      const response = await request(app.getHttpServer())
        .patch('/api/admin/carousels/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(404);

      expect(response.body.error).toBe('REORDER_NOT_FOUND');
    });
  });
});
