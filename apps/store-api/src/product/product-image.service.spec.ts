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
import { ImageUploadService } from '../uploads';
import { MediaRepository, MediaUsageRepository, MEDIA_USAGE_KINDS } from '../media';
import { CATALOGUE_REVALIDATE_TARGET, RevalidationNotifier } from '../publishing';

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';
const SLUG = 'iphone-15-case';
const ASSET_ID = '22222222-2222-2222-2222-222222222222';

/** A library row as Prisma hands it back — only the fields an attach reads. */
const LIBRARY_ASSET = {
  id: ASSET_ID,
  url: 'http://localhost:3001/uploads/media/autumn.webp',
  alt: 'Осіння банерна зйомка',
  blurDataUrl: 'data:image/webp;base64,LIBRARYBLUR',
};

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
    create: jest.Mock;
    findById: jest.Mock;
    delete: jest.Mock;
    updateMany: jest.Mock;
  };
  let mediaRepository: { findById: jest.Mock; findByUrl: jest.Mock };
  let mediaUsage: { findUsageForUrl: jest.Mock };
  let storage: { save: jest.Mock; delete: jest.Mock };
  let imageProcessor: { process: jest.Mock; detectFormat: jest.Mock; probe: jest.Mock };
  let cache: { del: jest.Mock; delByPrefix: jest.Mock };
  let revalidation: { revalidate: jest.Mock };

  beforeEach(async () => {
    productRepository = {
      findById: jest.fn().mockResolvedValue({ id: PRODUCT_ID, slug: SLUG }),
    };
    imageRepository = {
      getMaxSortOrder: jest.fn().mockResolvedValue(-1),
      bulkCreate: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((input) => Promise.resolve(input)),
      findById: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn().mockResolvedValue(undefined),
    };
    mediaRepository = {
      findById: jest.fn().mockResolvedValue(LIBRARY_ASSET),
      // Default: the URL under test is NOT a library asset, i.e. an ordinary
      // photo uploaded straight into the gallery. The delete tests below opt
      // into the library case explicitly.
      findByUrl: jest.fn().mockResolvedValue(null),
    };
    mediaUsage = { findUsageForUrl: jest.fn().mockResolvedValue([]) };
    storage = {
      save: jest.fn().mockResolvedValue('products/abc.webp'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    imageProcessor = {
      process: jest.fn().mockResolvedValue({
        webp: Buffer.from('optimized-webp'),
        blurDataUrl: 'data:image/webp;base64,BLUR',
        width: 2000,
        height: 1333,
        bytes: Buffer.from('optimized-webp').length,
      }),
      detectFormat: jest.fn().mockResolvedValue('gif'),
      probe: jest.fn().mockResolvedValue({ format: 'gif', width: 320, height: 240 }),
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
        // The REAL shared pipeline (TASK-424), wired to the same storage and
        // `sharp` doubles this spec already had. Substituting a mock here would
        // turn every assertion below about WebP re-encoding, the GIF
        // passthrough, byte-sniffing and the 413/415 gates into an assertion
        // about the mock — the validation rules are the part of an image upload
        // most worth keeping under test, and they now live one class away.
        ImageUploadService,
        { provide: ProductRepository, useValue: productRepository },
        { provide: ProductImageRepository, useValue: imageRepository },
        { provide: MediaRepository, useValue: mediaRepository },
        { provide: MediaUsageRepository, useValue: mediaUsage },
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

    it('rejects a file exceeding the 20 MB limit', async () => {
      const big = makeFile({ size: 21 * 1024 * 1024 });
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
      imageProcessor.probe.mockResolvedValue(null);
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

  describe('attachAsset', () => {
    it('throws NotFound when the product does not exist', async () => {
      productRepository.findById.mockResolvedValue(null);

      await expect(service.attachAsset(PRODUCT_ID, ASSET_ID)).rejects.toThrow(NotFoundException);
      expect(imageRepository.create).not.toHaveBeenCalled();
    });

    it('throws NotFound when the media asset does not exist', async () => {
      mediaRepository.findById.mockResolvedValue(null);

      await expect(service.attachAsset(PRODUCT_ID, ASSET_ID)).rejects.toThrow(NotFoundException);
      // Nothing half-written: no gallery row, and no cache purge announcing a
      // change that never happened.
      expect(imageRepository.create).not.toHaveBeenCalled();
      expect(cache.del).not.toHaveBeenCalled();
    });

    it('reuses the stored file — the URL, LQIP and alt come off the asset, nothing is re-saved', async () => {
      const image = await service.attachAsset(PRODUCT_ID, ASSET_ID);

      // The whole point of a library: one file, two rows pointing at it.
      expect(storage.save).not.toHaveBeenCalled();
      expect(imageProcessor.process).not.toHaveBeenCalled();

      const row = imageRepository.create.mock.calls[0][0];
      expect(row.url).toBe(LIBRARY_ASSET.url);
      expect(row.blurDataUrl).toBe(LIBRARY_ASSET.blurDataUrl);
      expect(row.alt).toBe(LIBRARY_ASSET.alt);
      // Provenance, recorded but never used to answer "is this asset in use".
      expect(row.mediaAssetId).toBe(ASSET_ID);
      expect(image.url).toBe(LIBRARY_ASSET.url);
    });

    it('makes the first picture of an empty gallery the cover', async () => {
      imageRepository.getMaxSortOrder.mockResolvedValue(-1);

      await service.attachAsset(PRODUCT_ID, ASSET_ID);

      const row = imageRepository.create.mock.calls[0][0];
      expect(row.isPrimary).toBe(true);
      expect(row.sortOrder).toBe(0);
    });

    it('appends to a gallery that already has photos, leaving the cover alone', async () => {
      imageRepository.getMaxSortOrder.mockResolvedValue(2);

      await service.attachAsset(PRODUCT_ID, ASSET_ID);

      const row = imageRepository.create.mock.calls[0][0];
      expect(row.isPrimary).toBe(false);
      expect(row.sortOrder).toBe(3);
    });

    it('evicts the product caches and purges the storefront', async () => {
      await service.attachAsset(PRODUCT_ID, ASSET_ID);

      expect(cache.del).toHaveBeenCalled();
      expect(cache.delByPrefix).toHaveBeenCalled();
      expect(revalidation.revalidate).toHaveBeenCalledWith(CATALOGUE_REVALIDATE_TARGET);
    });
  });

  describe('deleteImage', () => {
    const GALLERY_IMAGE = {
      id: 'img-1',
      productId: PRODUCT_ID,
      url: 'http://localhost:3001/uploads/products/abc.jpg',
    };

    it('deletes the DB row then the stored file and evicts caches', async () => {
      imageRepository.findById.mockResolvedValue(GALLERY_IMAGE);
      imageRepository.delete.mockResolvedValue({ id: 'img-1' });

      await service.deleteImage(PRODUCT_ID, 'img-1');

      expect(imageRepository.delete).toHaveBeenCalledWith('img-1');
      expect(storage.delete).toHaveBeenCalledWith('products/abc.jpg');
      expect(cache.delByPrefix).toHaveBeenCalled();
    });

    // ─── TASK-585: the row and the file are two decisions ───────────────────
    //
    // `attachAsset` lets one stored photo back several galleries, and the
    // TASK-441 backfill made almost every existing photo a library asset. A row
    // delete that always deleted the file would pull it out from under whoever
    // else points at it.

    it('keeps the file when the same photo still backs another gallery', async () => {
      imageRepository.findById.mockResolvedValue(GALLERY_IMAGE);
      imageRepository.delete.mockResolvedValue({ id: 'img-1' });
      mediaUsage.findUsageForUrl.mockResolvedValue([
        { kind: MEDIA_USAGE_KINDS.PRODUCT_IMAGE, entityId: 'other-product', label: 'Чохол синій' },
      ]);

      await service.deleteImage(PRODUCT_ID, 'img-1');

      expect(imageRepository.delete).toHaveBeenCalledWith('img-1');
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('keeps the file when the library owns it, without sweeping usage', async () => {
      imageRepository.findById.mockResolvedValue(GALLERY_IMAGE);
      imageRepository.delete.mockResolvedValue({ id: 'img-1' });
      mediaRepository.findByUrl.mockResolvedValue(LIBRARY_ASSET);

      await service.deleteImage(PRODUCT_ID, 'img-1');

      expect(storage.delete).not.toHaveBeenCalled();
      // The library lookup answers it on its own — one indexed hit on a UNIQUE
      // column instead of the broader sweep, which is the common path after the
      // backfill.
      expect(mediaUsage.findUsageForUrl).not.toHaveBeenCalled();
    });

    it('asks about usage only after the row is gone, so it cannot count itself', async () => {
      imageRepository.findById.mockResolvedValue(GALLERY_IMAGE);
      const order: string[] = [];
      imageRepository.delete.mockImplementation(() => {
        order.push('delete-row');
        return Promise.resolve({ id: 'img-1' });
      });
      mediaUsage.findUsageForUrl.mockImplementation(() => {
        order.push('find-usage');
        return Promise.resolve([]);
      });

      await service.deleteImage(PRODUCT_ID, 'img-1');

      expect(order).toEqual(['delete-row', 'find-usage']);
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
