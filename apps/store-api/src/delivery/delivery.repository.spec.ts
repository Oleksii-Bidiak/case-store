import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { DeliveryRepository, SINGLETON_ID } from './delivery.repository';

const mockRow = {
  id: SINGLETON_ID,
  senderCityRef: 'db5c88e0-391c-11dd-90d9-001a92567626',
  senderCityName: 'м. Київ, Київська обл.',
  senderWarehouseRef: null,
  defaultWeightKg: 0.5,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const prismaMock = {
  deliverySetting: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

describe('DeliveryRepository', () => {
  let repository: DeliveryRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeliveryRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<DeliveryRepository>(DeliveryRepository);
    jest.clearAllMocks();
  });

  it('uses a singleton id distinct from the site-contact and SEO singletons', () => {
    expect(SINGLETON_ID).toBe('00000000-0000-0000-0000-000000000003');
  });

  describe('findSettings', () => {
    it('returns null when the row has never been written', async () => {
      prismaMock.deliverySetting.findUnique.mockResolvedValue(null);

      await expect(repository.findSettings()).resolves.toBeNull();
      expect(prismaMock.deliverySetting.findUnique).toHaveBeenCalledWith({
        where: { id: SINGLETON_ID },
      });
    });

    it('returns the row when it exists', async () => {
      prismaMock.deliverySetting.findUnique.mockResolvedValue(mockRow);

      await expect(repository.findSettings()).resolves.toEqual(mockRow);
    });
  });

  describe('upsertSettings', () => {
    it('creates with the well-known id and updates without touching it', async () => {
      prismaMock.deliverySetting.upsert.mockResolvedValue(mockRow);
      const input = { senderCityRef: 'lviv-ref', senderCityName: 'м. Львів' };

      await repository.upsertSettings(input);

      expect(prismaMock.deliverySetting.upsert).toHaveBeenCalledWith({
        where: { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, ...input },
        update: { ...input },
      });
    });

    it('writes only the provided fields', async () => {
      prismaMock.deliverySetting.upsert.mockResolvedValue(mockRow);

      await repository.upsertSettings({ defaultWeightKg: 1.5 });

      expect(prismaMock.deliverySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { defaultWeightKg: 1.5 } }),
      );
    });
  });
});
