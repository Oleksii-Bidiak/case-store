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
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the content-image upload routes (TASK-424).
 *
 * Mirrors seo-settings-logo.e2e-spec.ts and product-images.e2e-spec.ts: mocked
 * repositories + directly-signed JWTs (no DB), a mocked storage backend and a
 * mocked `sharp` processor, so no bytes ever reach the disk. The real
 * `sharp` encode path is covered by the storage unit specs.
 *
 * The permission axis is the point of this suite. The four routes exist BECAUSE
 * they carry four different permissions, so a manager who holds exactly one of
 * them must reach exactly one route — a test that only proves "admin can upload"
 * would pass against a single route with the wrong key on it.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const PNG_BYTES = Buffer.from('png-bytes');
const GIF_BYTES = Buffer.from('gif-bytes');

describe('UploadsController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = { findById: jest.fn(), findByEmail: jest.fn() };
  const storageMock = { save: jest.fn(), read: jest.fn(), delete: jest.fn() };
  const imageProcessorMock = { process: jest.fn(), detectFormat: jest.fn(), probe: jest.fn() };
  const prismaServiceMock = { $connect: jest.fn(), $disconnect: jest.fn() };

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
      // A content manager who may edit banners and nothing else.
      .useValue(
        createPermissionRepositoryMock({ grants: { [UserRole.MANAGER]: ['banners:write'] } }),
      )
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
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

  beforeEach(() => {
    storageMock.save.mockResolvedValue('content/abc.webp');
    imageProcessorMock.detectFormat.mockResolvedValue('png');
    imageProcessorMock.probe.mockResolvedValue({ format: 'png', width: 2000, height: 1333 });
    imageProcessorMock.process.mockResolvedValue({
      webp: Buffer.from('optimized-webp'),
      blurDataUrl: 'data:image/webp;base64,BLUR',
      width: 2000,
      height: 1333,
      bytes: Buffer.from('optimized-webp').length,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Happy path ───────────────────────────────────────────────────────────

  describe('POST /api/admin/uploads/categories', () => {
    it('stores the re-encoded WebP under the content subdir and returns its URL + LQIP', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      const response = await request(app.getHttpServer())
        .post('/api/admin/uploads/categories')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', PNG_BYTES, { filename: 'cover.png', contentType: 'image/png' })
        .expect(201);

      expect(response.body.data).toEqual({
        url: 'http://localhost:3001/uploads/content/abc.webp',
        blurDataUrl: 'data:image/webp;base64,BLUR',
      });

      const [buffer, ext, subdir] = storageMock.save.mock.calls[0];
      // The processed bytes, never the client's — and in the whitelisted subdir.
      expect(buffer).toEqual(Buffer.from('optimized-webp'));
      expect(ext).toBe('webp');
      expect(subdir).toBe('content');
    });

    it('returns 400 when no file part is present', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .post('/api/admin/uploads/categories')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(storageMock.save).not.toHaveBeenCalled();
    });
  });

  it('serves every one of the four content routes', async () => {
    const token = generateAccessToken('admin-e2e-1', 'ADMIN');

    for (const target of ['categories', 'brands', 'banners', 'blog']) {
      await request(app.getHttpServer())
        .post(`/api/admin/uploads/${target}`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);
    }

    expect(storageMock.save).toHaveBeenCalledTimes(4);
    // All four land in ONE subdir: which entity an image belongs to is recorded
    // in the row that points at it, not in the path.
    for (const call of storageMock.save.mock.calls) {
      expect(call[2]).toBe('content');
    }
  });

  it('passes an animated GIF through untouched with a null blurDataUrl', async () => {
    const token = generateAccessToken('admin-e2e-1', 'ADMIN');
    imageProcessorMock.probe.mockResolvedValue({ format: 'gif', width: 320, height: 240 });
    storageMock.save.mockResolvedValue('content/abc.gif');

    const response = await request(app.getHttpServer())
      .post('/api/admin/uploads/banners')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', GIF_BYTES, { filename: 'a.gif', contentType: 'image/gif' })
      .expect(201);

    expect(response.body.data.blurDataUrl).toBeNull();
    expect(imageProcessorMock.process).not.toHaveBeenCalled();
    const [buffer, ext] = storageMock.save.mock.calls[0];
    expect(buffer).toEqual(GIF_BYTES);
    expect(ext).toBe('gif');
  });

  // ─── Rejections ───────────────────────────────────────────────────────────

  describe('file validation', () => {
    it('rejects a non-image on its BYTES, not its declared MIME type (415)', async () => {
      // The GIF branch is the only one that writes client bytes verbatim, so the
      // declared Content-Type cannot be trusted there: a polyglot announced as
      // image/gif would otherwise be served from our own origin.
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      imageProcessorMock.probe.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/admin/uploads/categories')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('<script>alert(1)</script>'), {
          filename: 'evil.gif',
          contentType: 'image/gif',
        })
        .expect(415);

      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('rejects a raster file sharp cannot decode (415)', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');
      imageProcessorMock.process.mockRejectedValue(new Error('unsupported image format'));

      await request(app.getHttpServer())
        .post('/api/admin/uploads/brands')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('%PDF-1.4 renamed to .png'), {
          filename: 'evil.png',
          contentType: 'image/png',
        })
        .expect(415);

      expect(storageMock.save).not.toHaveBeenCalled();
    });

    // One accept and one refuse around MAX_IMAGE_BYTES, and no more than that:
    // a 20 MB multipart body through supertest is not free, so the boundary is
    // worth two cases and not a sweep.
    it('accepts a file at the 20 MB business limit (201)', async () => {
      // The case TASK-439 exists for: a photo straight off a phone, which the
      // old 5 MB cap refused outright. It is the server's job to shrink it now.
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .post('/api/admin/uploads/categories')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.alloc(20 * 1024 * 1024, 1), {
          filename: 'from-a-phone.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(storageMock.save).toHaveBeenCalledTimes(1);
    });

    it('rejects a file over the 20 MB business limit (413)', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .post('/api/admin/uploads/categories')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.alloc(21 * 1024 * 1024, 1), {
          filename: 'big.png',
          contentType: 'image/png',
        })
        .expect(413);

      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('rejects a disallowed MIME type before the service sees it (400)', async () => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      await request(app.getHttpServer())
        .post('/api/admin/uploads/categories')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('%PDF-1.4'), {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);

      expect(storageMock.save).not.toHaveBeenCalled();
    });
  });

  describe('upload target', () => {
    // The router enumerates the four targets, so an unknown one is not a
    // validation failure that has to be remembered — it is an unmatched route.
    // Nothing derived from the request ever becomes a path segment.
    it.each([
      ['an unknown target', '/api/admin/uploads/wat'],
      ['a non-public storage subdir', '/api/admin/uploads/imports'],
      ['a traversal attempt', '/api/admin/uploads/..%2F..%2Fetc'],
    ])('rejects %s without writing anything', async (_label, path) => {
      const token = generateAccessToken('admin-e2e-1', 'ADMIN');

      const response = await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' });

      expect(response.status).toBe(404);
      expect(storageMock.save).not.toHaveBeenCalled();
    });
  });

  // ─── Authorisation ────────────────────────────────────────────────────────

  describe('permissions', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/uploads/categories')
        .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
        .expect(401);

      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('returns 403 for a customer token', async () => {
      const token = generateAccessToken('customer-e2e-1', 'CUSTOMER');

      await request(app.getHttpServer())
        .post('/api/admin/uploads/categories')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
        .expect(403);

      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('lets a manager holding banners:write upload a banner image', async () => {
      const token = generateAccessToken('manager-e2e-1', 'MANAGER');

      await request(app.getHttpServer())
        .post('/api/admin/uploads/banners')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);

      expect(storageMock.save).toHaveBeenCalledTimes(1);
    });

    it.each(['categories', 'brands', 'blog'])(
      'refuses the same manager on /%s — the upload permission is the permission for the field',
      async (target) => {
        const token = generateAccessToken('manager-e2e-1', 'MANAGER');

        await request(app.getHttpServer())
          .post(`/api/admin/uploads/${target}`)
          .set('Authorization', `Bearer ${token}`)
          .attach('file', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
          .expect(403);

        expect(storageMock.save).not.toHaveBeenCalled();
      },
    );
  });
});
