import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { MediaAsset } from '@prisma/client';
import { ImageUploadService, type StoredImage } from '../uploads';
import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { MediaUsageRepository } from './media-usage.repository';
import { MEDIA_USAGE_KINDS, MediaUsage, MediaUsageKind } from './media-usage.types';

const ASSET_ID = 'asset-1';
const ASSET_URL = 'http://localhost:3001/uploads/media/asset-1.webp';

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: ASSET_ID,
    url: ASSET_URL,
    blurDataUrl: 'data:image/webp;base64,BLUR',
    width: 2000,
    height: 1333,
    bytes: 184320,
    mime: 'image/webp',
    alt: 'Чохол',
    tags: ['iphone'],
    uploadedById: 'admin-1',
    originalFilename: 'photo.jpg',
    originalMime: 'image/jpeg',
    createdAt: new Date('2026-09-14T10:00:00.000Z'),
    updatedAt: new Date('2026-09-14T10:00:00.000Z'),
    ...overrides,
  };
}

function makeStored(overrides: Partial<StoredImage> = {}): StoredImage {
  return {
    url: ASSET_URL,
    relativePath: 'media/asset-1.webp',
    blurDataUrl: 'data:image/webp;base64,BLUR',
    width: 2000,
    height: 1333,
    bytes: 184320,
    mime: 'image/webp',
    sourceMime: 'image/jpeg',
    ...overrides,
  };
}

function makeFile(): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'photo.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('binary'),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}

describe('MediaService', () => {
  let service: MediaService;
  let repository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByUrl: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let usage: { findUsage: jest.Mock; findUsageForUrl: jest.Mock };
  let uploads: { store: jest.Mock; removeByUrl: jest.Mock };

  beforeEach(async () => {
    repository = {
      findAll: jest
        .fn()
        .mockResolvedValue({ assets: [], total: 0, counts: { all: 0, unused: 0, noAlt: 0 } }),
      findById: jest.fn().mockResolvedValue(makeAsset()),
      findByUrl: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeAsset()),
      update: jest.fn().mockResolvedValue(makeAsset()),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    usage = {
      findUsage: jest.fn().mockResolvedValue(new Map()),
      findUsageForUrl: jest.fn().mockResolvedValue([]),
    };
    uploads = {
      store: jest.fn().mockResolvedValue(makeStored()),
      removeByUrl: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: MediaRepository, useValue: repository },
        { provide: MediaUsageRepository, useValue: usage },
        { provide: ImageUploadService, useValue: uploads },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(MediaService);
  });

  describe('findAll', () => {
    it('returns one page of items with honest pagination meta', async () => {
      repository.findAll.mockResolvedValue({
        assets: [makeAsset()],
        total: 125,
        counts: { all: 125, unused: 0, noAlt: 0 },
      });
      usage.findUsage.mockResolvedValue(new Map([[ASSET_URL, []]]));

      const result = await service.findAll({ page: 2, limit: 24 });

      expect(result.meta).toMatchObject({ total: 125, page: 2, limit: 24, totalPages: 6 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].url).toBe(ASSET_URL);
    });

    it('scans usage ONCE for the whole page, not once per row', async () => {
      const second = makeAsset({ id: 'asset-2', url: `${ASSET_URL}?2` });
      repository.findAll.mockResolvedValue({ assets: [makeAsset(), second], total: 2 });
      usage.findUsage.mockResolvedValue(
        new Map([
          [ASSET_URL, [{ kind: MEDIA_USAGE_KINDS.BRAND_LOGO, entityId: 'b', label: 'Spigen' }]],
          [second.url, []],
        ]),
      );

      const result = await service.findAll({});

      expect(usage.findUsage).toHaveBeenCalledTimes(1);
      expect(usage.findUsage).toHaveBeenCalledWith([ASSET_URL, second.url]);
      expect(result.items.map((row) => row.usedInCount)).toEqual([1, 0]);
    });

    it('counts usage from the SAME source the delete gate refuses on', async () => {
      // The grid badge and the delete refusal must never disagree: an asset the
      // list calls unused and the delete then rejects is a bug an operator reads
      // as the software lying to them.
      repository.findAll.mockResolvedValue({
        assets: [makeAsset()],
        total: 1,
        counts: { all: 1, unused: 0, noAlt: 0 },
      });
      usage.findUsage.mockResolvedValue(
        new Map([
          [
            ASSET_URL,
            [{ kind: MEDIA_USAGE_KINDS.PAGE_CONTENT, entityId: 'page-1', label: 'Доставка' }],
          ],
        ]),
      );

      const listed = await service.findAll({});
      expect(listed.items[0].usedInCount).toBe(1);

      usage.findUsageForUrl.mockResolvedValue([
        { kind: MEDIA_USAGE_KINDS.PAGE_CONTENT, entityId: 'page-1', label: 'Доставка' },
      ]);
      await expect(service.delete(ASSET_ID)).rejects.toThrow(ConflictException);
    });

    it('defaults to page 1 when the caller names none', async () => {
      const result = await service.findAll({});

      expect(result.meta.page).toBe(1);
      expect(repository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 24 }),
      );
    });

    it('defaults to every asset, newest first (TASK-1730)', async () => {
      await service.findAll({});

      expect(repository.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ view: 'all', sort: 'newest' }),
      );
    });

    it('passes the view and the sort through to the repository (TASK-1730)', async () => {
      await service.findAll({ view: 'unused', sort: 'largest', search: 'банер', tag: 'осінь' });

      expect(repository.findAll).toHaveBeenCalledWith({
        search: 'банер',
        tag: 'осінь',
        view: 'unused',
        sort: 'largest',
        page: 1,
        limit: 24,
      });
    });

    it('reports the three view counters in meta, next to the paging (TASK-1730)', async () => {
      repository.findAll.mockResolvedValue({
        assets: [makeAsset()],
        total: 2,
        counts: { all: 128, unused: 2, noAlt: 1 },
      });

      const result = await service.findAll({ view: 'unused' });

      expect(result.meta).toEqual({
        total: 2,
        page: 1,
        limit: 24,
        totalPages: 1,
        counts: { all: 128, unused: 2, noAlt: 1 },
      });
    });
  });

  describe('findById', () => {
    it('returns the asset with every place that uses it', async () => {
      usage.findUsageForUrl.mockResolvedValue([
        { kind: MEDIA_USAGE_KINDS.BRAND_LOGO, entityId: 'brand-1', label: 'Spigen' },
      ]);

      const asset = await service.findById(ASSET_ID);

      expect(asset.usedIn).toEqual([
        { kind: MEDIA_USAGE_KINDS.BRAND_LOGO, entityId: 'brand-1', label: 'Spigen' },
      ]);
      expect(asset.usedInCount).toBe(1);
    });

    it('orders usages by kind so two reads never shuffle them', async () => {
      usage.findUsageForUrl.mockResolvedValue([
        { kind: MEDIA_USAGE_KINDS.SEO_STORE_LOGO, entityId: 'seo', label: 'Site settings' },
        { kind: MEDIA_USAGE_KINDS.PRODUCT_IMAGE, entityId: 'p1', label: 'iPhone' },
        { kind: MEDIA_USAGE_KINDS.BRAND_LOGO, entityId: 'b1', label: 'Spigen' },
      ]);

      const asset = await service.findById(ASSET_ID);

      expect(asset.usedIn.map((one) => one.kind)).toEqual([
        MEDIA_USAGE_KINDS.PRODUCT_IMAGE,
        MEDIA_USAGE_KINDS.BRAND_LOGO,
        MEDIA_USAGE_KINDS.SEO_STORE_LOGO,
      ]);
    });

    it('404s for an id that is not in the library', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('upload', () => {
    it('stores through the shared pipeline, into the media subdir', async () => {
      await service.upload(makeFile(), {}, 'admin-1');

      // The ONE image pipeline (TASK-424), not a second copy — and the subdir is
      // a module constant, so nothing request-derived ever becomes a path.
      expect(uploads.store).toHaveBeenCalledWith(expect.anything(), 'media');
    });

    it('records the facts about what was actually written', async () => {
      uploads.store.mockResolvedValue(
        makeStored({ width: 1600, height: 900, bytes: 90210, mime: 'image/webp' }),
      );

      await service.upload(makeFile(), { alt: 'Чохол', tags: ['iphone'] }, 'admin-1');

      expect(repository.create).toHaveBeenCalledWith({
        url: ASSET_URL,
        blurDataUrl: 'data:image/webp;base64,BLUR',
        width: 1600,
        height: 900,
        bytes: 90210,
        mime: 'image/webp',
        alt: 'Чохол',
        tags: ['iphone'],
        uploadedById: 'admin-1',
        originalFilename: 'photo.jpg',
        originalMime: 'image/jpeg',
      });
    });

    it('records the file name the operator picked, cleaned up (TASK-1731)', async () => {
      const file = { ...makeFile(), originalname: 'C:\\Фото\\  Банер осінь.jpg ' };

      await service.upload(file, {}, 'admin-1');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ originalFilename: 'Банер осінь.jpg' }),
      );
    });

    it('records the DETECTED source type, not the one the client declared (TASK-1731)', async () => {
      uploads.store.mockResolvedValue(makeStored({ sourceMime: 'image/png' }));

      await service.upload({ ...makeFile(), mimetype: 'image/jpeg' }, {}, 'admin-1');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ originalMime: 'image/png' }),
      );
    });

    it('returns both on the created asset (TASK-1731)', async () => {
      const asset = await service.upload(makeFile(), {}, 'admin-1');

      expect(asset.originalFilename).toBe('photo.jpg');
      expect(asset.originalMime).toBe('image/jpeg');
    });

    it('stores no row when the pipeline rejects the file', async () => {
      uploads.store.mockRejectedValue(new Error('unsupported'));

      await expect(service.upload(makeFile(), {}, 'admin-1')).rejects.toThrow('unsupported');
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('defaults alt to null and tags to an empty list', async () => {
      await service.upload(makeFile(), {}, 'admin-1');

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ alt: null, tags: [] }),
      );
    });
  });

  describe('recordStored (TASK-2041)', () => {
    it('records a file another pipeline already stored, without storing it again', async () => {
      const logoUrl = 'http://localhost:3001/uploads/branding/logo.svg';

      await service.recordStored(
        {
          url: logoUrl,
          blurDataUrl: null,
          width: 0,
          height: 0,
          bytes: 512,
          mime: 'image/svg+xml',
          sourceMime: 'image/svg+xml',
        },
        'C:\\Лого\\ logo.svg ',
        'admin-1',
      );

      expect(uploads.store).not.toHaveBeenCalled();
      expect(repository.create).toHaveBeenCalledWith({
        url: logoUrl,
        blurDataUrl: null,
        width: 0,
        height: 0,
        bytes: 512,
        mime: 'image/svg+xml',
        alt: null,
        tags: [],
        uploadedById: 'admin-1',
        originalFilename: 'logo.svg',
        originalMime: 'image/svg+xml',
      });
    });
  });

  describe('isLibraryAsset (TASK-2041)', () => {
    it('is true when a library row holds the URL', async () => {
      repository.findByUrl.mockResolvedValue(makeAsset());

      await expect(service.isLibraryAsset(ASSET_URL)).resolves.toBe(true);
      expect(repository.findByUrl).toHaveBeenCalledWith(ASSET_URL);
    });

    it('is false when no row holds it', async () => {
      await expect(service.isLibraryAsset(ASSET_URL)).resolves.toBe(false);
    });
  });

  describe('update', () => {
    it('writes alt and tags', async () => {
      await service.update(ASSET_ID, { alt: 'Новий опис', tags: ['банер'] });

      expect(repository.update).toHaveBeenCalledWith(ASSET_ID, {
        alt: 'Новий опис',
        tags: ['банер'],
      });
    });

    it('turns a cleared alt field into null, not into the empty string', async () => {
      // `alt=""` is a real, DIFFERENT statement in HTML — "decorative, skip me" —
      // and the admin input sends it whenever the operator clears the box.
      await service.update(ASSET_ID, { alt: '   ' });

      expect(repository.update).toHaveBeenCalledWith(ASSET_ID, { alt: null });
    });

    it('leaves a field alone when the patch does not mention it', async () => {
      await service.update(ASSET_ID, { tags: ['банер'] });

      expect(repository.update).toHaveBeenCalledWith(ASSET_ID, { tags: ['банер'] });
    });

    it('does not write at all for an empty patch', async () => {
      await service.update(ASSET_ID, {});

      expect(repository.update).not.toHaveBeenCalled();
    });

    it('404s for an id that is not in the library', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.update('nope', { alt: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('removes the row first and the file second', async () => {
      const order: string[] = [];
      repository.delete.mockImplementation(() => {
        order.push('row');
        return Promise.resolve();
      });
      uploads.removeByUrl.mockImplementation(() => {
        order.push('file');
        return Promise.resolve();
      });

      await service.delete(ASSET_ID);

      // A failed file delete then leaves orphan bytes nobody sees; the other
      // order leaves a row pointing at a file that is gone, which every screen
      // showing the library renders as a broken thumbnail.
      expect(order).toEqual(['row', 'file']);
      expect(uploads.removeByUrl).toHaveBeenCalledWith(ASSET_URL);
    });

    it('404s for an id that is not in the library', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.delete('nope')).rejects.toThrow(NotFoundException);
      expect(uploads.removeByUrl).not.toHaveBeenCalled();
    });

    /**
     * EVERY SOURCE, SEPARATELY.
     *
     * The delete gate is the only thing standing between "tidy up the library"
     * and a broken image on a live page: an asset's URL is copied into these
     * columns as a plain string, and no foreign key stops the delete. A single
     * "refuses when used" test passes while thirteen of the fourteen sources are
     * wired to nothing.
     */
    describe.each(Object.values(MEDIA_USAGE_KINDS))('used as %s', (kind: MediaUsageKind) => {
      const usageRow: MediaUsage = { kind, entityId: 'entity-1', label: 'Щось' };

      it('refuses the delete', async () => {
        usage.findUsageForUrl.mockResolvedValue([usageRow]);

        await expect(service.delete(ASSET_ID)).rejects.toThrow(ConflictException);
      });

      it('touches neither the row nor the file', async () => {
        usage.findUsageForUrl.mockResolvedValue([usageRow]);

        await expect(service.delete(ASSET_ID)).rejects.toThrow(ConflictException);
        expect(repository.delete).not.toHaveBeenCalled();
        expect(uploads.removeByUrl).not.toHaveBeenCalled();
      });

      it('names where it is used, so the refusal is actionable', async () => {
        usage.findUsageForUrl.mockResolvedValue([usageRow]);

        await expect(service.delete(ASSET_ID)).rejects.toThrow(
          expect.objectContaining({ message: expect.stringContaining(kind) }),
        );
        await expect(service.delete(ASSET_ID)).rejects.toThrow(
          expect.objectContaining({ message: expect.stringContaining('Щось') }),
        );
      });
    });

    it('counts every place in the refusal, and truncates a long list honestly', async () => {
      usage.findUsageForUrl.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => ({
          kind: MEDIA_USAGE_KINDS.PRODUCT_IMAGE,
          entityId: `p${i}`,
          label: `Товар ${i}`,
        })),
      );

      await expect(service.delete(ASSET_ID)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(/used in 12 place\(s\).*and 4 more/s),
        }),
      );
    });
  });
});
