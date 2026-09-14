import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { ImageProcessor, STORAGE_SERVICE } from '../src/storage';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { MediaRepository } from '../src/media/media.repository';
import { MediaUsageRepository } from '../src/media/media-usage.repository';
import { MEDIA_USAGE_KINDS } from '../src/media/media-usage.types';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the media library (TASK-441, plan 177).
 *
 * THE PERMISSION AXIS IS THE POINT. `media:read` and `media:write` are two brand
 * new keys, and a new key is denied to everybody by default — so the failure
 * mode this feature ships with is not a crash but an empty screen. The manager
 * in this suite holds `media:read` AND NOTHING ELSE, which is exactly the shape
 * the picker needs (list assets while editing a banner) and exactly the shape
 * that must not be able to upload, retag or delete anything. A suite that only
 * proved "admin can do it" would pass against a controller with one key on every
 * route.
 *
 * Repositories are mocked, like every other admin e2e here: the questions being
 * asked are routing, authorisation and the response envelope, none of which need
 * a database. The usage scan's fourteen sources are covered by
 * `media-usage.repository.spec.ts`.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const PNG_BYTES = Buffer.from('png-bytes');

const ASSET_URL = 'http://localhost:3001/uploads/media/abc.webp';

const ASSET = {
  id: 'asset-1',
  url: ASSET_URL,
  blurDataUrl: 'data:image/webp;base64,BLUR',
  width: 2000,
  height: 1333,
  bytes: 184320,
  mime: 'image/webp',
  alt: 'Чохол',
  tags: ['iphone'],
  uploadedById: 'admin-e2e-1',
  createdAt: new Date('2026-09-14T10:00:00.000Z'),
  updatedAt: new Date('2026-09-14T10:00:00.000Z'),
};

describe('MediaController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = { findById: jest.fn(), findByEmail: jest.fn() };
  const storageMock = { save: jest.fn(), read: jest.fn(), delete: jest.fn() };
  const imageProcessorMock = { process: jest.fn(), detectFormat: jest.fn(), probe: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };

  const mediaRepositoryMock = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByUrl: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const mediaUsageRepositoryMock = { findUsage: jest.fn(), findUsageForUrl: jest.fn() };

  function generateAccessToken(userId: string, role: string): string {
    return jwtService.sign(
      { sub: userId, role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  }

  const asAdmin = (): string => generateAccessToken('admin-e2e-1', 'ADMIN');
  /** A content manager who may LIST the library and do nothing else to it. */
  const asReadOnlyManager = (): string => generateAccessToken('manager-e2e-1', 'MANAGER');
  const asShopper = (): string => generateAccessToken('customer-e2e-1', 'CUSTOMER');

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
      .useValue(createPermissionRepositoryMock({ grants: { [UserRole.MANAGER]: ['media:read'] } }))
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
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

  beforeEach(() => {
    storageMock.save.mockResolvedValue('media/abc.webp');
    imageProcessorMock.probe.mockResolvedValue({ format: 'png', width: 2000, height: 1333 });
    imageProcessorMock.detectFormat.mockResolvedValue('png');
    imageProcessorMock.process.mockResolvedValue({
      webp: Buffer.from('optimized-webp'),
      blurDataUrl: 'data:image/webp;base64,BLUR',
      width: 2000,
      height: 1333,
      bytes: Buffer.from('optimized-webp').length,
    });

    mediaRepositoryMock.findAll.mockResolvedValue({ assets: [ASSET], total: 1 });
    mediaRepositoryMock.findById.mockResolvedValue(ASSET);
    mediaRepositoryMock.create.mockResolvedValue(ASSET);
    mediaRepositoryMock.update.mockResolvedValue({ ...ASSET, alt: 'Новий опис' });
    mediaRepositoryMock.delete.mockResolvedValue(undefined);
    mediaUsageRepositoryMock.findUsage.mockResolvedValue(new Map([[ASSET_URL, []]]));
    mediaUsageRepositoryMock.findUsageForUrl.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Reading ──────────────────────────────────────────────────────────────

  describe('GET /api/admin/media', () => {
    it('returns the { data, meta } envelope with a usage count per row', async () => {
      mediaUsageRepositoryMock.findUsage.mockResolvedValue(
        new Map([
          [
            ASSET_URL,
            [{ kind: MEDIA_USAGE_KINDS.BRAND_LOGO, entityId: 'brand-1', label: 'Spigen' }],
          ],
        ]),
      );

      const response = await request(app.getHttpServer())
        .get('/api/admin/media')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(200);

      expect(response.body.meta).toEqual({ total: 1, page: 1, limit: 24, totalPages: 1 });
      expect(response.body.data[0]).toMatchObject({
        id: 'asset-1',
        url: ASSET_URL,
        width: 2000,
        mime: 'image/webp',
        usedInCount: 1,
      });
    });

    it('passes the search and tag filters through to the repository', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/media?search=iphone&tag=банер&page=2&limit=10')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(200);

      expect(mediaRepositoryMock.findAll).toHaveBeenCalledWith({
        search: 'iphone',
        tag: 'банер',
        page: 2,
        limit: 10,
      });
    });

    it('refuses a page size above the usage-scan cap', async () => {
      // The page's urls are what the usage scan is handed, and that scan refuses
      // to be asked about more than it can safely scan. Two numbers that must
      // agree, so the DTO enforces the same one.
      await request(app.getHttpServer())
        .get('/api/admin/media?limit=5000')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(400);
    });

    it('lets a manager who holds ONLY media:read list the library', async () => {
      // This is the picker's request, made from inside a banner form by someone
      // who has no product or media write rights at all.
      await request(app.getHttpServer())
        .get('/api/admin/media')
        .set('Authorization', `Bearer ${asReadOnlyManager()}`)
        .expect(200);
    });

    it('refuses a signed-in shopper', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/media')
        .set('Authorization', `Bearer ${asShopper()}`)
        .expect(403);
    });

    it('refuses an unauthenticated caller', async () => {
      await request(app.getHttpServer()).get('/api/admin/media').expect(401);
    });
  });

  describe('GET /api/admin/media/:id', () => {
    it('returns the asset with every place that uses it', async () => {
      mediaUsageRepositoryMock.findUsageForUrl.mockResolvedValue([
        { kind: MEDIA_USAGE_KINDS.PAGE_CONTENT, entityId: 'page-1', label: 'Доставка' },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/admin/media/asset-1')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(200);

      expect(response.body.data.usedIn).toEqual([
        { kind: 'PAGE_CONTENT', entityId: 'page-1', label: 'Доставка' },
      ]);
    });

    it('404s for an unknown id', async () => {
      mediaRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/admin/media/nope')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(404);
    });
  });

  // ─── Writing ──────────────────────────────────────────────────────────────

  describe('POST /api/admin/media', () => {
    it('stores the re-encoded file under the media subdir and records its real size', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/admin/media')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .field('alt', 'Чохол')
        .field('tags', 'iphone,Чохли,iPhone')
        .attach('file', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' })
        .expect(201);

      const [buffer, ext, subdir] = storageMock.save.mock.calls[0];
      expect(buffer).toEqual(Buffer.from('optimized-webp'));
      expect(ext).toBe('webp');
      expect(subdir).toBe('media');

      expect(mediaRepositoryMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: ASSET_URL,
          width: 2000,
          height: 1333,
          bytes: Buffer.from('optimized-webp').length,
          mime: 'image/webp',
          alt: 'Чохол',
          // A comma-separated multipart field, de-duplicated case-insensitively
          // — «iphone» and «iPhone» are one tag, and a library where they are
          // two silently hides half the assets behind a filter.
          tags: ['iphone', 'Чохли'],
          uploadedById: 'admin-e2e-1',
        }),
      );
      expect(response.body.data.usedIn).toEqual([]);
    });

    it('returns 400 when no file part is present', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/media')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(400);

      expect(mediaRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('refuses a manager who holds media:read but not media:write', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/media')
        .set('Authorization', `Bearer ${asReadOnlyManager()}`)
        .attach('file', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' })
        .expect(403);

      expect(storageMock.save).not.toHaveBeenCalled();
      expect(mediaRepositoryMock.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/admin/media/:id', () => {
    it('edits alt text and tags', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/media/asset-1')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ alt: 'Новий опис', tags: ['банер'] })
        .expect(200);

      expect(mediaRepositoryMock.update).toHaveBeenCalledWith('asset-1', {
        alt: 'Новий опис',
        tags: ['банер'],
      });
    });

    it('rejects a body that tries to set anything else', async () => {
      // `forbidNonWhitelisted` — url, width and bytes are facts about the stored
      // file, not fields an operator may retype.
      await request(app.getHttpServer())
        .patch('/api/admin/media/asset-1')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .send({ url: 'http://evil.example/x.png' })
        .expect(400);
    });

    it('refuses a manager who holds media:read but not media:write', async () => {
      await request(app.getHttpServer())
        .patch('/api/admin/media/asset-1')
        .set('Authorization', `Bearer ${asReadOnlyManager()}`)
        .send({ alt: 'Новий опис' })
        .expect(403);

      expect(mediaRepositoryMock.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/media/:id', () => {
    it('deletes an unused asset and its file', async () => {
      await request(app.getHttpServer())
        .delete('/api/admin/media/asset-1')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(204);

      expect(mediaRepositoryMock.delete).toHaveBeenCalledWith('asset-1');
      expect(storageMock.delete).toHaveBeenCalledWith('media/abc.webp');
    });

    it('refuses with 409 and names where the image is still used', async () => {
      mediaUsageRepositoryMock.findUsageForUrl.mockResolvedValue([
        { kind: MEDIA_USAGE_KINDS.PRODUCT_IMAGE, entityId: 'p1', label: 'iPhone 16 Pro' },
        { kind: MEDIA_USAGE_KINDS.SEO_STORE_LOGO, entityId: 'seo', label: 'Site settings' },
      ]);

      const response = await request(app.getHttpServer())
        .delete('/api/admin/media/asset-1')
        .set('Authorization', `Bearer ${asAdmin()}`)
        .expect(409);

      expect(response.body.message).toContain('iPhone 16 Pro');
      expect(response.body.message).toContain('SEO_STORE_LOGO');
      // Nothing removed: neither the row nor the bytes a live page still serves.
      expect(mediaRepositoryMock.delete).not.toHaveBeenCalled();
      expect(storageMock.delete).not.toHaveBeenCalled();
    });

    it('refuses a manager who holds media:read but not media:write', async () => {
      await request(app.getHttpServer())
        .delete('/api/admin/media/asset-1')
        .set('Authorization', `Bearer ${asReadOnlyManager()}`)
        .expect(403);

      expect(mediaRepositoryMock.delete).not.toHaveBeenCalled();
    });
  });
});
