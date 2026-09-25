import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthRepository } from '../src/auth/auth.repository';
import { ProductRepository } from '../src/product/product.repository';
import { ProductImageRepository } from '../src/product/product-image.repository';
import { MediaRepository, MediaUsageRepository } from '../src/media';
import { ImageProcessor, STORAGE_SERVICE } from '../src/storage';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { HttpExceptionFilter } from '../src/common/filters';
import { IMAGE_MULTER_MAX_BYTES, MAX_FILES_PER_UPLOAD } from '../src/uploads';
import { createPermissionRepositoryMock } from './permission-repository.mock';

/**
 * E2E tests for the product image endpoints. Repositories and the storage
 * backend are mocked (no DB, no disk writes). JWT tokens are signed directly to
 * bypass the rate-limited auth endpoints; ThrottlerGuard is a pass-through.
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

const PRODUCT_ID = 'product-e2e-1';
const IMAGE_ID = '550e8400-e29b-41d4-a716-446655440000';
const ASSET_ID = '770e8400-e29b-41d4-a716-446655440222';
/** A real 1×1 GIF: the passthrough walks the block structure (TASK-587). */
const GIF_BYTES = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

describe('ProductImageController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const authRepositoryMock = { findById: jest.fn(), findByEmail: jest.fn() };

  const productRepositoryMock = {
    findById: jest.fn(),
  };

  const imageRepositoryMock = {
    getMaxSortOrder: jest.fn(),
    bulkCreate: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
    reorderForProduct: jest.fn(),
  };

  const mediaRepositoryMock = {
    findById: jest.fn(),
    findByUrl: jest.fn(),
  };

  const mediaUsageRepositoryMock = {
    findUsageForUrl: jest.fn(),
  };

  const storageMock = {
    save: jest.fn(),
    delete: jest.fn(),
  };

  // The `sharp`-based processor is mocked: e2e attaches fake (non-image) buffers,
  // which real `sharp` would reject. Unit specs cover the real encode path.
  const imageProcessorMock = {
    process: jest.fn(),
    detectFormat: jest.fn(),
    probe: jest.fn(),
  };

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  const testProduct = {
    id: PRODUCT_ID,
    slug: 'iphone-15-pro-case',
    name: 'iPhone 15 Pro Case',
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
      .overrideProvider(ProductRepository)
      .useValue(productRepositoryMock)
      .overrideProvider(ProductImageRepository)
      .useValue(imageRepositoryMock)
      .overrideProvider(MediaRepository)
      .useValue(mediaRepositoryMock)
      .overrideProvider(MediaUsageRepository)
      .useValue(mediaUsageRepositoryMock)
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
    // The filter `main.ts` installs, so the transport-limit tests below assert the
    // status AND the body the deployed app sends, not the framework's default
    // envelope.
    app.useGlobalFilters(moduleFixture.get(HttpExceptionFilter));
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    // Deleting a gallery row asks two questions before it touches the file
    // (TASK-585). The default answer here is "nobody else points at it", which
    // is what every pre-existing delete test assumes; the two tests that care
    // about sharing set their own answer. Note `clearAllMocks` clears CALLS but
    // keeps implementations, so these have to be re-stated per test, not once.
    mediaRepositoryMock.findByUrl.mockResolvedValue(null);
    mediaUsageRepositoryMock.findUsageForUrl.mockResolvedValue([]);
  });

  // ─── POST /api/products/:id/images ────────────────────────────────────────

  describe('POST /api/products/:id/images', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer()).post(`/api/products/${PRODUCT_ID}/images`).expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const token = generateAccessToken('customer-1', 'CUSTOMER');
      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', Buffer.from('fake-image'), {
          filename: 'a.jpg',
          contentType: 'image/jpeg',
        })
        .expect(403);
    });

    it('returns 201 with the created images for an admin + valid JPEG', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.getMaxSortOrder.mockResolvedValue(-1);
      imageRepositoryMock.bulkCreate.mockResolvedValue(undefined);
      storageMock.save.mockResolvedValue('products/generated.webp');
      imageProcessorMock.process.mockResolvedValue({
        webp: Buffer.from('optimized-webp'),
        blurDataUrl: 'data:image/webp;base64,BLUR',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', Buffer.from('fake-image'), {
          filename: 'a.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data[0].isPrimary).toBe(true);
      // The JPEG is pre-optimized to WebP and its LQIP is surfaced on the row.
      expect(imageProcessorMock.process).toHaveBeenCalledTimes(1);
      expect(storageMock.save).toHaveBeenCalledTimes(1);
      expect(storageMock.save.mock.calls[0][1]).toBe('webp');
      expect(response.body.data[0].blurDataUrl).toBe('data:image/webp;base64,BLUR');
    });

    it('passes an animated GIF through unprocessed with a null blurDataUrl', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.getMaxSortOrder.mockResolvedValue(-1);
      imageRepositoryMock.bulkCreate.mockResolvedValue(undefined);
      storageMock.save.mockResolvedValue('products/generated.gif');
      imageProcessorMock.probe.mockResolvedValue({ format: 'gif', width: 320, height: 240 });

      const response = await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', GIF_BYTES, {
          filename: 'a.gif',
          contentType: 'image/gif',
        })
        .expect(201);

      // GIFs bypass the re-encode entirely; the original ext is preserved.
      expect(imageProcessorMock.process).not.toHaveBeenCalled();
      expect(storageMock.save.mock.calls[0][1]).toBe('gif');
      expect(storageMock.save.mock.calls[0][2]).toBe('products');
      expect(response.body.data[0].blurDataUrl).toBeNull();
    });

    it('returns 415 for a non-GIF payload uploaded as image/gif', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.getMaxSortOrder.mockResolvedValue(-1);
      // `sharp` cannot decode it → the declared Content-Type was a lie.
      imageProcessorMock.probe.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', Buffer.from('<script>alert(1)</script>'), {
          filename: 'a.gif',
          contentType: 'image/gif',
        })
        .expect(415);

      expect(storageMock.save).not.toHaveBeenCalled();
    });

    // Both sides of MAX_IMAGE_BYTES, and only both sides: a 20 MB multipart body
    // through supertest costs real time, so the boundary gets two cases, not a
    // sweep.
    it('accepts a 20 MB photo — the size gallery images actually arrive at', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.getMaxSortOrder.mockResolvedValue(-1);
      imageRepositoryMock.bulkCreate.mockResolvedValue(undefined);
      storageMock.save.mockResolvedValue('products/generated.webp');
      imageProcessorMock.process.mockResolvedValue({
        webp: Buffer.from('optimized-webp'),
        blurDataUrl: 'data:image/webp;base64,BLUR',
      });
      const straightOffAPhone = Buffer.alloc(20 * 1024 * 1024, 1); // == MAX_IMAGE_BYTES

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', straightOffAPhone, { filename: 'big.jpg', contentType: 'image/jpeg' })
        .expect(201);

      // What lands in storage is the shrunk re-encode, never the 20 MB original.
      expect(storageMock.save).toHaveBeenCalledTimes(1);
      expect(storageMock.save.mock.calls[0][0]).toEqual(Buffer.from('optimized-webp'));
    });

    it('returns 413 for an oversized file', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      const big = Buffer.alloc(21 * 1024 * 1024, 1); // 21 MB > 20 MB business limit

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', big, { filename: 'big.jpg', contentType: 'image/jpeg' })
        .expect(413);
    });

    it('returns 400 for a non-image file', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', Buffer.from('plain text'), {
          filename: 'note.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });
  });

  // ─── Multer transport limits (TASK-583) ───────────────────────────────────
  //
  // Both Multer limits used to be documented from reading Nest's
  // `transformException`, never from a request. These run one: whatever the
  // running app answers is what the admin panel's error mapping has to handle,
  // and a Nest/Multer bump that changes it must fail here, not in front of an
  // operator. The repositories, the processor and the storage stay untouched in
  // every Multer refusal — the interceptor runs before the handler, so a call to
  // any of them would mean the limit did not fire where we think it does.

  describe('POST /api/products/:id/images — Multer transport limits', () => {
    function mockSuccessfulUpload(): void {
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.getMaxSortOrder.mockResolvedValue(-1);
      imageRepositoryMock.bulkCreate.mockResolvedValue(undefined);
      storageMock.save.mockResolvedValue('products/generated.webp');
      imageProcessorMock.process.mockResolvedValue({
        webp: Buffer.from('optimized-webp'),
        blurDataUrl: 'data:image/webp;base64,BLUR',
      });
    }

    function expectHandlerNeverRan(): void {
      expect(productRepositoryMock.findById).not.toHaveBeenCalled();
      expect(imageProcessorMock.process).not.toHaveBeenCalled();
      expect(imageRepositoryMock.bulkCreate).not.toHaveBeenCalled();
      expect(storageMock.save).not.toHaveBeenCalled();
    }

    function galleryUpload(fileCount: number) {
      const token = generateAccessToken('admin-1', 'ADMIN');
      let req = request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`);
      for (let i = 0; i < fileCount; i++) {
        req = req.attach('files', Buffer.from(`image-${i}`), {
          filename: `p${i}.jpg`,
          contentType: 'image/jpeg',
        });
      }
      return req;
    }

    it('lets a file of exactly the hard cap reach the service, which refuses it with its own 413', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      mockSuccessfulUpload();

      const response = await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', Buffer.alloc(IMAGE_MULTER_MAX_BYTES, 1), {
          filename: 'cap.jpg',
          contentType: 'image/jpeg',
        })
        .expect(413);

      // The explainable business refusal, not Multer's — the whole reason the
      // hard cap sits above MAX_IMAGE_BYTES.
      expect(response.body.message).not.toBe('File too large');
      expect(productRepositoryMock.findById).toHaveBeenCalled();
      expect(storageMock.save).not.toHaveBeenCalled();
    });

    it('answers 413 "File too large" from Multer for one byte over the hard cap', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      mockSuccessfulUpload();

      const response = await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images`)
        .set('Authorization', `Bearer ${token}`)
        .attach('files', Buffer.alloc(IMAGE_MULTER_MAX_BYTES + 1, 1), {
          filename: 'huge.jpg',
          contentType: 'image/jpeg',
        })
        .expect(413);

      expect(response.body).toMatchObject({
        statusCode: 413,
        error: 'Payload Too Large',
        message: 'File too large',
      });
      expectHandlerNeverRan();
    });

    it(`accepts exactly ${MAX_FILES_PER_UPLOAD} files in one request`, async () => {
      mockSuccessfulUpload();

      const response = await galleryUpload(MAX_FILES_PER_UPLOAD).expect(201);

      expect(response.body.data).toHaveLength(MAX_FILES_PER_UPLOAD);
      expect(storageMock.save).toHaveBeenCalledTimes(MAX_FILES_PER_UPLOAD);
    });

    it(`answers 400 "Too many files" from Multer for ${MAX_FILES_PER_UPLOAD + 1} files`, async () => {
      mockSuccessfulUpload();

      const response = await galleryUpload(MAX_FILES_PER_UPLOAD + 1).expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Too many files',
      });
      expectHandlerNeverRan();
    });
  });

  // ─── POST /api/products/:id/images/attach ─────────────────────────────────

  describe('POST /api/products/:id/images/attach', () => {
    const libraryAsset = {
      id: ASSET_ID,
      url: 'http://localhost:3001/uploads/media/autumn.webp',
      alt: 'Осіння банерна зйомка',
      blurDataUrl: 'data:image/webp;base64,LIBRARYBLUR',
    };

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images/attach`)
        .send({ mediaAssetId: ASSET_ID })
        .expect(401);
    });

    it('returns 403 for a non-admin user', async () => {
      const token = generateAccessToken('customer-1', 'CUSTOMER');
      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images/attach`)
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaAssetId: ASSET_ID })
        .expect(403);

      expect(imageRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('returns 201 with a row reusing the stored file, and saves nothing new', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      mediaRepositoryMock.findById.mockResolvedValue(libraryAsset);
      imageRepositoryMock.getMaxSortOrder.mockResolvedValue(-1);
      imageRepositoryMock.create.mockImplementation((input: unknown) => Promise.resolve(input));

      const response = await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images/attach`)
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaAssetId: ASSET_ID })
        .expect(201);

      expect(response.body.data.url).toBe(libraryAsset.url);
      expect(response.body.data.alt).toBe(libraryAsset.alt);
      expect(response.body.data.blurDataUrl).toBe(libraryAsset.blurDataUrl);
      // First picture of an empty gallery becomes the cover — the upload route's
      // rule, so the gallery behaves the same however a photo got into it.
      expect(response.body.data.isPrimary).toBe(true);
      expect(response.body.data.sortOrder).toBe(0);
      // One file on disk, two rows pointing at it.
      expect(storageMock.save).not.toHaveBeenCalled();
      expect(imageProcessorMock.process).not.toHaveBeenCalled();
      expect(imageRepositoryMock.create.mock.calls[0][0].mediaAssetId).toBe(ASSET_ID);
    });

    it('returns 404 for an asset that does not exist', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      mediaRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images/attach`)
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaAssetId: ASSET_ID })
        .expect(404);

      expect(imageRepositoryMock.create).not.toHaveBeenCalled();
    });

    it('returns 404 for a product that does not exist', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(null);
      mediaRepositoryMock.findById.mockResolvedValue(libraryAsset);

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images/attach`)
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaAssetId: ASSET_ID })
        .expect(404);
    });

    it('returns 400 when the body is not a UUID', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);

      await request(app.getHttpServer())
        .post(`/api/products/${PRODUCT_ID}/images/attach`)
        .set('Authorization', `Bearer ${token}`)
        .send({ mediaAssetId: 'http://evil.tld/photo.png' })
        .expect(400);

      expect(mediaRepositoryMock.findById).not.toHaveBeenCalled();
    });
  });

  // ─── PATCH /api/products/:id/images/reorder ───────────────────────────────

  describe('PATCH /api/products/:id/images/reorder', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/products/${PRODUCT_ID}/images/reorder`)
        .send({ items: [] })
        .expect(401);
    });

    it('returns 200 for an admin with a valid body', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.reorderForProduct.mockResolvedValue(true);

      await request(app.getHttpServer())
        .patch(`/api/products/${PRODUCT_ID}/images/reorder`)
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ id: IMAGE_ID, sortOrder: 0, isPrimary: true }] })
        .expect(200);

      expect(imageRepositoryMock.reorderForProduct).toHaveBeenCalledWith(PRODUCT_ID, [
        { id: IMAGE_ID, sortOrder: 0, isPrimary: true },
      ]);
    });

    // TASK-783: an image id of ANOTHER product (or one that does not exist)
    // answers 404 — before, it switched the other product's cover or, for an
    // unknown id, surfaced Prisma's P2025 as a 500. The repository's
    // product-scoped transaction matches no row for it and rolls back (proved on
    // Postgres in product-image-reorder.repository.int-spec.ts).
    it('returns 404 for an image of another product', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.reorderForProduct.mockResolvedValue(false);

      await request(app.getHttpServer())
        .patch(`/api/products/${PRODUCT_ID}/images/reorder`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            { id: IMAGE_ID, sortOrder: 1, isPrimary: false },
            { id: '660e8400-e29b-41d4-a716-446655440999', sortOrder: 0, isPrimary: true },
          ],
        })
        .expect(404);
    });

    it('returns 400 and writes nothing when the same image is listed twice', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);

      await request(app.getHttpServer())
        .patch(`/api/products/${PRODUCT_ID}/images/reorder`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            { id: IMAGE_ID, sortOrder: 0, isPrimary: false },
            { id: IMAGE_ID, sortOrder: 1, isPrimary: false },
          ],
        })
        .expect(400);

      expect(imageRepositoryMock.reorderForProduct).not.toHaveBeenCalled();
    });

    it('returns 400 when more than one image is primary', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);

      await request(app.getHttpServer())
        .patch(`/api/products/${PRODUCT_ID}/images/reorder`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            { id: IMAGE_ID, sortOrder: 0, isPrimary: true },
            { id: '660e8400-e29b-41d4-a716-446655440111', sortOrder: 1, isPrimary: true },
          ],
        })
        .expect(400);
    });
  });

  // ─── DELETE /api/products/:id/images/:imageId ─────────────────────────────

  describe('DELETE /api/products/:id/images/:imageId', () => {
    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
        .expect(401);
    });

    it('returns 204 for an admin deleting an existing image', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.findById.mockResolvedValue({
        id: IMAGE_ID,
        productId: PRODUCT_ID,
        url: 'http://localhost:3001/uploads/products/generated.jpg',
      });
      imageRepositoryMock.delete.mockResolvedValue({ id: IMAGE_ID });

      await request(app.getHttpServer())
        .delete(`/api/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(storageMock.delete).toHaveBeenCalledWith('products/generated.jpg');
    });

    // TASK-585. `attachAsset` means one file can back several galleries, so a
    // 204 here must not take the bytes with it when someone else still points
    // at them. The route still answers 204 — the row IS gone; what survives is
    // the file.
    it('returns 204 but keeps the file when the library still owns it', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.findById.mockResolvedValue({
        id: IMAGE_ID,
        productId: PRODUCT_ID,
        url: 'http://localhost:3001/uploads/media/autumn.webp',
      });
      imageRepositoryMock.delete.mockResolvedValue({ id: IMAGE_ID });
      mediaRepositoryMock.findByUrl.mockResolvedValue({
        id: ASSET_ID,
        url: 'http://localhost:3001/uploads/media/autumn.webp',
      });

      await request(app.getHttpServer())
        .delete(`/api/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(imageRepositoryMock.delete).toHaveBeenCalledWith(IMAGE_ID);
      expect(storageMock.delete).not.toHaveBeenCalled();
    });

    it('returns 204 but keeps the file when another product still shows it', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.findById.mockResolvedValue({
        id: IMAGE_ID,
        productId: PRODUCT_ID,
        url: 'http://localhost:3001/uploads/products/shared.webp',
      });
      imageRepositoryMock.delete.mockResolvedValue({ id: IMAGE_ID });
      mediaUsageRepositoryMock.findUsageForUrl.mockResolvedValue([
        { kind: 'PRODUCT_IMAGE', entityId: 'product-e2e-2', label: 'Чохол синій' },
      ]);

      await request(app.getHttpServer())
        .delete(`/api/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(storageMock.delete).not.toHaveBeenCalled();
    });

    it('returns 404 for a non-existent image', async () => {
      const token = generateAccessToken('admin-1', 'ADMIN');
      productRepositoryMock.findById.mockResolvedValue(testProduct);
      imageRepositoryMock.findById.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete(`/api/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
