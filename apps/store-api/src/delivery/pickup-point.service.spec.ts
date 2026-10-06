import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ReorderStaleError } from '../common/reorder';
import { PickupPointRepository, type AdminPickupPoint } from './pickup-point.repository';
import { PickupPointService } from './pickup-point.service';

const point: AdminPickupPoint = {
  id: '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11',
  name: 'Магазин на Хрещатику',
  city: 'Київ',
  address: 'вул. Хрещатик, 1',
  phone: null,
  workingHours: null,
  mapUrl: null,
  isActive: true,
  sortOrder: 0,
  ordersCount: 2,
};

const repositoryMock = {
  listAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  reorderAll: jest.fn(),
};

describe('PickupPointService (TASK-645)', () => {
  let service: PickupPointService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PickupPointService, { provide: PickupPointRepository, useValue: repositoryMock }],
    }).compile();

    service = module.get(PickupPointService);
  });

  it('lists every point the repository holds', async () => {
    repositoryMock.listAll.mockResolvedValue([point]);

    await expect(service.listAdmin()).resolves.toEqual([point]);
  });

  it('creates through the repository (which appends it)', async () => {
    repositoryMock.create.mockResolvedValue(point);
    const dto = { name: point.name, city: point.city, address: point.address };

    await expect(service.create(dto)).resolves.toEqual(point);
    expect(repositoryMock.create).toHaveBeenCalledWith(dto);
  });

  describe('update', () => {
    it('writes the change to an existing point', async () => {
      repositoryMock.findById.mockResolvedValue(point);
      repositoryMock.update.mockResolvedValue({ ...point, isActive: false });

      await expect(service.update(point.id, { isActive: false })).resolves.toMatchObject({
        isActive: false,
      });
      expect(repositoryMock.update).toHaveBeenCalledWith(point.id, { isActive: false });
    });

    it('answers 404 for an unknown id and writes nothing', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.update('missing', { name: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repositoryMock.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('hard-deletes an existing point and returns its id', async () => {
      repositoryMock.findById.mockResolvedValue(point);

      await expect(service.remove(point.id)).resolves.toEqual({ id: point.id });
      expect(repositoryMock.delete).toHaveBeenCalledWith(point.id);
    });

    it('answers 404 for an unknown id', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(repositoryMock.delete).not.toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    it('returns the refreshed list', async () => {
      repositoryMock.reorderAll.mockResolvedValue([point]);

      await expect(service.reorder({ orderedIds: [point.id] })).resolves.toEqual([point]);
      expect(repositoryMock.reorderAll).toHaveBeenCalledWith([point.id]);
    });

    it('maps the domain reorder errors onto HTTP (stale → 409)', async () => {
      repositoryMock.reorderAll.mockRejectedValue(new ReorderStaleError('changed'));

      await expect(service.reorder({ orderedIds: [] })).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
