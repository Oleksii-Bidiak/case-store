import { Test, TestingModule } from '@nestjs/testing';
import { CarouselSource, PublishStatus } from '@prisma/client';
import { CarouselController } from './carousels.controller';
import { AdminCarouselController } from './admin-carousels.controller';
import { CarouselService } from './carousels.service';
import { CarouselEntity, CarouselItemEntity, PublicCarouselEntity } from './entities';

const entity = Object.assign(new CarouselEntity(), {
  id: 'carousel-uuid-1',
  title: 'Хіти продажів',
  source: CarouselSource.BESTSELLING,
  categoryId: null,
  itemLimit: 12,
  sortOrder: 0,
  status: PublishStatus.PUBLISHED,
  publishedAt: new Date('2026-07-01T00:00:00.000Z'),
  scheduledAt: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z'),
});

const publicEntity = Object.assign(new PublicCarouselEntity(), {
  id: 'carousel-uuid-1',
  title: 'Хіти продажів',
  source: CarouselSource.BESTSELLING,
  sortOrder: 0,
  products: [],
});

const itemEntity = Object.assign(new CarouselItemEntity(), {
  id: 'item-1',
  productId: 'product-1',
  sortOrder: 0,
  product: {
    id: 'product-1',
    name: 'Case',
    imageUrl: null,
    price: '29.99',
    isActive: true,
  },
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
  getItems: jest.fn(),
  setItems: jest.fn(),
};

describe('Carousel controllers', () => {
  let publicController: CarouselController;
  let adminController: AdminCarouselController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CarouselController, AdminCarouselController],
      providers: [{ provide: CarouselService, useValue: serviceMock }],
    }).compile();

    publicController = module.get<CarouselController>(CarouselController);
    adminController = module.get<AdminCarouselController>(AdminCarouselController);
  });

  describe('CarouselController (public)', () => {
    it('returns the published carousel list envelope (empty products included)', async () => {
      serviceMock.findAllPublished.mockResolvedValue({ data: [publicEntity] });

      const result = await publicController.findAll();

      expect(result).toEqual({ data: [publicEntity] });
      expect(serviceMock.findAllPublished).toHaveBeenCalledWith();
    });
  });

  describe('AdminCarouselController', () => {
    it('list forwards the query to the service', async () => {
      serviceMock.findAllAdmin.mockResolvedValue({ data: [entity] });

      const result = await adminController.findAll({ status: PublishStatus.DRAFT });

      expect(result).toEqual({ data: [entity] });
      expect(serviceMock.findAllAdmin).toHaveBeenCalledWith({ status: PublishStatus.DRAFT });
    });

    it('findById wraps the entity in a data envelope', async () => {
      serviceMock.findByIdAdmin.mockResolvedValue(entity);

      const result = await adminController.findById('carousel-uuid-1');

      expect(result).toEqual({ data: entity });
      expect(serviceMock.findByIdAdmin).toHaveBeenCalledWith('carousel-uuid-1');
    });

    it('create delegates to the service and wraps the result', async () => {
      serviceMock.create.mockResolvedValue(entity);

      const dto = { title: 'Хіти продажів', source: CarouselSource.BESTSELLING };
      const result = await adminController.create(dto);

      expect(result).toEqual({ data: entity });
      expect(serviceMock.create).toHaveBeenCalledWith(dto);
    });

    it('update delegates to the service and wraps the result', async () => {
      serviceMock.update.mockResolvedValue(entity);

      const result = await adminController.update('carousel-uuid-1', { title: 'Renamed' });

      expect(result).toEqual({ data: entity });
      expect(serviceMock.update).toHaveBeenCalledWith('carousel-uuid-1', { title: 'Renamed' });
    });

    it('publish delegates to the service', async () => {
      serviceMock.publish.mockResolvedValue(entity);

      const result = await adminController.publish('carousel-uuid-1');

      expect(result).toEqual({ data: entity });
      expect(serviceMock.publish).toHaveBeenCalledWith('carousel-uuid-1');
    });

    it('unpublish delegates to the service', async () => {
      serviceMock.unpublish.mockResolvedValue({ ...entity, status: PublishStatus.DRAFT });

      const result = await adminController.unpublish('carousel-uuid-1');

      expect(result.data.status).toBe(PublishStatus.DRAFT);
      expect(serviceMock.unpublish).toHaveBeenCalledWith('carousel-uuid-1');
    });

    it('delete delegates to the service', async () => {
      serviceMock.delete.mockResolvedValue(undefined);

      await adminController.delete('carousel-uuid-1');

      expect(serviceMock.delete).toHaveBeenCalledWith('carousel-uuid-1');
    });

    it('getItems wraps the item list in a data envelope', async () => {
      serviceMock.getItems.mockResolvedValue([itemEntity]);

      const result = await adminController.getItems('carousel-uuid-1');

      expect(result).toEqual({ data: [itemEntity] });
      expect(serviceMock.getItems).toHaveBeenCalledWith('carousel-uuid-1');
    });

    it('setItems forwards the payload and wraps the fresh list', async () => {
      serviceMock.setItems.mockResolvedValue([itemEntity]);

      const dto = { items: [{ productId: 'product-1', sortOrder: 0 }] };
      const result = await adminController.setItems('carousel-uuid-1', dto);

      expect(result).toEqual({ data: [itemEntity] });
      expect(serviceMock.setItems).toHaveBeenCalledWith('carousel-uuid-1', dto);
    });
  });
});
