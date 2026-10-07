import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { HomeBlockType, PageKind, PublishStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HomeBlockRepository } from '../src/home-block/home-block.repository';
import { BannerRepository } from '../src/banners/banners.repository';
import { ProductService } from '../src/product/product.service';
import { PreviewTokenRepository } from '../src/preview-token/preview-token.repository';
import { derivePreviewKey, signPreviewToken } from '../src/preview-token/preview-token.util';
import { RevalidationNotifier } from '../src/publishing';
import { HttpExceptionFilter } from '../src/common/filters';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E for the signed preview links (TASK-668, plan 186):
 *
 *   - issuing needs the right that SEES the thing (403 otherwise);
 *   - a valid token of the right scope opens the draft and marks the response
 *     `Cache-Control: private, no-store` + `X-Robots-Tag: noindex`;
 *   - an invalid, expired, revoked or OTHER-SCOPE token is ignored: the response is
 *     byte-identical to the one without a token, with no preview headers;
 *   - `GET /api/preview-tokens/resolve` answers 200 for a good token, 404 otherwise.
 *
 * Repositories are mocked (no database); the generation lives in the mocked
 * PreviewTokenRepository so a revoke is observable.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440002';
const PAGE_ID = '550e8400-e29b-41d4-a716-446655440003';
const at = new Date('2026-10-01T00:00:00.000Z');

describe('Preview tokens (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let version = 0;

  const previewRepositoryMock = {
    getVersion: jest.fn(() => Promise.resolve(version)),
    bumpVersion: jest.fn(() => Promise.resolve(++version)),
    findProduct: jest.fn((id: string) =>
      Promise.resolve(id === PRODUCT_ID ? { id, slug: 'hidden-case' } : null),
    ),
    findPage: jest.fn((id: string) =>
      Promise.resolve(id === PAGE_ID ? { id, slug: 'offer', kind: PageKind.LEGAL } : null),
    ),
    findPost: jest.fn(() => Promise.resolve(null)),
  };
  const homeBlockRepositoryMock = {
    findForPage: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    publishDue: jest.fn(),
    revalidateTarget: { tags: ['home-blocks', 'carousels'], paths: ['/'] },
  };
  const bannerRepositoryMock = {
    findAllPublished: jest.fn(),
    publishDue: jest.fn(),
    revalidateTarget: { tags: ['banners'], paths: ['/'] },
  };
  const productDetail = (slug: string, isActive: boolean) => ({
    product: { id: PRODUCT_ID, slug, name: 'Case', isActive },
    category: { id: 'c', name: 'Cases', slug: 'cases' },
    group: null,
    images: [],
  });
  const productServiceMock = {
    findAll: jest.fn(),
    getCardsByIds: jest.fn(),
    findBySlug: jest.fn(),
    findBySlugForPreview: jest.fn(),
  };
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

  const bearer = (userId: string, role: 'ADMIN' | 'MANAGER') =>
    `Bearer ${jwtService.sign(
      { sub: userId, email: `${userId}@example.com`, role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    )}`;

  const issue = async (body: Record<string, unknown>): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/api/admin/preview-tokens')
      .set('Authorization', bearer('admin-1', 'ADMIN'))
      .send(body)
      .expect(201);
    return response.body.data.token as string;
  };

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
      .overrideProvider(PreviewTokenRepository)
      .useValue(previewRepositoryMock)
      .overrideProvider(HomeBlockRepository)
      .useValue(homeBlockRepositoryMock)
      .overrideProvider(BannerRepository)
      .useValue(bannerRepositoryMock)
      .overrideProvider(ProductService)
      .useValue(productServiceMock)
      .overrideProvider(RevalidationNotifier)
      .useValue({ revalidate: jest.fn() })
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
    version = 0;
    jest.clearAllMocks();
    permissions.setGrants(UserRole.MANAGER, []);
    homeBlockRepositoryMock.findForPage.mockImplementation(
      ({ includeUnpublished }: { includeUnpublished: boolean }) =>
        Promise.resolve([
          {
            id: '650e8400-e29b-41d4-a716-446655440001',
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
          },
          ...(includeUnpublished
            ? [
                {
                  id: '650e8400-e29b-41d4-a716-446655440002',
                  type: HomeBlockType.NEWSLETTER,
                  title: null,
                  sortOrder: 1,
                  status: PublishStatus.DRAFT,
                  publishedAt: null,
                  scheduledAt: null,
                  carouselId: null,
                  carousel: null,
                  tabs: [],
                  createdAt: at,
                  updatedAt: at,
                },
              ]
            : []),
        ]),
    );
    bannerRepositoryMock.findAllPublished.mockResolvedValue([]);
    productServiceMock.findBySlug.mockResolvedValue(productDetail('hidden-case', true));
    productServiceMock.findBySlugForPreview.mockImplementation((slug: string, id: string) =>
      Promise.resolve(id === PRODUCT_ID ? productDetail(slug, false) : null),
    );
  });

  describe('issuing', () => {
    it('issues a 24 h home link to an admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/preview-tokens')
        .set('Authorization', bearer('admin-1', 'ADMIN'))
        .send({ type: 'home' })
        .expect(201);

      expect(response.body.data).toEqual({
        token: expect.stringMatching(/^[\w-]+\.[\w-]+$/),
        path: '/',
        expiresAt: expect.any(String),
      });
      const ttl = new Date(response.body.data.expiresAt).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(23.9 * 3600 * 1000);
      expect(ttl).toBeLessThanOrEqual(24 * 3600 * 1000);
    });

    it('403 with no previewable right at all; 403 for the WRONG right; 201 for the right one', async () => {
      const manager = bearer('manager-1', 'MANAGER');
      await request(app.getHttpServer())
        .post('/api/admin/preview-tokens')
        .set('Authorization', manager)
        .send({ type: 'home' })
        .expect(403);

      permissions.setGrants(UserRole.MANAGER, ['products:read']);
      await request(app.getHttpServer())
        .post('/api/admin/preview-tokens')
        .set('Authorization', manager)
        .send({ type: 'home' })
        .expect(403);
      const product = await request(app.getHttpServer())
        .post('/api/admin/preview-tokens')
        .set('Authorization', manager)
        .send({ type: 'product', id: PRODUCT_ID })
        .expect(201);
      expect(product.body.data.path).toBe('/products/hidden-case');
    });

    it('400 for a missing id, 404 for a product that does not exist', async () => {
      const admin = bearer('admin-1', 'ADMIN');
      await request(app.getHttpServer())
        .post('/api/admin/preview-tokens')
        .set('Authorization', admin)
        .send({ type: 'product' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/admin/preview-tokens')
        .set('Authorization', admin)
        .send({ type: 'product', id: OTHER_PRODUCT_ID })
        .expect(404);
    });

    it('revoking needs settings:seo', async () => {
      permissions.setGrants(UserRole.MANAGER, ['home:write']);
      await request(app.getHttpServer())
        .delete('/api/admin/preview-tokens')
        .set('Authorization', bearer('manager-1', 'MANAGER'))
        .expect(403);
      expect(previewRepositoryMock.bumpVersion).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/home-blocks under a token', () => {
    const get = (token?: string) => {
      const req = request(app.getHttpServer()).get('/api/home-blocks');
      return token === undefined ? req : req.set('X-Preview-Token', token);
    };

    it('a home token opens drafts and marks the response private, no-store, noindex', async () => {
      const token = await issue({ type: 'home' });

      const response = await get(token).expect(200);

      expect(homeBlockRepositoryMock.findForPage).toHaveBeenLastCalledWith({
        includeUnpublished: true,
      });
      expect(response.body.data.map((b: { status: string }) => b.status)).toEqual([
        'PUBLISHED',
        'DRAFT',
      ]);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-robots-tag']).toBe('noindex');
    });

    it('ignores invalid, other-scope, expired and revoked tokens — byte-identical to no token', async () => {
      const baseline = await get().expect(200);
      expect(baseline.headers['x-robots-tag']).toBeUndefined();
      expect(baseline.headers['cache-control']).not.toBe('private, no-store');

      const productToken = await issue({ type: 'product', id: PRODUCT_ID });
      const key = derivePreviewKey(process.env.JWT_SECRET as string);
      const expired = signPreviewToken(
        { sc: 'home', exp: Math.floor(Date.now() / 1000) - 1, v: 0 },
        key,
      );
      const homeToken = await issue({ type: 'home' });
      const forged = `${homeToken.split('.')[0]}.AAAA`;

      for (const token of ['garbage', forged, productToken, expired]) {
        const response = await get(token).expect(200);
        expect(response.text).toBe(baseline.text);
        expect(response.headers['x-robots-tag']).toBeUndefined();
        expect(response.headers['cache-control']).toBe(baseline.headers['cache-control']);
      }

      // Revoke every link: the home token that worked a moment ago now does nothing.
      await get(homeToken).expect(200).expect('x-robots-tag', 'noindex');
      await request(app.getHttpServer())
        .delete('/api/admin/preview-tokens')
        .set('Authorization', bearer('admin-1', 'ADMIN'))
        .expect(204);
      const revoked = await get(homeToken).expect(200);
      expect(revoked.text).toBe(baseline.text);
      expect(revoked.headers['x-robots-tag']).toBeUndefined();
    });
  });

  it('GET /api/banners: a home token includes drafts; another scope does not', async () => {
    const homeToken = await issue({ type: 'home' });
    const pageToken = await issue({ type: 'page', id: PAGE_ID });

    await request(app.getHttpServer())
      .get('/api/banners')
      .set('X-Preview-Token', homeToken)
      .expect(200)
      .expect('cache-control', 'private, no-store');
    expect(bannerRepositoryMock.findAllPublished).toHaveBeenLastCalledWith({
      placement: undefined,
      includeUnpublished: true,
    });

    const other = await request(app.getHttpServer())
      .get('/api/banners')
      .set('X-Preview-Token', pageToken)
      .expect(200);
    expect(bannerRepositoryMock.findAllPublished).toHaveBeenLastCalledWith({
      placement: undefined,
    });
    expect(other.headers['x-robots-tag']).toBeUndefined();
  });

  it('GET /api/products/:slug: its own token opens the hidden product, another scope does not', async () => {
    const productToken = await issue({ type: 'product', id: PRODUCT_ID });
    const homeToken = await issue({ type: 'home' });

    const preview = await request(app.getHttpServer())
      .get('/api/products/hidden-case')
      .set('X-Preview-Token', productToken)
      .expect(200);
    expect(preview.body.data.isActive).toBe(false);
    expect(preview.headers['x-robots-tag']).toBe('noindex');
    expect(productServiceMock.findBySlug).not.toHaveBeenCalled();

    const normal = await request(app.getHttpServer())
      .get('/api/products/hidden-case')
      .set('X-Preview-Token', homeToken)
      .expect(200);
    expect(normal.body.data.isActive).toBe(true);
    expect(normal.headers['x-robots-tag']).toBeUndefined();
    // Only the product-scoped request ever asked for the hidden product.
    expect(productServiceMock.findBySlugForPreview).toHaveBeenCalledTimes(1);
  });

  describe('GET /api/preview-tokens/resolve', () => {
    it('answers the scope and current path for a good token', async () => {
      const token = await issue({ type: 'page', id: PAGE_ID });

      const response = await request(app.getHttpServer())
        .get('/api/preview-tokens/resolve')
        .set('X-Preview-Token', token)
        .expect(200);

      expect(response.body.data).toEqual({
        scope: `page:${PAGE_ID}`,
        path: '/legal/offer',
        expiresAt: expect.any(String),
      });
    });

    it('404s for a missing, garbage or revoked token', async () => {
      const token = await issue({ type: 'home' });
      await request(app.getHttpServer()).get('/api/preview-tokens/resolve').expect(404);
      await request(app.getHttpServer())
        .get('/api/preview-tokens/resolve')
        .set('X-Preview-Token', 'nope')
        .expect(404);
      version += 1;
      await request(app.getHttpServer())
        .get('/api/preview-tokens/resolve')
        .set('X-Preview-Token', token)
        .expect(404);
    });
  });
});
