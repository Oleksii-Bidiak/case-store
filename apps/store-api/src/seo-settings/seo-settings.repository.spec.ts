import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { SeoSettingsRepository, SINGLETON_ID } from './seo-settings.repository';

const mockRow = {
  id: SINGLETON_ID,
  defaultMetaTitle: null,
  defaultMetaDescription: 'Магазин аксесуарів',
  titleTemplate: null,
  defaultOgImage: null,
  noindexSite: false,
  llmsTxtSummary: null,
  additionalSameAsLinks: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const prismaMock = {
  seoSettings: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

describe('SeoSettingsRepository', () => {
  let repository: SeoSettingsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SeoSettingsRepository, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    repository = module.get<SeoSettingsRepository>(SeoSettingsRepository);
    jest.clearAllMocks();
  });

  describe('findSettings', () => {
    it('returns null when the row has not been seeded', async () => {
      prismaMock.seoSettings.findUnique.mockResolvedValue(null);

      const result = await repository.findSettings();

      expect(result).toBeNull();
      expect(prismaMock.seoSettings.findUnique).toHaveBeenCalledWith({
        where: { id: SINGLETON_ID },
      });
    });

    it('returns the row when it exists', async () => {
      prismaMock.seoSettings.findUnique.mockResolvedValue(mockRow);

      const result = await repository.findSettings();

      expect(result).toEqual(mockRow);
      expect(prismaMock.seoSettings.findUnique).toHaveBeenCalledWith({
        where: { id: SINGLETON_ID },
      });
    });
  });

  describe('upsertSettings', () => {
    it('upserts the singleton row with the well-known ID and provided fields', async () => {
      prismaMock.seoSettings.upsert.mockResolvedValue(mockRow);
      const dto = {
        defaultMetaDescription: 'Магазин аксесуарів',
        additionalSameAsLinks: ['https://facebook.com/store'],
      };

      const result = await repository.upsertSettings(dto);

      expect(result).toEqual(mockRow);
      expect(prismaMock.seoSettings.upsert).toHaveBeenCalledWith({
        where: { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, ...dto },
        update: { ...dto },
      });
    });
  });
});
