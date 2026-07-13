import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { StoreLogoService } from './store-logo.service';
import { SeoSettingsService } from './seo-settings.service';
import { SeoSettingsEntity } from './entities';
import { ImageProcessor, STORAGE_SERVICE } from '../storage';

const SAFE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#1e78d2"/></svg>`;
const HOSTILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'logo.svg',
    encoding: '7bit',
    mimetype: 'image/svg+xml',
    size: 512,
    buffer: Buffer.from(SAFE_SVG, 'utf8'),
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function makeSettings(logoUrl: string | null): SeoSettingsEntity {
  const entity = SeoSettingsEntity.empty();
  entity.logoUrl = logoUrl;
  return entity;
}

describe('StoreLogoService', () => {
  let service: StoreLogoService;
  let settings: { getSettings: jest.Mock; updateSettings: jest.Mock };
  let storage: { save: jest.Mock; delete: jest.Mock };
  let imageProcessor: { process: jest.Mock; detectFormat: jest.Mock };

  beforeEach(async () => {
    settings = {
      getSettings: jest.fn().mockResolvedValue(makeSettings(null)),
      updateSettings: jest
        .fn()
        .mockImplementation((input: { logoUrl: string | null }) =>
          Promise.resolve(makeSettings(input.logoUrl)),
        ),
    };
    storage = {
      save: jest.fn().mockResolvedValue('branding/abc.svg'),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    imageProcessor = {
      process: jest.fn().mockResolvedValue({
        webp: Buffer.from('optimized-webp'),
        blurDataUrl: 'data:image/webp;base64,BLUR',
      }),
      detectFormat: jest.fn().mockResolvedValue('png'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoreLogoService,
        { provide: SeoSettingsService, useValue: settings },
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: ImageProcessor, useValue: imageProcessor },
        { provide: ConfigService, useValue: { get: () => 'http://localhost:3001' } },
      ],
    }).compile();

    service = module.get(StoreLogoService);
  });

  describe('uploadLogo — validation', () => {
    it('throws BadRequest when no file was sent', async () => {
      await expect(service.uploadLogo(undefined)).rejects.toThrow(BadRequestException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects a disallowed MIME type with 415', async () => {
      const bad = makeFile({ mimetype: 'application/pdf' });

      await expect(service.uploadLogo(bad)).rejects.toThrow(UnsupportedMediaTypeException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects a file over the 1 MB limit with 413', async () => {
      const big = makeFile({ size: 2 * 1024 * 1024 });

      await expect(service.uploadLogo(big)).rejects.toThrow(PayloadTooLargeException);
      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  describe('uploadLogo — SVG', () => {
    it('stores the SANITIZED markup, not the bytes the client sent', async () => {
      const hostile = makeFile({
        buffer: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><path d="M0 0h4v4H0z"/></svg>`,
          'utf8',
        ),
      });

      await service.uploadLogo(hostile);

      const [savedBuffer, savedExt, savedSubdir] = storage.save.mock.calls[0];
      const written = (savedBuffer as Buffer).toString('utf8');
      expect(written).not.toMatch(/script/i);
      expect(written).not.toMatch(/onload/i);
      expect(written).toContain('<path');
      expect(savedExt).toBe('svg');
      // Branding assets must not land in the products directory.
      expect(savedSubdir).toBe('branding');
    });

    it('rejects an SVG with nothing safe left after sanitization (400)', async () => {
      const hostile = makeFile({ buffer: Buffer.from(HOSTILE_SVG, 'utf8') });

      await expect(service.uploadLogo(hostile)).rejects.toThrow(BadRequestException);
      expect(storage.save).not.toHaveBeenCalled();
      expect(settings.updateSettings).not.toHaveBeenCalled();
    });

    it('persists the public logo URL on the settings singleton', async () => {
      const result = await service.uploadLogo(makeFile());

      expect(settings.updateSettings).toHaveBeenCalledWith({
        logoUrl: 'http://localhost:3001/uploads/branding/abc.svg',
      });
      expect(result.logoUrl).toBe('http://localhost:3001/uploads/branding/abc.svg');
    });

    it('does not run the raster processor on an SVG', async () => {
      await service.uploadLogo(makeFile());

      expect(imageProcessor.process).not.toHaveBeenCalled();
    });
  });

  describe('uploadLogo — raster', () => {
    const pngFile = () =>
      makeFile({
        mimetype: 'image/png',
        originalname: 'logo.png',
        buffer: Buffer.from('png-bytes'),
      });

    it('re-encodes the image to WebP and stores that, never the original bytes', async () => {
      storage.save.mockResolvedValue('branding/abc.webp');

      await service.uploadLogo(pngFile());

      expect(imageProcessor.detectFormat).toHaveBeenCalledTimes(1);
      const [savedBuffer, savedExt, savedSubdir] = storage.save.mock.calls[0];
      expect(savedBuffer).toEqual(Buffer.from('optimized-webp'));
      expect(savedExt).toBe('webp');
      expect(savedSubdir).toBe('branding');
    });

    it('rejects a file whose real content is not the declared image format (415)', async () => {
      // A polyglot uploaded as image/png: the Content-Type is a claim, sharp is the check.
      imageProcessor.detectFormat.mockResolvedValue(null);

      await expect(service.uploadLogo(pngFile())).rejects.toThrow(UnsupportedMediaTypeException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects a raster format outside the allow-list even if sharp can decode it', async () => {
      imageProcessor.detectFormat.mockResolvedValue('gif');

      await expect(service.uploadLogo(pngFile())).rejects.toThrow(UnsupportedMediaTypeException);
      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  describe('uploadLogo — replacing an existing logo', () => {
    it('deletes the previously stored file after the new URL is committed', async () => {
      settings.getSettings.mockResolvedValue(
        makeSettings('http://localhost:3001/uploads/branding/old.svg'),
      );

      await service.uploadLogo(makeFile());

      expect(storage.delete).toHaveBeenCalledWith('branding/old.svg');
      const saveOrder = storage.save.mock.invocationCallOrder[0];
      const deleteOrder = storage.delete.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeGreaterThan(saveOrder);
    });

    it('does not attempt a delete when there was no previous logo', async () => {
      await service.uploadLogo(makeFile());

      expect(storage.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteLogo', () => {
    it('clears logoUrl and removes the stored file', async () => {
      settings.getSettings.mockResolvedValue(
        makeSettings('http://localhost:3001/uploads/branding/old.svg'),
      );

      const result = await service.deleteLogo();

      expect(settings.updateSettings).toHaveBeenCalledWith({ logoUrl: null });
      expect(storage.delete).toHaveBeenCalledWith('branding/old.svg');
      expect(result.logoUrl).toBeNull();
    });

    it('is a no-op on disk when no logo is set', async () => {
      const result = await service.deleteLogo();

      expect(settings.updateSettings).toHaveBeenCalledWith({ logoUrl: null });
      expect(storage.delete).not.toHaveBeenCalled();
      expect(result.logoUrl).toBeNull();
    });
  });
});
