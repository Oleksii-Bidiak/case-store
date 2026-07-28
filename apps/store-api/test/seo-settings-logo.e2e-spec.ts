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
import { ImageProcessor, STORAGE_SERVICE } from '../src/storage';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the store-logo endpoints (TASK-299).
 *
 * Mirrors seo-settings.e2e-spec.ts (mocked repositories + directly-signed JWTs, no
 * DB) and additionally mocks the storage backend and the `sharp` processor, so no
 * bytes ever reach the disk. The SVG sanitization itself runs for real — it is the
 * point of these tests.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const SAFE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#1e78d2"/></svg>`;
const XSS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><path d="M0 0h24v24H0z"/></svg>`;
const EMPTY_AFTER_SANITIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;

describe('SeoSettings logo (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = { findById: jest.fn(), findByEmail: jest.fn() };
  const userRepositoryMock = { findById: jest.fn(), findByEmail: jest.fn() };

  const seoSettingsRepositoryMock = {
    findSettings: jest.fn(),
    upsertSettings: jest.fn(),
    getContentSeoCounts: jest.fn(),
  };

  const storageMock = { save: jest.fn(), delete: jest.fn() };
  const imageProcessorMock = { process: jest.fn(), detectFormat: jest.fn() };

  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };

  const settingsRow = {
    id: SINGLETON_ID,
    defaultMetaTitle: null,
    defaultMetaDescription: null,
    titleTemplate: null,
    defaultOgImage: null,
    logoUrl: null as string | null,
    googleSiteVerification: null,
    bingSiteVerification: null,
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
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(UserRepository)
      .useValue(userRepositoryMock)
      .overrideProvider(SeoSettingsRepository)
      .useValue(seoSettingsRepositoryMock)
      .overrideProvider(STORAGE_SERVICE)
      .useValue(storageMock)
      .overrideProvider(ImageProcessor)
      .useValue(imageProcessorMock)
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
    jest.clearAllMocks();
  });

  // ─── AdminGuard ───────────────────────────────────────────────────────────────

  describe('POST /api/admin/seo-settings/logo (auth)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .attach('file', Buffer.from(SAFE_SVG), {
          filename: 'logo.svg',
          contentType: 'image/svg+xml',
        })
        .expect(401);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken('customer-e2e-1', 'CUSTOMER');

      await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from(SAFE_SVG), {
          filename: 'logo.svg',
          contentType: 'image/svg+xml',
        })
        .expect(403);

      expect(storageMock.save).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/seo-settings/logo (auth)', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).delete('/api/admin/seo-settings/logo').expect(401);
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken('customer-e2e-1', 'CUSTOMER');

      await request(app.getHttpServer())
        .delete('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(seoSettingsRepositoryMock.upsertSettings).not.toHaveBeenCalled();
    });
  });

  // ─── Upload (admin) ───────────────────────────────────────────────────────────

  describe('POST /api/admin/seo-settings/logo (admin)', () => {
    it('accepts an SVG, stores the sanitized markup and returns the updated settings', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      const logoUrl = 'http://localhost:3001/uploads/branding/abc.svg';
      seoSettingsRepositoryMock.findSettings.mockResolvedValue(settingsRow);
      seoSettingsRepositoryMock.upsertSettings.mockResolvedValue({ ...settingsRow, logoUrl });
      storageMock.save.mockResolvedValue('branding/abc.svg');

      const response = await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from(SAFE_SVG), {
          filename: 'logo.svg',
          contentType: 'image/svg+xml',
        })
        .expect(201);

      expect(response.body.data.logoUrl).toBe(logoUrl);
      const [buffer, ext, subdir] = storageMock.save.mock.calls[0];
      expect(ext).toBe('svg');
      expect(subdir).toBe('branding');
      expect((buffer as Buffer).toString('utf8')).toContain('<path');
    });

    it('strips script/onload from a hostile SVG before it is written to disk', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      seoSettingsRepositoryMock.findSettings.mockResolvedValue(settingsRow);
      seoSettingsRepositoryMock.upsertSettings.mockResolvedValue({
        ...settingsRow,
        logoUrl: 'http://localhost:3001/uploads/branding/abc.svg',
      });
      storageMock.save.mockResolvedValue('branding/abc.svg');

      await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from(XSS_SVG), {
          filename: 'evil.svg',
          contentType: 'image/svg+xml',
        })
        .expect(201);

      const written = (storageMock.save.mock.calls[0][0] as Buffer).toString('utf8');
      expect(written).not.toMatch(/script/i);
      expect(written).not.toMatch(/onload/i);
      expect(written).not.toContain('alert');
    });

    it('returns 400 when nothing safe survives sanitization', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      seoSettingsRepositoryMock.findSettings.mockResolvedValue(settingsRow);

      await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from(EMPTY_AFTER_SANITIZE_SVG), {
          filename: 'evil.svg',
          contentType: 'image/svg+xml',
        })
        .expect(400);

      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('accepts a PNG and stores the sharp-re-encoded WebP', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      seoSettingsRepositoryMock.findSettings.mockResolvedValue(settingsRow);
      seoSettingsRepositoryMock.upsertSettings.mockResolvedValue({
        ...settingsRow,
        logoUrl: 'http://localhost:3001/uploads/branding/abc.webp',
      });
      storageMock.save.mockResolvedValue('branding/abc.webp');
      imageProcessorMock.detectFormat.mockResolvedValue('png');
      imageProcessorMock.process.mockResolvedValue({
        webp: Buffer.from('optimized-webp'),
        blurDataUrl: 'data:image/webp;base64,BLUR',
      });

      await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('png-bytes'), {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(201);

      const [buffer, ext, subdir] = storageMock.save.mock.calls[0];
      expect(buffer).toEqual(Buffer.from('optimized-webp'));
      expect(ext).toBe('webp');
      expect(subdir).toBe('branding');
    });

    it('returns 415 when the bytes are not the declared image format', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      seoSettingsRepositoryMock.findSettings.mockResolvedValue(settingsRow);
      imageProcessorMock.detectFormat.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('<script>alert(1)</script>'), {
          filename: 'logo.png',
          contentType: 'image/png',
        })
        .expect(415);

      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('returns 400 for a disallowed MIME type (Multer fileFilter)', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('%PDF-1.4'), {
          filename: 'logo.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('returns 413 for a file over the 1 MB limit', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      seoSettingsRepositoryMock.findSettings.mockResolvedValue(settingsRow);

      await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.alloc(2 * 1024 * 1024, 1), {
          filename: 'big.png',
          contentType: 'image/png',
        })
        .expect(413);

      expect(storageMock.save).not.toHaveBeenCalled();
    });
  });

  // ─── Delete (admin) ───────────────────────────────────────────────────────────

  describe('DELETE /api/admin/seo-settings/logo (admin)', () => {
    it('clears logoUrl and removes the stored file', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      seoSettingsRepositoryMock.findSettings.mockResolvedValue({
        ...settingsRow,
        logoUrl: 'http://localhost:3001/uploads/branding/old.svg',
      });
      seoSettingsRepositoryMock.upsertSettings.mockResolvedValue({ ...settingsRow, logoUrl: null });

      const response = await request(app.getHttpServer())
        .delete('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.logoUrl).toBeNull();
      expect(seoSettingsRepositoryMock.upsertSettings).toHaveBeenCalledWith({ logoUrl: null });
      expect(storageMock.delete).toHaveBeenCalledWith('branding/old.svg');
    });
  });

  // ─── Public read ──────────────────────────────────────────────────────────────

  describe('GET /api/seo-settings', () => {
    it('exposes logoUrl to the storefront', async () => {
      const logoUrl = 'http://localhost:3001/uploads/branding/abc.svg';
      seoSettingsRepositoryMock.findSettings.mockResolvedValue({ ...settingsRow, logoUrl });

      const response = await request(app.getHttpServer()).get('/api/seo-settings').expect(200);

      expect(response.body.data.logoUrl).toBe(logoUrl);
    });

    it('returns a null logoUrl when the row is unseeded', async () => {
      seoSettingsRepositoryMock.findSettings.mockResolvedValue(null);

      const response = await request(app.getHttpServer()).get('/api/seo-settings').expect(200);

      expect(response.body.data.logoUrl).toBeNull();
    });
  });
});
