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
import { ReorderNotFoundError, ReorderStaleError } from '../src/common/reorder';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

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
    reorderAll: jest.fn(),
  };

  /** Real UUIDs — `orderedIds` is `@IsUUID('loose', { each: true })`. */
  const idA = '550e8400-e29b-41d4-a716-446655440001';
  const idB = '550e8400-e29b-41d4-a716-446655440002';

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
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
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

  // ─── Admin listing (TASK-357) ─────────────────────────────────────────────────

  describe('GET /api/admin/pages', () => {
    it('paginates with honest meta so the panel can render a pager instead of truncating', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findAllAdmin.mockResolvedValue({ pages: [publishedPage], total: 42 });

      const response = await request(app.getHttpServer())
        .get('/api/admin/pages?page=3&limit=20')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(pageRepositoryMock.findAllAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3, limit: 20 }),
      );
      expect(response.body.meta).toEqual({ total: 42, page: 3, limit: 20, totalPages: 3 });
    });

    /**
     * TASK-429 / review finding #12 — `?page=` WITHOUT `?limit=`.
     *
     * Since TASK-428 the two are independently optional, and the repository and the service
     * then disagreed about the default: the repository sliced 20 rows while the meta said
     * `limit: total, totalPages: 1`. The pager in the panel is driven by this very meta, so
     * a 45-row list rendered "сторінка 2 з 1" and hid everything past the first page. The
     * response must describe the slice that was actually taken.
     */
    it('reports the repository page size for ?page= given without ?limit=', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findAllAdmin.mockResolvedValue({ pages: [publishedPage], total: 45 });

      const response = await request(app.getHttpServer())
        .get('/api/admin/pages?page=2')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(pageRepositoryMock.findAllAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, limit: undefined }),
      );
      expect(response.body.meta).toEqual({ total: 45, page: 2, limit: 20, totalPages: 3 });
    });

    it('forwards the search term', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findAllAdmin.mockResolvedValue({ pages: [publishedPage], total: 1 });

      await request(app.getHttpServer())
        .get('/api/admin/pages?search=privacy')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(pageRepositoryMock.findAllAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'privacy' }),
      );
    });

    /**
     * TASK-428 — the contract the reorder UI stands on: absence of BOTH `page` and
     * `limit` means "return everything". Before TASK-428 the admin DTO inherited the
     * public one's `page = 1` / `limit = 20` FIELD INITIALIZERS, so the complete list was
     * unreachable and a drag on page 1 of a 42-page list would have PATCHed a 20-id
     * payload the server rightly rejects as a lost update.
     */
    it('returns the COMPLETE list when neither page nor limit is given', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.findAllAdmin.mockResolvedValue({
        pages: [publishedPage, draftPage],
        total: 2,
      });

      const response = await request(app.getHttpServer())
        .get('/api/admin/pages')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(pageRepositoryMock.findAllAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ page: undefined, limit: undefined }),
      );
      expect(response.body.data).toHaveLength(2);
      // One page holding everything — an honest count without inventing a page size.
      expect(response.body.meta).toEqual({ total: 2, page: 1, limit: 2, totalPages: 1 });
    });

    // `search` is declared on the ADMIN subclass only; the public /legal hub has nothing to
    // search, and `forbidNonWhitelisted` keeps that boundary mechanical.
    it('rejects ?search= on the PUBLIC page list', async () => {
      await request(app.getHttpServer()).get('/api/pages?search=privacy').expect(400);

      expect(pageRepositoryMock.findAll).not.toHaveBeenCalled();
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

  // ─── PATCH /api/admin/pages/reorder (TASK-428) ────────────────────────────────

  describe('PATCH /api/admin/pages/reorder', () => {
    const body = { orderedIds: [idB, idA] };

    it('returns 401 without an auth token', async () => {
      await request(app.getHttpServer()).patch('/api/admin/pages/reorder').send(body).expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .patch('/api/admin/pages/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(403);

      expect(pageRepositoryMock.reorderAll).not.toHaveBeenCalled();
    });

    it('returns 400 when an ordered id is not a uuid', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .patch('/api/admin/pages/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderedIds: ['not-a-uuid'] })
        .expect(400);

      expect(pageRepositoryMock.reorderAll).not.toHaveBeenCalled();
    });

    // Route-order regression guard: `reorder` is declared BEFORE `:id`, so it must reach
    // the reorder handler — never a `:id` route with `id = 'reorder'`.
    it('is matched by the reorder handler, NOT captured as an :id route', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.reorderAll.mockResolvedValue({ pages: [publishedPage], total: 1 });

      await request(app.getHttpServer())
        .patch('/api/admin/pages/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(pageRepositoryMock.reorderAll).toHaveBeenCalledTimes(1);
      expect(pageRepositoryMock.findById).not.toHaveBeenCalled();
      expect(pageRepositoryMock.update).not.toHaveBeenCalled();
    });

    it('returns 200 with the refreshed full admin page list', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.reorderAll.mockResolvedValue({ pages: [publishedPage], total: 1 });

      const response = await request(app.getHttpServer())
        .patch('/api/admin/pages/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(response.body.data[0]).toMatchObject({ slug: 'privacy-policy' });
      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
      expect(pageRepositoryMock.reorderAll).toHaveBeenCalledWith([idB, idA]);
    });

    // The stable codes are the contract the admin panel keys its UA announcements off.
    it('surfaces REORDER_STALE as 409 with the stable code', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.reorderAll.mockRejectedValue(new ReorderStaleError());

      const response = await request(app.getHttpServer())
        .patch('/api/admin/pages/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(409);

      expect(response.body.error).toBe('REORDER_STALE');
    });

    it('surfaces REORDER_NOT_FOUND as 404 with the stable code', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      pageRepositoryMock.reorderAll.mockRejectedValue(new ReorderNotFoundError());

      const response = await request(app.getHttpServer())
        .patch('/api/admin/pages/reorder')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(404);

      expect(response.body.error).toBe('REORDER_NOT_FOUND');
    });
  });
});
