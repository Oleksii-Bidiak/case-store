import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { CarouselPlacement, CarouselSource, PublishStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CarouselRepository, FindPublishedParams } from '../src/carousels/carousels.repository';
import { CategoryRepository } from '../src/category';
import { ProductService } from '../src/product/product.service';
import { RevalidationNotifier } from '../src/publishing';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the carousel PLACEMENT dimension (TASK-288):
 *
 *   GET /api/carousels?placement=HOME_TABS   — public, placement-scoped read
 *   PUT /api/admin/carousels/:id             — admin, moves a carousel between placements
 *
 * The repository is mocked (no database) — what is under test is the HTTP contract:
 * the query DTO's enum validation, the placement filter actually reaching the read,
 * `placement` surviving onto the public + admin payloads, and the admin guard on the
 * write. The mocked `findAllPublished` filters the fixture rows itself, so "?placement
 * returns ONLY that placement" is a real assertion and not a hardcoded stub.
 */

// Pass-through guard that allows all requests (disables rate limiting in tests)
class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Carousel placement (e2e)', () => {
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
    placement: CarouselPlacement.HOME_TABS,
    sortOrder: 0,
  };

  const railCarousel = {
    ...baseRow,
    id: railId,
    title: 'Новинки',
    source: CarouselSource.NEWEST,
    placement: CarouselPlacement.HOME_RAILS,
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
    revalidateTarget: { tags: ['carousels'], paths: ['/'] },
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
    productServiceMock.findAll.mockResolvedValue({ data: [], meta: {} });
    carouselRepositoryMock.findAllPublished.mockImplementation((params: FindPublishedParams = {}) =>
      Promise.resolve(
        publishedRows.filter(
          (row) => params.placement === undefined || row.placement === params.placement,
        ),
      ),
    );
  });

  // ─── GET /api/carousels ─────────────────────────────────────────────────────

  describe('GET /api/carousels', () => {
    it('returns ONLY the HOME_TABS carousels when ?placement=HOME_TABS', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/carousels?placement=HOME_TABS')
        .expect(200);

      expect(carouselRepositoryMock.findAllPublished).toHaveBeenCalledWith({
        placement: CarouselPlacement.HOME_TABS,
      });
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: tabsId,
        title: 'Хіти',
        placement: CarouselPlacement.HOME_TABS,
        sortOrder: 0,
      });
      expect(response.body.data[0].products).toEqual([]);
    });

    it('returns ONLY the HOME_RAILS carousels when ?placement=HOME_RAILS', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/carousels?placement=HOME_RAILS')
        .expect(200);

      expect(response.body.data.map((carousel: { id: string }) => carousel.id)).toEqual([railId]);
    });

    it('returns every published carousel when placement is omitted (unchanged contract)', async () => {
      const response = await request(app.getHttpServer()).get('/api/carousels').expect(200);

      expect(carouselRepositoryMock.findAllPublished).toHaveBeenCalledWith({
        placement: undefined,
      });
      expect(response.body.data.map((carousel: { id: string }) => carousel.id)).toEqual([
        tabsId,
        railId,
      ]);
    });

    it('rejects an unknown placement with 400', async () => {
      await request(app.getHttpServer()).get('/api/carousels?placement=HOME_SIDEBAR').expect(400);

      expect(carouselRepositoryMock.findAllPublished).not.toHaveBeenCalled();
    });
  });

  // ─── PUT /api/admin/carousels/:id ───────────────────────────────────────────

  describe('PUT /api/admin/carousels/:id — placement change', () => {
    const body = { placement: CarouselPlacement.HOME_TABS };

    it('returns 401 without an auth token', async () => {
      await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .send(body)
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const token = generateAccessToken('customer-e2e-1', 'CUSTOMER');

      await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(403);

      expect(carouselRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('returns 400 on an unknown placement', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ placement: 'HOME_SIDEBAR' })
        .expect(400);

      expect(carouselRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('moves a live carousel to HOME_TABS and purges the homepage cache', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.findById.mockResolvedValue(railCarousel);
      carouselRepositoryMock.update.mockResolvedValue({
        ...railCarousel,
        placement: CarouselPlacement.HOME_TABS,
      });

      const response = await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(carouselRepositoryMock.update).toHaveBeenCalledWith(
        railId,
        expect.objectContaining({ placement: CarouselPlacement.HOME_TABS }),
      );
      expect(response.body.data.placement).toBe(CarouselPlacement.HOME_TABS);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({
        tags: ['carousels'],
        paths: ['/'],
      });
    });

    it('returns 404 for a missing carousel', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .put(`/api/admin/carousels/${railId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(404);
    });
  });

  // ─── GET /api/admin/carousels ───────────────────────────────────────────────

  describe('GET /api/admin/carousels', () => {
    it('exposes placement on every admin row and forwards the placement filter', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      carouselRepositoryMock.findAllAdmin.mockResolvedValue([tabsCarousel]);

      const response = await request(app.getHttpServer())
        .get('/api/admin/carousels?placement=HOME_TABS')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(carouselRepositoryMock.findAllAdmin).toHaveBeenCalledWith({
        placement: CarouselPlacement.HOME_TABS,
        status: undefined,
      });
      expect(response.body.data[0]).toMatchObject({
        id: tabsId,
        placement: CarouselPlacement.HOME_TABS,
      });
    });
  });
});
