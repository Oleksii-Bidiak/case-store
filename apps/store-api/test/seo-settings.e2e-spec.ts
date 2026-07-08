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
import { SeoSettingsRepository, SINGLETON_ID } from '../src/seo-settings';
import { PrismaService } from '../src/prisma';

/**
 * E2E tests for the SeoSettings module (TASK-239).
 *
 * Mirrors site-contact.e2e-spec.ts: mocks AuthRepository, UserRepository,
 * SeoSettingsRepository, and PrismaService so no real database is required. JWT
 * tokens are minted directly via JwtService to bypass the rate-limited auth
 * endpoints.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

describe('SeoSettings (e2e)', () => {
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

  const seoSettingsRepositoryMock = {
    findSettings: jest.fn(),
    upsertSettings: jest.fn(),
    getContentSeoCounts: jest.fn(),
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

  const settingsRow = {
    id: SINGLETON_ID,
    defaultMetaTitle: null,
    defaultMetaDescription: 'Магазин аксесуарів',
    titleTemplate: null,
    defaultOgImage: null,
    noindexSite: false,
    llmsTxtSummary: null,
    additionalSameAsLinks: [] as string[],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
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
      .overrideProvider(SeoSettingsRepository)
      .useValue(seoSettingsRepositoryMock)
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

  // ─── Public endpoint ──────────────────────────────────────────────────────────

  describe('GET /api/seo-settings', () => {
    it('returns zero-config defaults when the row is unseeded', async () => {
      seoSettingsRepositoryMock.findSettings.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/api/seo-settings').expect(200);

      expect(response.body.data).toMatchObject({
        defaultMetaTitle: null,
        defaultMetaDescription: null,
        titleTemplate: null,
        noindexSite: false,
        additionalSameAsLinks: [],
      });
    });

    it('returns the stored values once the row exists', async () => {
      seoSettingsRepositoryMock.findSettings.mockResolvedValue(settingsRow);

      const response = await request(app.getHttpServer()).get('/api/seo-settings').expect(200);

      expect(response.body.data).toMatchObject({
        defaultMetaDescription: 'Магазин аксесуарів',
        noindexSite: false,
      });
    });
  });

  // ─── Admin guard ──────────────────────────────────────────────────────────────

  describe('PUT /api/admin/seo-settings (auth)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .put('/api/admin/seo-settings')
        .send({ defaultMetaTitle: 'Заголовок' })
        .expect(401);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .put('/api/admin/seo-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ defaultMetaTitle: 'Заголовок' })
        .expect(403);
    });
  });

  // ─── Admin mutation + validation ───────────────────────────────────────────────

  describe('PUT /api/admin/seo-settings (admin)', () => {
    it('upserts the settings and returns the submitted values', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      const body = {
        defaultMetaTitle: 'MobileStore',
        titleTemplate: '%s | MobileStore',
        noindexSite: true,
        additionalSameAsLinks: ['https://facebook.com/mobilestore'],
      };
      seoSettingsRepositoryMock.upsertSettings.mockResolvedValue({ ...settingsRow, ...body });

      const response = await request(app.getHttpServer())
        .put('/api/admin/seo-settings')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      expect(response.body.data).toMatchObject(body);
      expect(seoSettingsRepositoryMock.upsertSettings).toHaveBeenCalledWith(body);
    });

    it('returns 400 when titleTemplate has no %s token', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .put('/api/admin/seo-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ titleTemplate: 'MobileStore' })
        .expect(400);
    });

    it('accepts a titleTemplate with exactly one %s token', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      const body = { titleTemplate: '%s — MobileStore' };
      seoSettingsRepositoryMock.upsertSettings.mockResolvedValue({ ...settingsRow, ...body });

      await request(app.getHttpServer())
        .put('/api/admin/seo-settings')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);
    });

    it('returns 400 for an invalid OG image URL', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .put('/api/admin/seo-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ defaultOgImage: 'not-a-url' })
        .expect(400);
    });

    it('returns 400 when a sameAs link is not a valid URL', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .put('/api/admin/seo-settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ additionalSameAsLinks: ['https://ok.com', 'not-a-url'] })
        .expect(400);
    });
  });

  // ─── SEO-health checklist endpoint (TASK-269) ──────────────────────────────────

  describe('GET /api/admin/seo-settings/health', () => {
    const counts = {
      productsMissingMetaTitle: 12,
      productsTotal: 40,
      categoriesMissingMetaTitle: 3,
      categoriesTotal: 8,
      pagesMissingMetaTitle: 1,
      pagesTotal: 5,
    };

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).get('/api/admin/seo-settings/health').expect(401);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken(testCustomer.id, 'CUSTOMER');

      await request(app.getHttpServer())
        .get('/api/admin/seo-settings/health')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('returns the six catalog counts for an admin', async () => {
      const token = generateAccessToken(testAdmin.id, 'ADMIN');
      seoSettingsRepositoryMock.getContentSeoCounts.mockResolvedValue(counts);

      const response = await request(app.getHttpServer())
        .get('/api/admin/seo-settings/health')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data).toEqual(counts);
    });
  });
});
