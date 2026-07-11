import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { SeoSettingsRepository, SINGLETON_ID } from './seo-settings.repository';

const mockRow = {
  id: SINGLETON_ID,
  defaultMetaTitle: null,
  defaultMetaDescription: 'Магазин аксесуарів',
  titleTemplate: null,
  defaultOgImage: null,
  googleSiteVerification: null,
  bingSiteVerification: null,
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
  product: { count: jest.fn() },
  category: { count: jest.fn() },
  page: { count: jest.fn() },
  $queryRaw: jest.fn(),
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

  describe('getContentSeoCounts (TASK-269 + TASK-285)', () => {
    it('runs the counts in parallel and maps them to the counts shape', async () => {
      // Distinct return values per call so a mis-wired mapping is caught.
      prismaMock.product.count
        .mockResolvedValueOnce(12) // productsMissingMetaTitle
        .mockResolvedValueOnce(40); // productsTotal
      prismaMock.category.count
        .mockResolvedValueOnce(3) // categoriesMissingMetaTitle
        .mockResolvedValueOnce(8); // categoriesTotal
      prismaMock.page.count
        .mockResolvedValueOnce(1) // pagesMissingMetaTitle
        .mockResolvedValueOnce(5) // pagesTotal
        .mockResolvedValueOnce(2); // pagesMissingMetaDescription (TASK-285)
      prismaMock.$queryRaw.mockResolvedValue([{ count: 4n }]); // pagesThinContent

      const result = await repository.getContentSeoCounts();

      expect(result).toEqual({
        productsMissingMetaTitle: 12,
        productsTotal: 40,
        categoriesMissingMetaTitle: 3,
        categoriesTotal: 8,
        pagesMissingMetaTitle: 1,
        pagesTotal: 5,
        pagesMissingMetaDescription: 2,
        pagesThinContent: 4,
      });
    });

    it('casts the raw thin-content bigint to a number and tolerates an empty result', async () => {
      prismaMock.product.count.mockResolvedValue(0);
      prismaMock.category.count.mockResolvedValue(0);
      prismaMock.page.count.mockResolvedValue(0);
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await repository.getContentSeoCounts();

      expect(result.pagesThinContent).toBe(0);
      expect(typeof result.pagesThinContent).toBe('number');
    });

    it('uses the canonical live-visibility where clauses (Design Decision 2)', async () => {
      prismaMock.product.count.mockResolvedValue(0);
      prismaMock.category.count.mockResolvedValue(0);
      prismaMock.page.count.mockResolvedValue(0);
      prismaMock.$queryRaw.mockResolvedValue([{ count: 0n }]);

      await repository.getContentSeoCounts();

      // Products: isActive + not soft-deleted; numerator adds metaTitle: null.
      expect(prismaMock.product.count).toHaveBeenNthCalledWith(1, {
        where: { metaTitle: null, isActive: true, deletedAt: null },
      });
      expect(prismaMock.product.count).toHaveBeenNthCalledWith(2, {
        where: { isActive: true, deletedAt: null },
      });
      // Categories: isActive only (no soft-delete column).
      expect(prismaMock.category.count).toHaveBeenNthCalledWith(1, {
        where: { metaTitle: null, isActive: true },
      });
      expect(prismaMock.category.count).toHaveBeenNthCalledWith(2, {
        where: { isActive: true },
      });
      // Pages: status = PUBLISHED, NEVER the isActive mirror (plan 104).
      expect(prismaMock.page.count).toHaveBeenNthCalledWith(1, {
        where: { metaTitle: null, status: 'PUBLISHED' },
      });
      expect(prismaMock.page.count).toHaveBeenNthCalledWith(2, {
        where: { status: 'PUBLISHED' },
      });
      // TASK-285: description gap mirrors the metaTitle null-only convention.
      expect(prismaMock.page.count).toHaveBeenNthCalledWith(3, {
        where: { metaDescription: null, status: 'PUBLISHED' },
      });
    });
  });
});
