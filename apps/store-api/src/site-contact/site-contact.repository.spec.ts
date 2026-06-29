import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { SiteContactRepository, SINGLETON_ID } from './site-contact.repository';

const mockRow = {
  id: SINGLETON_ID,
  email: 'support@mobilestore.ua',
  phone: '+380 44 000 0000',
  workingHours: 'Пн–Нд: 9:00 – 20:00',
  viberLink: null,
  telegramLink: null,
  instagramLink: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const prismaMock = {
  siteContactSettings: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

describe('SiteContactRepository', () => {
  let repository: SiteContactRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SiteContactRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<SiteContactRepository>(SiteContactRepository);
    jest.clearAllMocks();
  });

  describe('findSettings', () => {
    it('returns null when the row has not been seeded', async () => {
      prismaMock.siteContactSettings.findUnique.mockResolvedValue(null);

      const result = await repository.findSettings();

      expect(result).toBeNull();
      expect(prismaMock.siteContactSettings.findUnique).toHaveBeenCalledWith({
        where: { id: SINGLETON_ID },
      });
    });

    it('returns the row when it exists', async () => {
      prismaMock.siteContactSettings.findUnique.mockResolvedValue(mockRow);

      const result = await repository.findSettings();

      expect(result).toEqual(mockRow);
      expect(prismaMock.siteContactSettings.findUnique).toHaveBeenCalledWith({
        where: { id: SINGLETON_ID },
      });
    });
  });

  describe('upsertSettings', () => {
    it('upserts the singleton row with the well-known ID and provided fields', async () => {
      prismaMock.siteContactSettings.upsert.mockResolvedValue(mockRow);
      const dto = { email: 'support@mobilestore.ua', phone: '+380 44 000 0000' };

      const result = await repository.upsertSettings(dto);

      expect(result).toEqual(mockRow);
      expect(prismaMock.siteContactSettings.upsert).toHaveBeenCalledWith({
        where: { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, ...dto },
        update: { ...dto },
      });
    });
  });
});
