import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { PICKUP_POINT_SELECT, PickupPointRepository } from './pickup-point.repository';

const point = {
  id: '6f1c1f4e-6d8c-4c86-9d57-2a3f5f0c9a11',
  name: 'Магазин на Хрещатику',
  city: 'Київ',
  address: 'вул. Хрещатик, 1',
  phone: '+380441234567',
  workingHours: 'Пн–Пт 10:00–19:00',
  mapUrl: 'https://maps.example/khreshchatyk',
};

const prismaMock = {
  pickupPoint: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

describe('PickupPointRepository (TASK-643)', () => {
  let repository: PickupPointRepository;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PickupPointRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get(PickupPointRepository);
  });

  it('selects the public fields only — no timestamps, flags or ordering keys', () => {
    expect(PICKUP_POINT_SELECT).toEqual({
      id: true,
      name: true,
      city: true,
      address: true,
      phone: true,
      workingHours: true,
      mapUrl: true,
    });
  });

  describe('findActive', () => {
    it('lists active points by sortOrder, then name, then creation time', async () => {
      prismaMock.pickupPoint.findMany.mockResolvedValue([point]);

      await expect(repository.findActive()).resolves.toEqual([point]);
      expect(prismaMock.pickupPoint.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
        select: PICKUP_POINT_SELECT,
      });
    });
  });

  describe('findActiveById', () => {
    it('returns the point when it exists and is active', async () => {
      prismaMock.pickupPoint.findFirst.mockResolvedValue(point);

      await expect(repository.findActiveById(point.id)).resolves.toEqual(point);
      expect(prismaMock.pickupPoint.findFirst).toHaveBeenCalledWith({
        where: { id: point.id, isActive: true },
        select: PICKUP_POINT_SELECT,
      });
    });

    it('returns null for a missing or deactivated point', async () => {
      prismaMock.pickupPoint.findFirst.mockResolvedValue(null);

      await expect(repository.findActiveById(point.id)).resolves.toBeNull();
    });
  });
});
