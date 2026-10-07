import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Carousel, CarouselSource, HomeBlockType, PublishStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HomeBlockRepository } from '../src/home-block/home-block.repository';
import type { HomeBlockRecord } from '../src/home-block/home-block.repository';
import { CarouselRepository } from '../src/carousels/carousels.repository';
import { ProductService } from '../src/product/product.service';
import { RevalidationNotifier } from '../src/publishing';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the homepage blocks API (TASK-661): the public read the storefront renders
 * from, and the admin surface with its permission split — `home:read` opens the reads,
 * every write needs `home:write`. The repositories are mocked (no database); the
 * migration and the real queries are covered by `home-blocks-backfill.int-spec.ts`.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const at = new Date('2026-10-01T00:00:00.000Z');
const C1 = '550e8400-e29b-41d4-a716-446655440001';
const C2 = '550e8400-e29b-41d4-a716-446655440002';
const B1 = '650e8400-e29b-41d4-a716-446655440001';
const B2 = '650e8400-e29b-41d4-a716-446655440002';

const carousel = (id: string, title: string, status: PublishStatus): Carousel => ({
  id,
  title,
  source: CarouselSource.NEWEST,
  categoryId: null,
  itemLimit: 12,
  sortOrder: 0,
  status,
  publishedAt: null,
  scheduledAt: null,
  createdAt: at,
  updatedAt: at,
});

const block = (overrides: Partial<HomeBlockRecord>): HomeBlockRecord => ({
  id: B1,
  type: HomeBlockType.HERO,
  title: null,
  sortOrder: 0,
  status: PublishStatus.PUBLISHED,
  publishedAt: at,
  scheduledAt: null,
  carouselId: null,
  carousel: null,
  tabs: [],
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

describe('Home blocks (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const homeBlockRepositoryMock = {
    findForPage: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
    delete: jest.fn(),
    reorder: jest.fn(),
    publishDue: jest.fn(),
    revalidateTarget: { tags: ['home-blocks', 'carousels'], paths: ['/'] },
  };
  const carouselRepositoryMock = {
    findByIds: jest.fn(),
    findItemIds: jest.fn(),
    publishDue: jest.fn(),
    revalidateTarget: { tags: ['carousels', 'home-blocks'], paths: ['/'] },
  };
  const productServiceMock = { findAll: jest.fn(), getCardsByIds: jest.fn() };
  const revalidationMock = { revalidate: jest.fn() };
  const permissions = createPermissionRepositoryMock();

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

  const token = (userId: string, role: 'ADMIN' | 'MANAGER' | 'CUSTOMER') =>
    jwtService.sign(
      { sub: userId, email: `${userId}@example.com`, role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

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
      .useValue(permissions)
      .overrideProvider(HomeBlockRepository)
      .useValue(homeBlockRepositoryMock)
      .overrideProvider(CarouselRepository)
      .useValue(carouselRepositoryMock)
      .overrideProvider(ProductService)
      .useValue(productServiceMock)
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
    permissions.setGrants(UserRole.MANAGER, []);
    revalidationMock.revalidate.mockResolvedValue(undefined);
    productServiceMock.findAll.mockResolvedValue({ items: [], meta: {} });
  });

  describe('GET /api/home-blocks (public)', () => {
    it('returns the visible page in order, carousels and tabs resolved, drafts hidden', async () => {
      homeBlockRepositoryMock.findForPage.mockResolvedValue([
        block({ id: B1, type: HomeBlockType.HERO }),
        block({
          id: B2,
          type: HomeBlockType.TABS,
          title: 'Популярне',
          sortOrder: 1,
          tabs: [
            {
              carouselId: C1,
              sortOrder: 0,
              carousel: carousel(C1, 'Хіти', PublishStatus.PUBLISHED),
            },
            {
              carouselId: C2,
              sortOrder: 1,
              carousel: carousel(C2, 'Чернетка', PublishStatus.DRAFT),
            },
          ],
        }),
        block({
          id: '650e8400-e29b-41d4-a716-446655440003',
          type: HomeBlockType.CAROUSEL,
          sortOrder: 2,
          carouselId: C2,
          carousel: carousel(C2, 'Чернетка', PublishStatus.DRAFT),
        }),
      ]);

      const response = await request(app.getHttpServer()).get('/api/home-blocks').expect(200);

      expect(homeBlockRepositoryMock.findForPage).toHaveBeenCalledWith({
        includeUnpublished: false,
      });
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toEqual({
        id: B1,
        type: 'HERO',
        title: null,
        sortOrder: 0,
        status: 'PUBLISHED',
        carousel: null,
        tabs: [],
      });
      expect(response.body.data[1]).toMatchObject({
        type: 'TABS',
        title: 'Популярне',
        carousel: null,
        tabs: [{ id: C1, title: 'Хіти', status: 'PUBLISHED', products: [] }],
      });
    });

    it('needs no authentication', async () => {
      homeBlockRepositoryMock.findForPage.mockResolvedValue([]);
      await request(app.getHttpServer()).get('/api/home-blocks').expect(200);
    });
  });

  describe('admin permissions', () => {
    it('401 without a token, 403 for a customer and for a manager with neither key', async () => {
      await request(app.getHttpServer()).get('/api/admin/home-blocks').expect(401);
      await request(app.getHttpServer())
        .get('/api/admin/home-blocks')
        .set('Authorization', `Bearer ${token('customer-1', 'CUSTOMER')}`)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/admin/home-blocks')
        .set('Authorization', `Bearer ${token('manager-1', 'MANAGER')}`)
        .expect(403);
      expect(homeBlockRepositoryMock.findAll).not.toHaveBeenCalled();
    });

    it('home:read opens the reads and NO write', async () => {
      permissions.setGrants(UserRole.MANAGER, ['home:read']);
      homeBlockRepositoryMock.findAll.mockResolvedValue([block({})]);
      homeBlockRepositoryMock.findById.mockResolvedValue(block({}));
      const auth = `Bearer ${token('manager-1', 'MANAGER')}`;

      await request(app.getHttpServer())
        .get('/api/admin/home-blocks')
        .set('Authorization', auth)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/admin/home-blocks/${B1}`)
        .set('Authorization', auth)
        .expect(200);

      // Built lazily: a supertest request binds its own ephemeral server when created.
      const writes = [
        () =>
          request(app.getHttpServer())
            .post('/api/admin/home-blocks')
            .set('Authorization', auth)
            .send({ type: 'CAROUSEL', carouselId: C1 }),
        () =>
          request(app.getHttpServer())
            .put(`/api/admin/home-blocks/${B1}`)
            .set('Authorization', auth)
            .send({ status: 'DRAFT' }),
        () =>
          request(app.getHttpServer())
            .patch(`/api/admin/home-blocks/${B1}/publish`)
            .set('Authorization', auth),
        () =>
          request(app.getHttpServer())
            .patch(`/api/admin/home-blocks/${B1}/unpublish`)
            .set('Authorization', auth),
        () =>
          request(app.getHttpServer())
            .delete(`/api/admin/home-blocks/${B1}`)
            .set('Authorization', auth),
        () =>
          request(app.getHttpServer())
            .patch('/api/admin/home-blocks/reorder')
            .set('Authorization', auth)
            .send({ orderedIds: [B1] }),
      ];
      for (const write of writes) {
        await write().expect(403);
      }
      expect(homeBlockRepositoryMock.create).not.toHaveBeenCalled();
      expect(homeBlockRepositoryMock.delete).not.toHaveBeenCalled();
    });

    it('home:write opens a create', async () => {
      permissions.setGrants(UserRole.MANAGER, ['home:write']);
      carouselRepositoryMock.findByIds.mockResolvedValue([
        carousel(C1, 'Хіти', PublishStatus.PUBLISHED),
      ]);
      homeBlockRepositoryMock.create.mockResolvedValue(
        block({
          type: HomeBlockType.CAROUSEL,
          status: PublishStatus.DRAFT,
          carouselId: C1,
          carousel: carousel(C1, 'Хіти', PublishStatus.PUBLISHED),
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/admin/home-blocks')
        .set('Authorization', `Bearer ${token('manager-1', 'MANAGER')}`)
        .send({ type: 'CAROUSEL', carouselId: C1 })
        .expect(201);

      expect(response.body.data).toMatchObject({
        type: 'CAROUSEL',
        carousel: { id: C1, title: 'Хіти' },
        isSystem: false,
        isOrphaned: false,
      });
    });
  });

  describe('admin behaviour', () => {
    const admin = () => `Bearer ${token('admin-1', 'ADMIN')}`;

    it('400 for a carouselId on a TABS block', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/home-blocks')
        .set('Authorization', admin())
        .send({ type: 'TABS', title: 'X', tabs: [C1], carouselId: C1 })
        .expect(400);
      expect(homeBlockRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('400 for a singleton type on create', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/home-blocks')
        .set('Authorization', admin())
        .send({ type: 'HERO' })
        .expect(400);
    });

    it('409 HOME_BLOCK_SYSTEM when deleting a singleton block', async () => {
      homeBlockRepositoryMock.findById.mockResolvedValue(block({ type: HomeBlockType.HERO }));

      const response = await request(app.getHttpServer())
        .delete(`/api/admin/home-blocks/${B1}`)
        .set('Authorization', admin())
        .expect(409);

      expect(response.body.error).toBe('HOME_BLOCK_SYSTEM');
      expect(homeBlockRepositoryMock.delete).not.toHaveBeenCalled();
    });

    it('400 HOME_BLOCK_FIELD_NOT_ALLOWED when editing a field of another type', async () => {
      homeBlockRepositoryMock.findById.mockResolvedValue(block({ type: HomeBlockType.HERO }));

      const response = await request(app.getHttpServer())
        .put(`/api/admin/home-blocks/${B1}`)
        .set('Authorization', admin())
        .send({ title: 'X' })
        .expect(400);

      expect(response.body.error).toBe('HOME_BLOCK_FIELD_NOT_ALLOWED');
    });

    it('reorder is matched by its own handler and returns the refreshed list', async () => {
      homeBlockRepositoryMock.reorder.mockResolvedValue([block({ id: B2 }), block({ id: B1 })]);

      const response = await request(app.getHttpServer())
        .patch('/api/admin/home-blocks/reorder')
        .set('Authorization', admin())
        .send({ orderedIds: [B2, B1] })
        .expect(200);

      expect(homeBlockRepositoryMock.reorder).toHaveBeenCalledWith([B2, B1]);
      expect(homeBlockRepositoryMock.findById).not.toHaveBeenCalled();
      expect(response.body.data.map((b: { id: string }) => b.id)).toEqual([B2, B1]);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({
        tags: ['home-blocks', 'carousels'],
        paths: ['/'],
      });
    });
  });
});
