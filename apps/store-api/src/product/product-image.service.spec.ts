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
import { STORAGE_SERVICE } from '../storage';

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
  let cache: { del: jest.Mock; delByPrefix: jest.Mock };

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
      save: jest.fn().mockResolvedValue('products/abc.jpg'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delByPrefix: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductImageService,
        { provide: ProductRepository, useValue: productRepository },
        { provide: ProductImageRepository, useValue: imageRepository },
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: CacheService, useValue: cache },
        { provide: ConfigService, useValue: { get: () => 'http://localhost:3001' } },
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
      expect(rows[0].url).toBe('http://localhost:3001/uploads/products/abc.jpg');
      expect(rows[0].alt).toBe('a');

      expect(cache.del).toHaveBeenCalled();
      expect(cache.delByPrefix).toHaveBeenCalled();
      expect(result).toHaveLength(2);
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
