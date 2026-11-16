import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { UserRepository } from '../src/user/user.repository';
import { SeoSettingsRepository, SINGLETON_ID } from '../src/seo-settings/seo-settings.repository';
import { ImageProcessor, STORAGE_SERVICE } from '../src/storage';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';
import { MediaRepository } from '../src/media/media.repository';
import { MediaUsageRepository } from '../src/media/media-usage.repository';
import { MEDIA_USAGE_KINDS } from '../src/media/media-usage.types';
import { createGlobalValidationPipe } from '../src/common/pipes';

/**
 * E2E tests for the store-logo endpoints (TASK-299).
 *
 * Mirrors seo-settings.e2e-spec.ts (mocked repositories + directly-signed JWTs, no
 * DB) and additionally mocks the storage backend and the `sharp` processor, so no
 * bytes ever reach the disk. The SVG sanitization itself runs for real — it is the
 * point of these tests.
 *
 * TASK-2041: the media repositories are an in-memory table rather than per-test
 * stubs, so "an uploaded logo is a library asset" is asserted through the
 * library's own `GET /admin/media`, not by inspecting a mock's arguments.
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

  /** In-memory `media_assets` + the logo currently set (TASK-2041). */
  type AssetRow = Record<string, unknown> & { id: string; url: string; mime: string };
  const mediaState: { assets: AssetRow[]; logoUrl: string | null } = { assets: [], logoUrl: null };

  const mediaRepositoryMock = {
    create: jest.fn(async (input: Record<string, unknown>) => {
      const row = {
        id: randomUUID(),
        ...input,
        createdAt: new Date('2026-11-16T10:00:00.000Z'),
        updatedAt: new Date('2026-11-16T10:00:00.000Z'),
      } as unknown as AssetRow;
      mediaState.assets.push(row);
      return row;
    }),
    findById: jest.fn(async (id: string) => mediaState.assets.find((a) => a.id === id) ?? null),
    findByUrl: jest.fn(async (url: string) => mediaState.assets.find((a) => a.url === url) ?? null),
    findAll: jest.fn(async () => ({
      assets: [...mediaState.assets],
      total: mediaState.assets.length,
      counts: { all: mediaState.assets.length, unused: 0, noAlt: 0 },
    })),
    update: jest.fn(),
    delete: jest.fn(async (id: string) => {
      mediaState.assets = mediaState.assets.filter((a) => a.id !== id);
    }),
  };

  /** The store logo is the only consumer modelled here: SEO_STORE_LOGO. */
  const logoUsage = (url: string) =>
    url === mediaState.logoUrl
      ? [{ kind: MEDIA_USAGE_KINDS.SEO_STORE_LOGO, entityId: SINGLETON_ID, label: 'Site settings' }]
      : [];
  const mediaUsageRepositoryMock = {
    findUsage: jest.fn(async (urls: string[]) => new Map(urls.map((u) => [u, logoUsage(u)]))),
    findUsageForUrl: jest.fn(async (url: string) => logoUsage(url)),
  };

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
      .useValue(
        // A content manager who may browse the library but not edit SEO settings.
        createPermissionRepositoryMock({ grants: { [UserRole.MANAGER]: ['media:read'] } }),
      )
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
      .overrideProvider(MediaRepository)
      .useValue(mediaRepositoryMock)
      .overrideProvider(MediaUsageRepository)
      .useValue(mediaUsageRepositoryMock)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);

    app.useGlobalPipes(createGlobalValidationPipe());
    app.setGlobalPrefix('api', { exclude: ['health'] });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mediaState.assets = [];
    mediaState.logoUrl = null;
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

  // ─── Media library (TASK-2041) ────────────────────────────────────────────────

  describe('the logo as a media-library asset (TASK-2041)', () => {
    const asAdmin = () => generateAccessToken('admin-e2e-1', 'ADMIN');
    const asManager = () => generateAccessToken('manager-e2e-1', 'MANAGER');

    beforeEach(() => {
      // Stateful settings singleton: the logo the usage scan sees is the one set.
      seoSettingsRepositoryMock.findSettings.mockImplementation(async () => ({
        ...settingsRow,
        logoUrl: mediaState.logoUrl,
      }));
      seoSettingsRepositoryMock.upsertSettings.mockImplementation(
        async (input: { logoUrl?: string | null }) => {
          if (input.logoUrl !== undefined) mediaState.logoUrl = input.logoUrl;
          return { ...settingsRow, logoUrl: mediaState.logoUrl };
        },
      );
    });

    const uploadSvg = (name = 'logo.svg') =>
      request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .attach('file', Buffer.from(SAFE_SVG), { filename: name, contentType: 'image/svg+xml' });

    it('an uploaded logo is listed by GET /admin/media, used in one place', async () => {
      storageMock.save.mockResolvedValueOnce('branding/first.svg');

      await uploadSvg('Лого.svg').expect(201);

      const list = await request(app.getHttpServer())
        .get('/api/admin/media')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({
        url: 'http://localhost:3001/uploads/branding/first.svg',
        mime: 'image/svg+xml',
        originalFilename: 'Лого.svg',
        originalMime: 'image/svg+xml',
        uploadedById: 'admin-e2e-1',
        usedInCount: 1,
      });
    });

    it('replacing the logo keeps the old asset and its file', async () => {
      storageMock.save
        .mockResolvedValueOnce('branding/first.svg')
        .mockResolvedValueOnce('branding/second.svg');

      await uploadSvg().expect(201);
      await uploadSvg().expect(201);

      expect(storageMock.delete).not.toHaveBeenCalled();
      expect(mediaState.assets.map((a) => a.url)).toEqual([
        'http://localhost:3001/uploads/branding/first.svg',
        'http://localhost:3001/uploads/branding/second.svg',
      ]);
      expect(mediaState.logoUrl).toBe('http://localhost:3001/uploads/branding/second.svg');
    });

    it('the replaced logo, now unused, is deleted through the library — file included', async () => {
      storageMock.save
        .mockResolvedValueOnce('branding/first.svg')
        .mockResolvedValueOnce('branding/second.svg');
      await uploadSvg().expect(201);
      await uploadSvg().expect(201);
      const [first, second] = mediaState.assets;

      // Still the logo → refused by the usage gate.
      await request(app.getHttpServer())
        .delete(`/api/admin/media/${second.id}`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/api/admin/media/${first.id}`)
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(204);
      expect(storageMock.delete).toHaveBeenCalledWith('branding/first.svg');
    });

    it('PUT sets the logo from a library asset and keeps the previous library logo', async () => {
      storageMock.save.mockResolvedValueOnce('branding/first.svg');
      await uploadSvg().expect(201);
      const picked = await mediaRepositoryMock.create({
        url: 'http://localhost:3001/uploads/media/pick.webp',
        mime: 'image/webp',
      });

      const response = await request(app.getHttpServer())
        .put('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ mediaAssetId: picked.id })
        .expect(200);

      expect(response.body.data.logoUrl).toBe('http://localhost:3001/uploads/media/pick.webp');
      expect(storageMock.delete).not.toHaveBeenCalled();
    });

    it('PUT still removes a legacy branding logo that has no library row', async () => {
      mediaState.logoUrl = 'http://localhost:3001/uploads/branding/legacy.svg';
      const picked = await mediaRepositoryMock.create({
        url: 'http://localhost:3001/uploads/media/pick.webp',
        mime: 'image/webp',
      });

      await request(app.getHttpServer())
        .put('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ mediaAssetId: picked.id })
        .expect(200);

      expect(storageMock.delete).toHaveBeenCalledWith('branding/legacy.svg');
    });

    it('PUT refuses a GIF asset with 400 and leaves the logo alone', async () => {
      const gif = await mediaRepositoryMock.create({
        url: 'http://localhost:3001/uploads/media/anim.gif',
        mime: 'image/gif',
      });

      await request(app.getHttpServer())
        .put('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ mediaAssetId: gif.id })
        .expect(400);

      expect(mediaState.logoUrl).toBeNull();
    });

    it('PUT answers 404 for an unknown asset and 400 for a malformed id', async () => {
      await request(app.getHttpServer())
        .put('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ mediaAssetId: randomUUID() })
        .expect(404);

      await request(app.getHttpServer())
        .put('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ mediaAssetId: 'not-a-uuid' })
        .expect(400);
    });

    it('a library reader without settings:seo gets 403 on PUT and POST', async () => {
      const picked = await mediaRepositoryMock.create({
        url: 'http://localhost:3001/uploads/media/pick.webp',
        mime: 'image/webp',
      });

      await request(app.getHttpServer())
        .put('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${asManager()}`)
        .send({ mediaAssetId: picked.id })
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/admin/seo-settings/logo')
        .set('Authorization', `Bearer ${asManager()}`)
        .attach('file', Buffer.from(SAFE_SVG), {
          filename: 'logo.svg',
          contentType: 'image/svg+xml',
        })
        .expect(403);

      expect(mediaState.logoUrl).toBeNull();
      expect(storageMock.save).not.toHaveBeenCalled();
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
