import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ImageUploadService } from './image-upload.service';
import { ImageProcessor, STORAGE_SERVICE } from '../storage';

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
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
    ...overrides,
  };
}

describe('ImageUploadService', () => {
  let service: ImageUploadService;
  let storage: { save: jest.Mock; read: jest.Mock; delete: jest.Mock };
  let imageProcessor: { process: jest.Mock; detectFormat: jest.Mock };

  beforeEach(async () => {
    storage = {
      save: jest.fn().mockResolvedValue('content/abc.webp'),
      read: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    imageProcessor = {
      process: jest.fn().mockResolvedValue({
        webp: Buffer.from('optimized-webp'),
        blurDataUrl: 'data:image/webp;base64,BLUR',
      }),
      detectFormat: jest.fn().mockResolvedValue('jpeg'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageUploadService,
        { provide: STORAGE_SERVICE, useValue: storage },
        { provide: ImageProcessor, useValue: imageProcessor },
        { provide: ConfigService, useValue: { get: () => 'http://localhost:3001/' } },
      ],
    }).compile();

    service = module.get(ImageUploadService);
  });

  describe('subdir whitelist', () => {
    // The route surface enumerates its targets, so this check exists for the
    // callers that do NOT: a media library (plan 177) passing a subdir straight
    // out of a request. It is the single point where a subdir becomes a path.
    it.each(['nope', '../../etc', 'content/../branding', ''])(
      'refuses the un-whitelisted subdir %p without writing anything',
      async (subdir) => {
        await expect(service.store(makeFile(), subdir)).rejects.toThrow(BadRequestException);
        expect(storage.save).not.toHaveBeenCalled();
      },
    );

    it('accepts a whitelisted subdir and returns the public URL + LQIP', async () => {
      const stored = await service.store(makeFile(), 'content');

      expect(stored).toEqual({
        url: 'http://localhost:3001/uploads/content/abc.webp',
        relativePath: 'content/abc.webp',
        blurDataUrl: 'data:image/webp;base64,BLUR',
      });
      // The trailing slash on PUBLIC_BASE_URL must not double up in the URL.
      expect(stored.url).not.toContain('//uploads');
    });
  });

  describe('validation', () => {
    it('rejects a disallowed MIME type with 415', async () => {
      await expect(
        service.store(makeFile({ mimetype: 'application/pdf' }), 'content'),
      ).rejects.toThrow(UnsupportedMediaTypeException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects a file over 20 MB with 413', async () => {
      await expect(service.store(makeFile({ size: 21 * 1024 * 1024 }), 'content')).rejects.toThrow(
        PayloadTooLargeException,
      );
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('rejects an empty batch', async () => {
      await expect(service.storeAll([], 'content')).rejects.toThrow(BadRequestException);
    });

    it('rejects a missing file part', async () => {
      await expect(service.store(undefined, 'content')).rejects.toThrow(BadRequestException);
    });

    it('validates EVERY file before writing ANY of them', async () => {
      // A batch that wrote the good files first and then threw would leave bytes
      // on disk with no row pointing at them, and the caller could not tell which.
      const files = [makeFile(), makeFile({ mimetype: 'text/plain' }), makeFile()];

      await expect(service.storeAll(files, 'content')).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('translates an undecodable raster file into 415, not a 500', async () => {
      imageProcessor.process.mockRejectedValue(new Error('unsupported image format'));

      await expect(service.store(makeFile(), 'content')).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  describe('GIF passthrough', () => {
    it('stores the original bytes with no LQIP when the buffer really is a GIF', async () => {
      imageProcessor.detectFormat.mockResolvedValue('gif');
      storage.save.mockResolvedValue('content/abc.gif');
      const gif = makeFile({ mimetype: 'image/gif', buffer: Buffer.from('gif-bytes') });

      const stored = await service.store(gif, 'content');

      expect(imageProcessor.process).not.toHaveBeenCalled();
      const [buffer, ext] = storage.save.mock.calls[0];
      expect(buffer).toEqual(Buffer.from('gif-bytes'));
      expect(ext).toBe('gif');
      expect(stored.blurDataUrl).toBeNull();
    });

    it('sniffs the bytes rather than trusting image/gif', async () => {
      // This is the only branch that writes client bytes verbatim, so a polyglot
      // announced as a GIF would otherwise be served from our own origin.
      imageProcessor.detectFormat.mockResolvedValue(null);
      const polyglot = makeFile({
        mimetype: 'image/gif',
        buffer: Buffer.from('<script>alert(1)</script>'),
      });

      await expect(service.store(polyglot, 'content')).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  describe('removeByUrl', () => {
    it('deletes a file we served, by its storage-relative path', async () => {
      await service.removeByUrl('http://localhost:3001/uploads/content/abc.webp');
      expect(storage.delete).toHaveBeenCalledWith('content/abc.webp');
    });

    it('ignores a URL that is not ours to delete', async () => {
      await service.removeByUrl('https://cdn.example.com/logo.png');
      await service.removeByUrl(null);
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });
});
