import { Test, TestingModule } from '@nestjs/testing';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import { PermissionGuard } from '../auth/permissions';
import { UploadsController } from './content-uploads.controller';
import { MediaService } from './media.service';
import { MediaAssetDetailEntity } from './entities';

const USER_ID = 'editor-1';

const asset = Object.assign(new MediaAssetDetailEntity(), {
  id: 'asset-1',
  url: 'http://localhost:3001/uploads/media/abc.webp',
  blurDataUrl: 'data:image/webp;base64,BLUR',
  width: 2000,
  height: 1333,
  bytes: 184320,
  mime: 'image/webp',
  alt: null,
  tags: [],
  uploadedById: USER_ID,
  originalFilename: 'cover.png',
  originalMime: 'image/png',
  usedInCount: 0,
  usedIn: [],
  createdAt: new Date('2026-11-16T10:00:00.000Z'),
  updatedAt: new Date('2026-11-16T10:00:00.000Z'),
});

const file = { originalname: 'cover.png', buffer: Buffer.from('png') } as Express.Multer.File;

/**
 * The content-field upload routes record a library asset (TASK-2042): an editor who
 * holds `<kind>:write` but not `media:write` must not be able to put a file on the
 * disk that the library does not know about.
 */
describe('UploadsController (content-field uploads)', () => {
  let controller: UploadsController;
  const mediaMock = { upload: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: MediaService, useValue: mediaMock }],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(UploadsController);
    mediaMock.upload.mockResolvedValue(asset);
  });

  afterEach(() => jest.clearAllMocks());

  it.each([
    ['uploadCategoryImage', 'categories'],
    ['uploadBrandLogo', 'brands'],
    ['uploadBannerImage', 'banners'],
    ['uploadBlogCover', 'blog'],
  ] as const)('%s stores the file as a library asset owned by the uploader', async (handler) => {
    await controller[handler](USER_ID, file);

    // No alt, no tags — the content form has neither field; the library's own
    // screen is where they get curated.
    expect(mediaMock.upload).toHaveBeenCalledWith(file, {}, USER_ID);
  });

  it('keeps the response shape the content forms already consume: { data: { url, blurDataUrl } }', async () => {
    const response = await controller.uploadBannerImage(USER_ID, file);

    expect(response).toEqual({
      data: { url: asset.url, blurDataUrl: asset.blurDataUrl },
    });
  });

  it('passes a pipeline rejection through untouched', async () => {
    mediaMock.upload.mockRejectedValue(new UnsupportedMediaTypeException());

    await expect(controller.uploadBlogCover(USER_ID, file)).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });
});
