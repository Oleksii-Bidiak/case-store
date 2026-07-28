import { Test, TestingModule } from '@nestjs/testing';
import { PermissionGuard } from '../auth/permissions';
import { BannerPlacement, PublishStatus } from '@prisma/client';
import { BannerController } from './banners.controller';
import { AdminBannerController } from './admin-banners.controller';
import { BannerService } from './banners.service';
import { BannerEntity } from './entities';

const entity = Object.assign(new BannerEntity(), {
  id: 'banner-uuid-1',
  placement: BannerPlacement.HERO_SLIDE,
  title: 'Summer Sale',
  subtitle: null,
  imageUrl: null,
  imageBlurDataUrl: null,
  ctaLabel: null,
  ctaHref: null,
  theme: null,
  sortOrder: 0,
  status: PublishStatus.PUBLISHED,
  publishedAt: new Date('2026-07-01T00:00:00.000Z'),
  scheduledAt: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
});

const serviceMock = {
  findAllPublished: jest.fn(),
  findAllAdmin: jest.fn(),
  findByIdAdmin: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  publish: jest.fn(),
  unpublish: jest.fn(),
  delete: jest.fn(),
};

describe('Banner controllers', () => {
  let publicController: BannerController;
  let adminController: AdminBannerController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BannerController, AdminBannerController],
      providers: [{ provide: BannerService, useValue: serviceMock }],
    })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    publicController = module.get<BannerController>(BannerController);
    adminController = module.get<AdminBannerController>(AdminBannerController);
  });

  describe('BannerController (public)', () => {
    it('returns the published banner list envelope', async () => {
      serviceMock.findAllPublished.mockResolvedValue({ data: [entity] });

      const result = await publicController.findAll({ placement: BannerPlacement.HERO_SLIDE });

      expect(result).toEqual({ data: [entity] });
      expect(serviceMock.findAllPublished).toHaveBeenCalledWith({
        placement: BannerPlacement.HERO_SLIDE,
      });
    });
  });

  describe('AdminBannerController', () => {
    it('list forwards the query to the service', async () => {
      serviceMock.findAllAdmin.mockResolvedValue({ data: [entity] });

      const result = await adminController.findAll({ status: PublishStatus.DRAFT });

      expect(result).toEqual({ data: [entity] });
      expect(serviceMock.findAllAdmin).toHaveBeenCalledWith({ status: PublishStatus.DRAFT });
    });

    it('findById wraps the entity in a data envelope', async () => {
      serviceMock.findByIdAdmin.mockResolvedValue(entity);

      const result = await adminController.findById('banner-uuid-1');

      expect(result).toEqual({ data: entity });
      expect(serviceMock.findByIdAdmin).toHaveBeenCalledWith('banner-uuid-1');
    });

    it('create delegates to the service and wraps the result', async () => {
      serviceMock.create.mockResolvedValue(entity);

      const dto = { placement: BannerPlacement.HERO_SLIDE, title: 'Summer Sale' };
      const result = await adminController.create(dto);

      expect(result).toEqual({ data: entity });
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
    });

    it('update delegates to the service and wraps the result', async () => {
      serviceMock.update.mockResolvedValue(entity);

      const result = await adminController.update('banner-uuid-1', { title: 'Renamed' });

      expect(result).toEqual({ data: entity });
      expect(serviceMock.update).toHaveBeenCalledWith('banner-uuid-1', { title: 'Renamed' });
    });

    it('publish delegates to the service', async () => {
      serviceMock.publish.mockResolvedValue(entity);

      const result = await adminController.publish('banner-uuid-1');

      expect(result).toEqual({ data: entity });
      expect(serviceMock.publish).toHaveBeenCalledWith('banner-uuid-1');
    });

    it('unpublish delegates to the service', async () => {
      serviceMock.unpublish.mockResolvedValue({ ...entity, status: PublishStatus.DRAFT });

      const result = await adminController.unpublish('banner-uuid-1');

      expect(result.data.status).toBe(PublishStatus.DRAFT);
      expect(serviceMock.unpublish).toHaveBeenCalledWith('banner-uuid-1');
    });

    it('delete delegates to the service', async () => {
      serviceMock.delete.mockResolvedValue(undefined);

      await adminController.delete('banner-uuid-1');

      expect(serviceMock.delete).toHaveBeenCalledWith('banner-uuid-1');
    });
  });
});
