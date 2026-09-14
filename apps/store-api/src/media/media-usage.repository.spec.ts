import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma';
import { MediaUsageRepository, MEDIA_USAGE_MAX_URLS } from './media-usage.repository';
import { MEDIA_USAGE_KINDS, MediaUsageKind } from './media-usage.types';

const URL = 'http://localhost:3001/uploads/media/asset-1.webp';
const OTHER = 'http://localhost:3001/uploads/media/asset-2.webp';

/**
 * Every empty result, so a test only has to say what it ADDS.
 *
 * A default of "nothing uses it" is the dangerous default — it is the answer
 * that lets a delete through — which is exactly why each source below is proved
 * separately rather than by one "finds usage" test that a single working source
 * would satisfy.
 */
function createPrismaMock(): Record<string, Record<string, jest.Mock>> {
  return {
    product: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    brand: { findMany: jest.fn().mockResolvedValue([]) },
    banner: { findMany: jest.fn().mockResolvedValue([]) },
    blogPost: { findMany: jest.fn().mockResolvedValue([]) },
    page: { findMany: jest.fn().mockResolvedValue([]) },
    seoSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    productImage: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('MediaUsageRepository', () => {
  let repository: MediaUsageRepository;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaUsageRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();

    repository = module.get(MediaUsageRepository);
  });

  /**
   * ONE CASE PER SOURCE COLUMN — the point of this suite.
   *
   * Fourteen columns in this database can hold an image URL. A media library
   * that checks thirteen of them deletes files out from under the fourteenth,
   * and it does so silently: the operator sees "deleted", and a broken image
   * appears on a page nobody was looking at. A single happy-path test would pass
   * with thirteen of the fourteen wired to nothing, so each gets its own row
   * here, and adding a fifteenth source without a row is the omission this table
   * is designed to make obvious.
   */
  const SOURCES: ReadonlyArray<{
    kind: MediaUsageKind;
    label: string;
    entityId: string;
    arrange: (prisma: ReturnType<typeof createPrismaMock>) => void;
  }> = [
    {
      kind: MEDIA_USAGE_KINDS.PRODUCT_IMAGE,
      label: 'iPhone 16 Pro',
      entityId: 'product-1',
      arrange: (p) =>
        p.productImage.findMany.mockResolvedValue([
          { url: URL, product: { id: 'product-1', name: 'iPhone 16 Pro' } },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.PRODUCT_OG_IMAGE,
      label: 'iPhone 16 Pro',
      entityId: 'product-1',
      arrange: (p) =>
        p.product.findMany.mockResolvedValue([
          { id: 'product-1', name: 'iPhone 16 Pro', ogImage: URL, description: null },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.PRODUCT_DESCRIPTION,
      label: 'iPhone 16 Pro',
      entityId: 'product-1',
      arrange: (p) =>
        p.product.findMany.mockResolvedValue([
          {
            id: 'product-1',
            name: 'iPhone 16 Pro',
            ogImage: null,
            description: `<p>Огляд</p><img src="${URL}" alt="">`,
          },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.CATEGORY_IMAGE,
      label: 'Чохли',
      entityId: 'category-1',
      arrange: (p) =>
        p.category.findMany.mockResolvedValue([
          { id: 'category-1', name: 'Чохли', image: URL, ogImage: null },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.CATEGORY_OG_IMAGE,
      label: 'Чохли',
      entityId: 'category-1',
      arrange: (p) =>
        p.category.findMany.mockResolvedValue([
          { id: 'category-1', name: 'Чохли', image: null, ogImage: URL },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.BRAND_LOGO,
      label: 'Spigen',
      entityId: 'brand-1',
      arrange: (p) =>
        p.brand.findMany.mockResolvedValue([{ id: 'brand-1', name: 'Spigen', logo: URL }]),
    },
    {
      kind: MEDIA_USAGE_KINDS.BANNER_IMAGE,
      label: 'Літній розпродаж',
      entityId: 'banner-1',
      arrange: (p) =>
        p.banner.findMany.mockResolvedValue([
          { id: 'banner-1', title: 'Літній розпродаж', imageUrl: URL },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.BLOG_COVER_IMAGE,
      label: 'Як обрати чохол',
      entityId: 'post-1',
      arrange: (p) =>
        p.blogPost.findMany.mockResolvedValue([
          {
            id: 'post-1',
            title: 'Як обрати чохол',
            coverImageUrl: URL,
            ogImage: null,
            content: '',
          },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.BLOG_OG_IMAGE,
      label: 'Як обрати чохол',
      entityId: 'post-1',
      arrange: (p) =>
        p.blogPost.findMany.mockResolvedValue([
          {
            id: 'post-1',
            title: 'Як обрати чохол',
            coverImageUrl: null,
            ogImage: URL,
            content: '',
          },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.BLOG_CONTENT,
      label: 'Як обрати чохол',
      entityId: 'post-1',
      arrange: (p) =>
        p.blogPost.findMany.mockResolvedValue([
          {
            id: 'post-1',
            title: 'Як обрати чохол',
            coverImageUrl: null,
            ogImage: null,
            content: `<p>Текст</p><img src="${URL}">`,
          },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.PAGE_CONTENT,
      label: 'Доставка і оплата',
      entityId: 'page-1',
      arrange: (p) =>
        p.page.findMany.mockResolvedValue([
          {
            id: 'page-1',
            title: 'Доставка і оплата',
            ogImage: null,
            content: `<img src="${URL}">`,
          },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.PAGE_OG_IMAGE,
      label: 'Доставка і оплата',
      entityId: 'page-1',
      arrange: (p) =>
        p.page.findMany.mockResolvedValue([
          { id: 'page-1', title: 'Доставка і оплата', ogImage: URL, content: '' },
        ]),
    },
    {
      kind: MEDIA_USAGE_KINDS.SEO_DEFAULT_OG_IMAGE,
      label: 'Site settings',
      entityId: 'seo-singleton',
      arrange: (p) =>
        p.seoSettings.findFirst.mockResolvedValue({
          id: 'seo-singleton',
          defaultOgImage: URL,
          logoUrl: null,
        }),
    },
    {
      kind: MEDIA_USAGE_KINDS.SEO_STORE_LOGO,
      label: 'Site settings',
      entityId: 'seo-singleton',
      arrange: (p) =>
        p.seoSettings.findFirst.mockResolvedValue({
          id: 'seo-singleton',
          defaultOgImage: null,
          logoUrl: URL,
        }),
    },
  ];

  it('covers every kind declared in the catalogue (a new source without a case fails here)', () => {
    expect(new Set(SOURCES.map((source) => source.kind))).toEqual(
      new Set(Object.values(MEDIA_USAGE_KINDS)),
    );
  });

  describe.each(SOURCES)('$kind', ({ kind, label, entityId, arrange }) => {
    it('is reported as a usage of the asset', async () => {
      arrange(prisma);

      const usage = await repository.findUsageForUrl(URL);

      expect(usage).toEqual([{ kind, entityId, label }]);
    });

    it('is NOT reported for a different asset', async () => {
      // The mirror of the case above, and the one that catches an over-broad
      // match: a source that reports every url it is asked about would pass the
      // test above and make the library undeletable.
      arrange(prisma);

      await expect(repository.findUsageForUrl(OTHER)).resolves.toEqual([]);
    });
  });

  it('reports an unused asset as unused', async () => {
    await expect(repository.findUsageForUrl(URL)).resolves.toEqual([]);
  });

  it('reports every distinct place one asset is used', async () => {
    prisma.productImage.findMany.mockResolvedValue([
      { url: URL, product: { id: 'product-1', name: 'iPhone 16 Pro' } },
    ]);
    prisma.brand.findMany.mockResolvedValue([{ id: 'brand-1', name: 'Spigen', logo: URL }]);

    const usage = await repository.findUsageForUrl(URL);

    expect(usage.map((one) => one.kind)).toEqual([
      MEDIA_USAGE_KINDS.PRODUCT_IMAGE,
      MEDIA_USAGE_KINDS.BRAND_LOGO,
    ]);
  });

  it('lists the same article three times when it uses the asset three ways', async () => {
    // One entry per COLUMN, not per row: told only "used by this article", an
    // operator has no way to know which of the three references to change.
    prisma.blogPost.findMany.mockResolvedValue([
      {
        id: 'post-1',
        title: 'Як обрати чохол',
        coverImageUrl: URL,
        ogImage: URL,
        content: `<img src="${URL}">`,
      },
    ]);

    const usage = await repository.findUsageForUrl(URL);

    expect(usage.map((one) => one.kind)).toEqual([
      MEDIA_USAGE_KINDS.BLOG_COVER_IMAGE,
      MEDIA_USAGE_KINDS.BLOG_OG_IMAGE,
      MEDIA_USAGE_KINDS.BLOG_CONTENT,
    ]);
  });

  it('does not report a rich-text row the SQL matched but the exact text does not', async () => {
    // `contains` is `LIKE '%…%'`, and an unescaped `_` in a url is a wildcard, so
    // Postgres can hand back a row that does not really contain the string. The
    // JS re-check is what keeps that out of the answer — without it the operator
    // is sent to an article that has nothing to fix.
    prisma.page.findMany.mockResolvedValue([
      { id: 'page-1', title: 'Доставка', ogImage: null, content: '<p>no image here</p>' },
    ]);

    await expect(repository.findUsageForUrl(URL)).resolves.toEqual([]);
  });

  describe('batch reads', () => {
    it('answers for many urls in ONE pass over each source table', async () => {
      prisma.brand.findMany.mockResolvedValue([
        { id: 'brand-1', name: 'Spigen', logo: URL },
        { id: 'brand-2', name: 'Baseus', logo: OTHER },
      ]);

      const map = await repository.findUsage([URL, OTHER]);

      expect(map.get(URL)?.[0].label).toBe('Spigen');
      expect(map.get(OTHER)?.[0].label).toBe('Baseus');
      // The grid asks about a whole page at once; one query per source is the
      // reason a 24-thumbnail page costs the same as a single card.
      expect(prisma.brand.findMany).toHaveBeenCalledTimes(1);
    });

    it('returns an empty entry for a url nothing uses, never a missing key', async () => {
      const map = await repository.findUsage([URL, OTHER]);

      expect(map.get(URL)).toEqual([]);
      expect(map.get(OTHER)).toEqual([]);
    });

    it('makes no query at all for an empty batch', async () => {
      await expect(repository.findUsage([])).resolves.toEqual(new Map());
      expect(prisma.brand.findMany).not.toHaveBeenCalled();
    });

    it('refuses a batch over the cap rather than silently truncating it', async () => {
      // Truncating would report "not used" for the urls that fell off the end,
      // and that is the answer that deletes a file a live page is rendering.
      const urls = Array.from({ length: MEDIA_USAGE_MAX_URLS + 1 }, (_, i) => `${URL}?${i}`);

      await expect(repository.findUsage(urls)).rejects.toThrow(/over the .* cap/);
      expect(prisma.brand.findMany).not.toHaveBeenCalled();
    });
  });
});
