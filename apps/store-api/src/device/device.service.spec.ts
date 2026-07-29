import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ReorderDuplicateIdError } from '../common/reorder';
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
  reorderBrands: jest.fn(),
};

const pinoLoggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('DeviceService', () => {
  let service: DeviceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        { provide: DeviceRepository, useValue: deviceRepositoryMock },
        { provide: PinoLogger, useValue: pinoLoggerMock },
      ],
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

  describe('getBrandsWithCount', () => {
    // TASK-357: an unpaginated read still reports a truthful count, so the panel can show
    // "N записів" without branching on whether it asked for pages.
    it('reports the whole list as one page when page/limit are omitted', async () => {
      deviceRepositoryMock.findBrandsWithCount.mockResolvedValue({
        brands: [{ brand: mockBrand, modelCount: 3 }],
        total: 1,
      });

      const result = await service.getBrandsWithCount();

      expect(deviceRepositoryMock.findBrandsWithCount).toHaveBeenCalledWith({
        page: undefined,
        limit: undefined,
        search: undefined,
      });
      expect(result.data[0]).toMatchObject({ id: 'brand-1', modelCount: 3 });
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
    });

    it('forwards pagination and search, and reports the page the caller asked for', async () => {
      deviceRepositoryMock.findBrandsWithCount.mockResolvedValue({
        brands: [{ brand: mockBrand, modelCount: 3 }],
        total: 11,
      });

      const result = await service.getBrandsWithCount({ page: 2, limit: 5, search: 'app' });

      expect(deviceRepositoryMock.findBrandsWithCount).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        search: 'app',
      });
      expect(result.meta).toEqual({ total: 11, page: 2, limit: 5, totalPages: 3 });
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

  // ─── reorderBrands (TASK-295) ─────────────────────────────────────────────

  describe('reorderBrands', () => {
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('returns the refreshed ADMIN list (with model counts) and logs the write', async () => {
      deviceRepositoryMock.reorderBrands.mockResolvedValue({
        brands: [
          { brand: { ...mockBrand, id: b, name: 'Samsung', slug: 'samsung' }, modelCount: 4 },
          { brand: { ...mockBrand, id: a }, modelCount: 7 },
        ],
        total: 2,
      });

      const result = await service.reorderBrands({ orderedIds: [b, a] }, 'admin-1');

      expect(deviceRepositoryMock.reorderBrands).toHaveBeenCalledWith([b, a]);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({ id: b, modelCount: 4 });
      // Shape parity with the admin list — the panel writes this straight into its cache.
      expect(result.meta).toEqual({ total: 2, page: 1, limit: 2, totalPages: 1 });
      expect(pinoLoggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'device-brand.reorder', actorId: 'admin-1' }),
        expect.any(String),
      );
    });

    it('maps a duplicate id onto a 400 carrying the stable code', async () => {
      deviceRepositoryMock.reorderBrands.mockRejectedValue(new ReorderDuplicateIdError());

      await expect(service.reorderBrands({ orderedIds: [a, a] }, 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
