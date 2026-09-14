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
import { MediaRepository } from '../src/media';
import { ImageProcessor, STORAGE_SERVICE } from '../src/storage';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
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
    updateMany: jest.fn(),
  };

  const mediaRepositoryMock = {
    findById: jest.fn(),
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
        .attach('files', Buffer.from('GIF89a-fake'), {
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
      imageRepositoryMock.updateMany.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .patch(`/api/products/${PRODUCT_ID}/images/reorder`)
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ id: IMAGE_ID, sortOrder: 0, isPrimary: true }] })
        .expect(200);

      expect(imageRepositoryMock.updateMany).toHaveBeenCalledTimes(1);
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
