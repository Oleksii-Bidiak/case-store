import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { DeviceRepository } from './device.repository';
import { DeviceService } from './device.service';
import { DeviceModelListQueryDto } from './dto';

const mockBrand = {
  id: 'brand-1',
  name: 'Apple',
  slug: 'apple',
  isActive: true,
  sortOrder: 0,
};

const mockModel = {
  id: 'model-1',
  deviceBrandId: 'brand-1',
  name: 'iPhone 15 Pro',
  slug: 'iphone-15-pro',
  series: 'iPhone 15',
  releaseYear: 2023,
  isActive: true,
  brand: { name: 'Apple' },
};

const deviceRepositoryMock = {
  findBrands: jest.fn(),
  findBrandsWithCount: jest.fn(),
  findBrandById: jest.fn(),
  findBrandBySlug: jest.fn(),
  createBrand: jest.fn(),
  updateBrand: jest.fn(),
  findModels: jest.fn(),
  findModelById: jest.fn(),
  findModelBySlug: jest.fn(),
  findModelsByIds: jest.fn(),
  createModel: jest.fn(),
  updateModel: jest.fn(),
};

describe('DeviceService', () => {
  let service: DeviceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeviceService, { provide: DeviceRepository, useValue: deviceRepositoryMock }],
    }).compile();
    service = module.get(DeviceService);
  });

  describe('getBrands', () => {
    it('returns active brands as entities', async () => {
      deviceRepositoryMock.findBrands.mockResolvedValue([mockBrand]);

      const result = await service.getBrands(true);

      expect(deviceRepositoryMock.findBrands).toHaveBeenCalledWith(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ id: 'brand-1', name: 'Apple', slug: 'apple' });
    });
  });

  describe('createBrand', () => {
    it('auto-generates the slug and rejects duplicates', async () => {
      deviceRepositoryMock.findBrandBySlug.mockResolvedValue(null);
      deviceRepositoryMock.createBrand.mockResolvedValue(mockBrand);

      await service.createBrand({ name: 'Apple' });

      expect(deviceRepositoryMock.createBrand).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'apple' }),
      );
    });

    it('throws ConflictException when the slug is taken', async () => {
      deviceRepositoryMock.findBrandBySlug.mockResolvedValue(mockBrand);

      await expect(service.createBrand({ name: 'Apple' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(deviceRepositoryMock.createBrand).not.toHaveBeenCalled();
    });
  });

  describe('getModels', () => {
    it('lists active models scoped to a brand', async () => {
      deviceRepositoryMock.findModels.mockResolvedValue({ models: [mockModel], total: 1 });
      const query: DeviceModelListQueryDto = { deviceBrandId: 'brand-1' };

      const result = await service.getModels(query);

      expect(deviceRepositoryMock.findModels).toHaveBeenCalledWith(
        expect.objectContaining({ deviceBrandId: 'brand-1', isActive: true }),
      );
      expect(result.data[0]).toMatchObject({ id: 'model-1', brandName: 'Apple' });
    });
  });

  describe('createModel', () => {
    it('validates the owning brand exists', async () => {
      deviceRepositoryMock.findBrandById.mockResolvedValue(null);

      await expect(
        service.createModel({ deviceBrandId: 'ghost', name: 'iPhone 15 Pro' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(deviceRepositoryMock.createModel).not.toHaveBeenCalled();
    });

    it('creates a model and returns it with its brand name', async () => {
      deviceRepositoryMock.findBrandById.mockResolvedValue(mockBrand);
      deviceRepositoryMock.findModelBySlug.mockResolvedValue(null);
      deviceRepositoryMock.createModel.mockResolvedValue(mockModel);
      deviceRepositoryMock.findModelById.mockResolvedValue(mockModel);

      const result = await service.createModel({
        deviceBrandId: 'brand-1',
        name: 'iPhone 15 Pro',
      });

      expect(deviceRepositoryMock.createModel).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'iphone-15-pro', deviceBrandId: 'brand-1' }),
      );
      expect(result).toMatchObject({ id: 'model-1', brandName: 'Apple' });
    });
  });

  describe('setModelActive', () => {
    it('throws NotFoundException for an unknown model', async () => {
      deviceRepositoryMock.findModelById.mockResolvedValue(null);

      await expect(service.setModelActive('ghost', false)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
