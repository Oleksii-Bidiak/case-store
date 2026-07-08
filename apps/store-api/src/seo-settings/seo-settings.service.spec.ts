import { Test, TestingModule } from '@nestjs/testing';
import { SeoSettingsRepository, SINGLETON_ID } from './seo-settings.repository';
import { SeoSettingsService } from './seo-settings.service';
import { SeoSettingsEntity, SeoHealthEntity } from './entities';
import { RevalidationNotifier } from '../publishing';

const mockRow = {
  id: SINGLETON_ID,
  defaultMetaTitle: null,
  defaultMetaDescription: 'Магазин аксесуарів',
  titleTemplate: null,
  defaultOgImage: null,
  noindexSite: false,
  llmsTxtSummary: null,
  additionalSameAsLinks: [] as string[],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const repositoryMock = {
  findSettings: jest.fn(),
  upsertSettings: jest.fn(),
  getContentSeoCounts: jest.fn(),
};

const revalidationMock = {
  revalidate: jest.fn(),
};

describe('SeoSettingsService', () => {
  let service: SeoSettingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeoSettingsService,
        { provide: SeoSettingsRepository, useValue: repositoryMock },
        { provide: RevalidationNotifier, useValue: revalidationMock },
      ],
    }).compile();

    service = module.get<SeoSettingsService>(SeoSettingsService);
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('returns an empty entity (zero-config defaults) when the row is unseeded', async () => {
      repositoryMock.findSettings.mockResolvedValue(null);

      const result = await service.getSettings();

      expect(result).toBeInstanceOf(SeoSettingsEntity);
      expect(result.defaultMetaTitle).toBeNull();
      expect(result.defaultMetaDescription).toBeNull();
      expect(result.titleTemplate).toBeNull();
      expect(result.noindexSite).toBe(false);
      expect(result.additionalSameAsLinks).toEqual([]);
    });

    it('returns a mapped entity when the row exists', async () => {
      repositoryMock.findSettings.mockResolvedValue(mockRow);

      const result = await service.getSettings();

      expect(result).toBeInstanceOf(SeoSettingsEntity);
      expect(result.defaultMetaDescription).toBe('Магазин аксесуарів');
      expect(result.noindexSite).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('upserts via the repository, maps the result, and revalidates the seo-settings tag', async () => {
      const dto = { defaultMetaTitle: 'Новий заголовок', noindexSite: true };
      repositoryMock.upsertSettings.mockResolvedValue({ ...mockRow, ...dto });
      revalidationMock.revalidate.mockResolvedValue(undefined);

      const result = await service.updateSettings(dto);

      expect(repositoryMock.upsertSettings).toHaveBeenCalledWith(dto);
      expect(revalidationMock.revalidate).toHaveBeenCalledWith({ tags: ['seo-settings'] });
      expect(result).toBeInstanceOf(SeoSettingsEntity);
      expect(result.defaultMetaTitle).toBe('Новий заголовок');
      expect(result.noindexSite).toBe(true);
    });
  });

  describe('getHealth (TASK-269)', () => {
    it('maps the repository counts through SeoHealthEntity.fromCounts', async () => {
      const counts = {
        productsMissingMetaTitle: 12,
        productsTotal: 40,
        categoriesMissingMetaTitle: 3,
        categoriesTotal: 8,
        pagesMissingMetaTitle: 1,
        pagesTotal: 5,
      };
      repositoryMock.getContentSeoCounts.mockResolvedValue(counts);

      const result = await service.getHealth();

      expect(repositoryMock.getContentSeoCounts).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(SeoHealthEntity);
      expect(result).toEqual(counts);
    });
  });
});
