import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ProductImageService } from './product-image.service';
import { ProductRepository } from './product.repository';
import { ProductImageRepository } from './product-image.repository';
import { CacheService } from '../cache';
import { ImageProcessor, STORAGE_SERVICE } from '../storage';
import { CATALOGUE_REVALIDATE_TARGET, RevalidationNotifier } from '../publishing';

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';
const SLUG = 'iphone-15-case';

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'files',
    originalname: 'photo.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('binary'),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

describe('ProductImageService', () => {
  let service: ProductImageService;
  let productRepository: { findById: jest.Mock };
  let imageRepository: {
    getMaxSortOrder: jest.Mock;
    bulkCreate: jest.Mock;
    findById: jest.Mock;
    delete: jest.Mock;
    updateMany: jest.Mock;
  };
  let storage: { save: jest.Mock; delete: jest.Mock };
  let imageProcessor: { process: jest.Mock; detectFormat: jest.Mock };
  let cache: { del: jest.Mock; delByPrefix: jest.Mock };
  let revalidation: { revalidate: jest.Mock };

  beforeEach(async () => {
    productRepository = {
      findById: jest.fn().mockResolvedValue({ id: PRODUCT_ID, slug: SLUG }),
    };
    imageRepository = {
      getMaxSortOrder: jest.fn().mockResolvedValue(-1),
      bulkCreate: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn().mockResolvedValue(undefined),
    };
    storage = {
      save: jest.fn().mockResolvedValue('products/abc.webp'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    imageProcessor = {
      process: jest.fn().mockResolvedValue({
        webp: Buffer.from('optimized-webp'),
        blurDataUrl: 'data:image/webp;base64,BLUR',
      }),
      detectFormat: jest.fn().mockResolvedValue('gif'),
    };
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delByPrefix: jest.fn().mockResolvedValue(undefined),
    };
    revalidation = {
      revalidate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductImageService,
        { provide: ProductRepository, useValue: productRepository },
        { provide: ProductImageRepository, useValue: imageRepository },
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: ImageProcessor, useValue: imageProcessor },
        { provide: CacheService, useValue: cache },
        { provide: ConfigService, useValue: { get: () => 'http://localhost:3001' } },
        { provide: RevalidationNotifier, useValue: revalidation },
      ],
    }).compile();

    service = module.get(ProductImageService);
  });

  describe('uploadImages', () => {
    it('throws NotFound when the product does not exist', async () => {
      productRepository.findById.mockResolvedValue(null);
      await expect(service.uploadImages(PRODUCT_ID, [makeFile()])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects a file with a disallowed MIME type', async () => {
      const bad = makeFile({ mimetype: 'application/pdf' });
      await expect(service.uploadImages(PRODUCT_ID, [bad])).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects a file exceeding the 5 MB limit', async () => {
      const big = makeFile({ size: 6 * 1024 * 1024 });
      await expect(service.uploadImages(PRODUCT_ID, [big])).rejects.toThrow(
        PayloadTooLargeException,
      );
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('saves files, persists rows, marks the first as primary, and evicts caches', async () => {
      const result = await service.uploadImages(PRODUCT_ID, [makeFile(), makeFile()], ['a', 'b']);

      expect(storage.save).toHaveBeenCalledTimes(2);
      expect(imageRepository.bulkCreate).toHaveBeenCalledTimes(1);
      const rows = imageRepository.bulkCreate.mock.calls[0][0];
      expect(rows[0].isPrimary).toBe(true); // no existing images → first is primary
      expect(rows[1].isPrimary).toBe(false);
      expect(rows[0].sortOrder).toBe(0);
      expect(rows[1].sortOrder).toBe(1);
      expect(rows[0].url).toBe('http://localhost:3001/uploads/products/abc.webp');
      expect(rows[0].alt).toBe('a');

      expect(cache.del).toHaveBeenCalled();
      expect(cache.delByPrefix).toHaveBeenCalled();
      // A new photo changes what the homepage carousels show, and that HTML is
      // prerendered — evicting Redis alone leaves the old picture on the one page
      // customers land on first (TASK-384).
      expect(revalidation.revalidate).toHaveBeenCalledWith(CATALOGUE_REVALIDATE_TARGET);
      expect(result).toHaveLength(2);
    });

    it('completes the upload even when the storefront purge rejects', async () => {
      revalidation.revalidate.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(service.uploadImages(PRODUCT_ID, [makeFile()])).resolves.toHaveLength(1);
    });

    it('pre-optimizes raster uploads to WebP and persists the LQIP blurDataUrl', async () => {
      const result = await service.uploadImages(PRODUCT_ID, [makeFile()]);

      // Each accepted image goes through the processor before storage.
      expect(imageProcessor.process).toHaveBeenCalledTimes(1);
      // The WebP buffer (not the original) is stored, with a `webp` extension.
      const [savedBuffer, savedExt, savedSubdir] = storage.save.mock.calls[0];
      expect(savedBuffer).toEqual(Buffer.from('optimized-webp'));
      expect(savedExt).toBe('webp');
      expect(savedSubdir).toBe('products');

      const rows = imageRepository.bulkCreate.mock.calls[0][0];
      expect(rows[0].blurDataUrl).toBe('data:image/webp;base64,BLUR');
      // The returned entity carries the placeholder too.
      expect(result[0].blurDataUrl).toBe('data:image/webp;base64,BLUR');
    });

    it('passes animated GIFs through unprocessed with a null blurDataUrl', async () => {
      const gif = makeFile({ mimetype: 'image/gif', buffer: Buffer.from('gif-bytes') });

      const result = await service.uploadImages(PRODUCT_ID, [gif]);

      // GIFs skip the re-encode entirely to preserve animation.
      expect(imageProcessor.process).not.toHaveBeenCalled();
      const [savedBuffer, savedExt] = storage.save.mock.calls[0];
      expect(savedBuffer).toEqual(Buffer.from('gif-bytes'));
      expect(savedExt).toBe('gif');

      const rows = imageRepository.bulkCreate.mock.calls[0][0];
      expect(rows[0].blurDataUrl).toBeNull();
      expect(result[0].blurDataUrl).toBeNull();
    });

    it('rejects a non-GIF file uploaded as image/gif instead of writing it to disk', async () => {
      // The GIF branch is the only one that stores client bytes verbatim, so it
      // must sniff the buffer rather than trust the declared Content-Type — a
      // script polyglot would otherwise be served from our own origin.
      imageProcessor.detectFormat.mockResolvedValue(null);
      const polyglot = makeFile({
        mimetype: 'image/gif',
        buffer: Buffer.from('<script>alert(1)</script>'),
      });

      await expect(service.uploadImages(PRODUCT_ID, [polyglot])).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
      expect(storage.save).not.toHaveBeenCalled();
      expect(imageRepository.bulkCreate).not.toHaveBeenCalled();
    });

    it('does not mark a new image primary when the product already has images', async () => {
      imageRepository.getMaxSortOrder.mockResolvedValue(2);
      await service.uploadImages(PRODUCT_ID, [makeFile()]);
      const rows = imageRepository.bulkCreate.mock.calls[0][0];
      expect(rows[0].isPrimary).toBe(false);
      expect(rows[0].sortOrder).toBe(3);
    });
  });

  describe('deleteImage', () => {
    it('deletes the DB row then the stored file and evicts caches', async () => {
      imageRepository.findById.mockResolvedValue({
        id: 'img-1',
        productId: PRODUCT_ID,
        url: 'http://localhost:3001/uploads/products/abc.jpg',
      });
      imageRepository.delete.mockResolvedValue({ id: 'img-1' });

      await service.deleteImage(PRODUCT_ID, 'img-1');

      expect(imageRepository.delete).toHaveBeenCalledWith('img-1');
      expect(storage.delete).toHaveBeenCalledWith('products/abc.jpg');
      expect(cache.delByPrefix).toHaveBeenCalled();
    });

    it('throws NotFound when the image does not exist', async () => {
      imageRepository.findById.mockResolvedValue(null);
      await expect(service.deleteImage(PRODUCT_ID, 'missing')).rejects.toThrow(NotFoundException);
      expect(imageRepository.delete).not.toHaveBeenCalled();
    });

    it('throws NotFound when the image belongs to a different product', async () => {
      imageRepository.findById.mockResolvedValue({
        id: 'img-1',
        productId: 'other-product',
        url: 'http://localhost:3001/uploads/products/abc.jpg',
      });
      await expect(service.deleteImage(PRODUCT_ID, 'img-1')).rejects.toThrow(NotFoundException);
      expect(imageRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('reorderImages', () => {
    it('throws BadRequest when more than one image is primary', async () => {
      await expect(
        service.reorderImages(PRODUCT_ID, [
          { id: 'a', sortOrder: 0, isPrimary: true },
          { id: 'b', sortOrder: 1, isPrimary: true },
        ]),
      ).rejects.toThrow(BadRequestException);
      expect(imageRepository.updateMany).not.toHaveBeenCalled();
    });

    it('persists the new ordering and evicts caches', async () => {
      await service.reorderImages(PRODUCT_ID, [
        { id: 'a', sortOrder: 1, isPrimary: false },
        { id: 'b', sortOrder: 0, isPrimary: true },
      ]);
      expect(imageRepository.updateMany).toHaveBeenCalledTimes(1);
      expect(cache.delByPrefix).toHaveBeenCalled();
    });
  });
});
