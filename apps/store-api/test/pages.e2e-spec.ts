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
import { PageRepository } from '../src/pages/pages.repository';
import { PrismaService } from '../src/prisma';

/**
 * E2E tests for the Pages module (TASK-153).
 *
 * Mirrors category.e2e-spec.ts: mocks AuthRepository, UserRepository,
 * PageRepository, and PrismaService so no real database is required. JWT tokens
 * are minted directly via JwtService to bypass the rate-limited auth endpoints.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('Pages (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

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

  const pageRepositoryMock = {
    findAll: jest.fn(),
    findBySlug: jest.fn(),
    findById: jest.fn(),
    findBySlugAny: jest.fn(),
    findAllAdmin: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    publish: jest.fn(),
    unpublish: jest.fn(),
    delete: jest.fn(),
    publishDue: jest.fn(),
    updateMany: jest.fn(),
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

  const testAdmin = { id: 'admin-e2e-1', role: 'ADMIN' as const };
  const testCustomer = { id: 'customer-e2e-1', role: 'CUSTOMER' as const };

  const publishedPage = {
    id: 'page-e2e-1',
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    content: '<p>How we handle your data.</p>',
    excerpt: null,
    metaTitle: null,
    metaDescription: null,
    status: 'PUBLISHED' as const,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    scheduledAt: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const draftPage = {
    ...publishedPage,
    id: 'page-e2e-2',
    slug: 'faq',
    title: 'FAQ',
    status: 'DRAFT' as const,
    publishedAt: null,
    isActive: false,
  };

  function generateAccessToken(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
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
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(PageRepository)
      .useValue(pageRepositoryMock)
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

  // ─── Public endpoints ───────────────────────────────────────────────────────

  describe('GET /api/pages', () => {
    it('returns only published pages', async () => {
      pageRepositoryMock.findAll.mockResolvedValue({ pages: [publishedPage], total: 1 });

      const response = await request(app.getHttpServer()).get('/api/pages').expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({ slug: 'privacy-policy', isActive: true });
      expect(response.body.meta).toMatchObject({ total: 1, page: 1 });
    });
  });

  describe('GET /api/pages/:slug', () => {
    it('returns the published page by slug', async () => {
      pageRepositoryMock.findBySlug.mockResolvedValue(publishedPage);

      const response = await request(app.getHttpServer())
        .get('/api/pages/privacy-policy')
        .expect(200);

      expect(response.body.data).toMatchObject({ slug: 'privacy-policy' });
    });

    it('returns 404 when the page is a draft (repository filters it out)', async () => {
      // findBySlug filters isActive:true, so a draft slug resolves to null.
      pageRepositoryMock.findBySlug.mockResolvedValue(null);

      await request(app.getHttpServer()).get('/api/pages/faq').expect(404);
    });

    it('returns 404 for an unknown slug', async () => {
      pageRepositoryMock.findBySlug.mockResolvedValue(null);

      await request(app.getHttpServer()).get('/api/pages/does-not-exist').expect(404);
    });
  });

  // ─── Admin guard ────────────────────────────────────────────────────────────

  describe('POST /api/admin/pages (auth)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/pages')
        .send({ title: 'X', content: '<p>x</p>' })
        .expect(401);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .post('/api/admin/pages')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X', content: '<p>x</p>' })
        .expect(403);
    });

    it('creates a page with an admin token', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findBySlugAny.mockResolvedValue(null);
      pageRepositoryMock.create.mockResolvedValue(publishedPage);

      const response = await request(app.getHttpServer())
        .post('/api/admin/pages')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Privacy Policy', content: '<p>How we handle your data.</p>' })
        .expect(201);

      expect(response.body.data).toMatchObject({ slug: 'privacy-policy' });
    });

    it('returns 409 on a duplicate slug', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findBySlugAny.mockResolvedValue(publishedPage);

      await request(app.getHttpServer())
        .post('/api/admin/pages')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Privacy Policy', content: '<p>dup</p>' })
        .expect(409);
    });
  });

  // ─── Admin mutations ──────────────────────────────────────────────────────────

  describe('admin updates / status / delete', () => {
    it('PUT updates the title and content', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findById.mockResolvedValue(publishedPage);
      pageRepositoryMock.update.mockResolvedValue({
        ...publishedPage,
        title: 'Updated',
        content: '<p>new</p>',
      });

      const response = await request(app.getHttpServer())
        .put(`/api/admin/pages/${publishedPage.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Updated', content: '<p>new</p>' })
        .expect(200);

      expect(response.body.data).toMatchObject({ title: 'Updated', content: '<p>new</p>' });
    });

    it('PATCH publish sets status = PUBLISHED', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findById.mockResolvedValue(draftPage);
      pageRepositoryMock.publish.mockResolvedValue({
        ...draftPage,
        status: 'PUBLISHED',
        isActive: true,
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/admin/pages/${draftPage.id}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toMatchObject({ status: 'PUBLISHED', isActive: true });
    });

    it('PATCH unpublish sets status = DRAFT', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findById.mockResolvedValue(publishedPage);
      pageRepositoryMock.unpublish.mockResolvedValue({
        ...publishedPage,
        status: 'DRAFT',
        isActive: false,
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/admin/pages/${publishedPage.id}/unpublish`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toMatchObject({ status: 'DRAFT', isActive: false });
    });

    it('DELETE removes the page (204) then GET by slug is 404', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findById.mockResolvedValue(publishedPage);
      pageRepositoryMock.delete.mockResolvedValue(publishedPage);

      await request(app.getHttpServer())
        .delete(`/api/admin/pages/${publishedPage.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      pageRepositoryMock.findBySlug.mockResolvedValue(null);
      await request(app.getHttpServer()).get('/api/pages/privacy-policy').expect(404);
    });

    it('PUT returns 404 for a missing page', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .put('/api/admin/pages/missing')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X' })
        .expect(404);
    });
  });
});
