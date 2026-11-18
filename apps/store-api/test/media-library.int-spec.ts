import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { MediaRepository } from '../src/media/media.repository';
import { MediaUsageRepository } from '../src/media/media-usage.repository';
import { MEDIA_USAGE_KINDS, MediaUsageKind } from '../src/media/media-usage.types';
import { PrismaService } from '../src/prisma';
import { SEO_SETTINGS_SINGLETON_ID } from '../src/seo-settings';

/**
 * The media library's views and counters against a REAL Postgres (TASK-1730).
 *
 * THE PARITY IS THE POINT. «Не використовуються» is answered by a SQL predicate
 * (`MediaUsageRepository.unreferencedPredicate`) while the delete gate and the
 * card's usage list are answered by `findUsage` — two implementations of one
 * question. If they ever disagree, the view lists an image as free and the
 * delete then refuses it, or worse, the view hides an image nothing uses. So
 * every source column gets its own row below, proving BOTH halves on the same
 * row: `findUsage` reports it, and the unused view (and its counter) leaves it
 * out. A fifteenth source added to one side and not the other fails here.
 *
 * Every asset carries a per-run tag and every list call filters by it, which is
 * what makes the counters exact on a shared test database: the counters are
 * computed under the tag, exactly as an operator's tag filter would scope them.
 */
describe('Media library views (integration, TASK-1730)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let media: MediaRepository;
  let usage: MediaUsageRepository;

  const s = randomUUID().slice(0, 8);
  const TAG = `int-1730-${s}`;
  const urlFor = (name: string) => `http://int.test/uploads/media/${s}-${name}.webp`;

  const assetIds: string[] = [];
  const productIds: string[] = [];
  const categoryIds: string[] = [];
  let brandId: string;
  let bannerId: string;
  let blogCategoryId: string;
  let blogPostIds: string[] = [];
  let pageIds: string[] = [];
  let seoBefore: { defaultOgImage: string | null; logoUrl: string | null } | null = null;

  /** One referenced asset per source column, keyed by the kind findUsage reports. */
  const SOURCE_KINDS: MediaUsageKind[] = Object.values(MEDIA_USAGE_KINDS);
  const sourceUrl = (kind: MediaUsageKind) => urlFor(kind.toLowerCase());

  /** Assets nothing references — the ones the unused view must list. */
  const FREE = urlFor('free');
  /** Referenced only by a DELETED category, which does not count (TASK-653). */
  const DELETED_CATEGORY_ONLY = urlFor('deleted-category');
  /**
   * `_` is a single-character LIKE wildcard. Its "near miss" (`aXb`) is in a page
   * body; neither side may treat that as a reference to `a_b`.
   */
  const UNDERSCORE = urlFor('a_b');
  const UNDERSCORE_NEAR_MISS = urlFor('aXb');

  const makeAsset = (
    url: string,
    overrides: { alt?: string | null; bytes?: number; createdAt?: Date } = {},
  ) =>
    prisma.mediaAsset
      .create({
        data: {
          url,
          mime: 'image/webp',
          alt: overrides.alt === undefined ? 'opis' : overrides.alt,
          bytes: overrides.bytes ?? 100,
          tags: [TAG],
          createdAt: overrides.createdAt,
        },
      })
      .then((row) => {
        assetIds.push(row.id);
        return row;
      });

  const list = (
    params: Partial<Parameters<MediaRepository['findAll']>[0]> = {},
  ): ReturnType<MediaRepository['findAll']> =>
    media.findAll({ tag: TAG, view: 'all', sort: 'newest', page: 1, limit: 100, ...params });

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL ?? '';
    if (!/test/i.test(dbUrl)) {
      throw new Error(`Refusing to run integration tests against a non-test database: "${dbUrl}"`);
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [PrismaService, MediaUsageRepository, MediaRepository],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    media = moduleRef.get(MediaRepository);
    usage = moduleRef.get(MediaUsageRepository);

    for (const kind of SOURCE_KINDS) {
      await makeAsset(sourceUrl(kind));
    }
    await makeAsset(FREE);
    await makeAsset(DELETED_CATEGORY_ONLY);
    await makeAsset(UNDERSCORE);

    const category = await prisma.category.create({
      data: {
        name: `int media ${s}`,
        slug: `int-media-${s}`,
        image: sourceUrl(MEDIA_USAGE_KINDS.CATEGORY_IMAGE),
        ogImage: sourceUrl(MEDIA_USAGE_KINDS.CATEGORY_OG_IMAGE),
      },
    });
    categoryIds.push(category.id);
    const deletedCategory = await prisma.category.create({
      data: {
        name: `int media deleted ${s}`,
        slug: `int-media-deleted-${s}`,
        image: DELETED_CATEGORY_ONLY,
        deletedAt: new Date(),
      },
    });
    categoryIds.push(deletedCategory.id);

    const product = await prisma.product.create({
      data: {
        name: `int media product ${s}`,
        slug: `int-media-product-${s}`,
        price: 100,
        categoryId: category.id,
        ogImage: sourceUrl(MEDIA_USAGE_KINDS.PRODUCT_OG_IMAGE),
        description: `<p>Look: <img src="${sourceUrl(MEDIA_USAGE_KINDS.PRODUCT_DESCRIPTION)}"></p>`,
        images: { create: [{ url: sourceUrl(MEDIA_USAGE_KINDS.PRODUCT_IMAGE) }] },
      },
    });
    productIds.push(product.id);

    brandId = (
      await prisma.brand.create({
        data: {
          name: `int media brand ${s}`,
          slug: `int-media-brand-${s}`,
          logo: sourceUrl(MEDIA_USAGE_KINDS.BRAND_LOGO),
        },
      })
    ).id;

    bannerId = (
      await prisma.banner.create({
        data: {
          placement: 'PROMO_TILE',
          title: `int media banner ${s}`,
          imageUrl: sourceUrl(MEDIA_USAGE_KINDS.BANNER_IMAGE),
        },
      })
    ).id;

    blogCategoryId = (
      await prisma.blogCategory.create({
        data: { name: `int media blog ${s}`, slug: `int-media-blog-${s}` },
      })
    ).id;
    blogPostIds = [
      (
        await prisma.blogPost.create({
          data: {
            slug: `int-media-post-${s}`,
            title: `int media post ${s}`,
            excerpt: 'x',
            authorName: 'x',
            categoryId: blogCategoryId,
            coverImageUrl: sourceUrl(MEDIA_USAGE_KINDS.BLOG_COVER_IMAGE),
            ogImage: sourceUrl(MEDIA_USAGE_KINDS.BLOG_OG_IMAGE),
            content: `<img src="${sourceUrl(MEDIA_USAGE_KINDS.BLOG_CONTENT)}">`,
          },
        })
      ).id,
    ];

    pageIds = [
      (
        await prisma.page.create({
          data: {
            slug: `int-media-page-${s}`,
            title: `int media page ${s}`,
            ogImage: sourceUrl(MEDIA_USAGE_KINDS.PAGE_OG_IMAGE),
            content:
              `<img src="${sourceUrl(MEDIA_USAGE_KINDS.PAGE_CONTENT)}">` +
              `<img src="${UNDERSCORE_NEAR_MISS}">`,
          },
        })
      ).id,
    ];

    const seo = await prisma.seoSettings.findUnique({ where: { id: SEO_SETTINGS_SINGLETON_ID } });
    seoBefore = seo ? { defaultOgImage: seo.defaultOgImage, logoUrl: seo.logoUrl } : null;
    await prisma.seoSettings.upsert({
      where: { id: SEO_SETTINGS_SINGLETON_ID },
      create: {
        id: SEO_SETTINGS_SINGLETON_ID,
        defaultOgImage: sourceUrl(MEDIA_USAGE_KINDS.SEO_DEFAULT_OG_IMAGE),
        logoUrl: sourceUrl(MEDIA_USAGE_KINDS.SEO_STORE_LOGO),
      },
      update: {
        defaultOgImage: sourceUrl(MEDIA_USAGE_KINDS.SEO_DEFAULT_OG_IMAGE),
        logoUrl: sourceUrl(MEDIA_USAGE_KINDS.SEO_STORE_LOGO),
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (seoBefore) {
        await prisma.seoSettings.update({
          where: { id: SEO_SETTINGS_SINGLETON_ID },
          data: seoBefore,
        });
      } else {
        await prisma.seoSettings.deleteMany({ where: { id: SEO_SETTINGS_SINGLETON_ID } });
      }
      await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
      await prisma.blogPost.deleteMany({ where: { id: { in: blogPostIds } } });
      if (blogCategoryId) await prisma.blogCategory.delete({ where: { id: blogCategoryId } });
      if (bannerId) await prisma.banner.delete({ where: { id: bannerId } });
      if (brandId) await prisma.brand.delete({ where: { id: brandId } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
      await prisma.mediaAsset.deleteMany({ where: { id: { in: assetIds } } });
    }
    await app?.close();
  });

  describe('parity between findUsage and the unused view — one row per source', () => {
    it.each(SOURCE_KINDS)('%s: reported by findUsage AND left out of view=unused', async (kind) => {
      const url = sourceUrl(kind);

      const reported = await usage.findUsageForUrl(url);
      expect(reported.map((one) => one.kind)).toContain(kind);

      const unused = await list({ view: 'unused' });
      expect(unused.assets.map((asset) => asset.url)).not.toContain(url);
    });
  });

  it('lists exactly the unreferenced assets under view=unused, and counts them', async () => {
    const unused = await list({ view: 'unused' });

    expect(unused.assets.map((asset) => asset.url).sort()).toEqual(
      [FREE, DELETED_CATEGORY_ONLY, UNDERSCORE].sort(),
    );
    expect(unused.total).toBe(3);
    expect(unused.counts.unused).toBe(3);
  });

  it('agrees with findUsage on every asset of the run — free iff no usage', async () => {
    const all = await list();
    const usageByUrl = await usage.findUsage(all.assets.map((asset) => asset.url));
    const unused = new Set((await list({ view: 'unused' })).assets.map((asset) => asset.url));

    for (const asset of all.assets) {
      expect({ url: asset.url, unused: unused.has(asset.url) }).toEqual({
        url: asset.url,
        unused: (usageByUrl.get(asset.url) ?? []).length === 0,
      });
    }
  });

  it('does not count an image used only by a deleted category', async () => {
    expect(await usage.findUsageForUrl(DELETED_CATEGORY_ONLY)).toEqual([]);
    const unused = await list({ view: 'unused' });
    expect(unused.assets.map((asset) => asset.url)).toContain(DELETED_CATEGORY_ONLY);
  });

  it('does not treat `_` in a URL as a wildcard on either side', async () => {
    expect(await usage.findUsageForUrl(UNDERSCORE)).toEqual([]);
    const unused = await list({ view: 'unused' });
    expect(unused.assets.map((asset) => asset.url)).toContain(UNDERSCORE);
  });

  it('counts every view under the current filters, independent of the view asked for', async () => {
    const expected = { all: SOURCE_KINDS.length + 3, unused: 3, noAlt: 0 };

    expect((await list()).counts).toEqual(expected);
    expect((await list({ view: 'unused' })).counts).toEqual(expected);
    expect((await list({ view: 'noAlt' })).counts).toEqual(expected);
    expect((await list()).total).toBe(expected.all);
  });

  describe('noAlt, sort and search (own fixture)', () => {
    const TAG2 = `int-1730-b-${s}`;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      const make = async (
        key: string,
        alt: string | null,
        bytes: number,
        createdAt: string,
        tags: string[] = [TAG2],
      ) => {
        const row = await prisma.mediaAsset.create({
          data: {
            url: urlFor(`b-${key}`),
            mime: 'image/webp',
            alt,
            bytes,
            tags,
            createdAt: new Date(createdAt),
          },
        });
        assetIds.push(row.id);
        ids[key] = row.id;
      };
      await make('old', 'Осінній банер', 500, '2026-01-01T00:00:00Z');
      await make('mid', null, 900, '2026-02-01T00:00:00Z');
      await make('new', 'iPhone 100% чохол', 100, '2026-03-01T00:00:00Z');
      // Same size and same timestamp as `mid`: the id tie-breaker decides.
      await make('twin', "Obi_wan's", 900, '2026-02-01T00:00:00Z');
    });

    const list2 = (params: Partial<Parameters<MediaRepository['findAll']>[0]> = {}) =>
      media.findAll({ tag: TAG2, view: 'all', sort: 'newest', page: 1, limit: 100, ...params });

    const midTwin = () => [ids.mid, ids.twin].sort();

    it('view=noAlt lists only assets without alt text', async () => {
      const result = await list2({ view: 'noAlt' });

      expect(result.assets.map((asset) => asset.id)).toEqual([ids.mid]);
      expect(result.counts).toEqual({ all: 4, unused: 4, noAlt: 1 });
    });

    it('sort=newest is created_at desc, then id asc', async () => {
      const result = await list2({ sort: 'newest' });

      expect(result.assets.map((asset) => asset.id)).toEqual([ids.new, ...midTwin(), ids.old]);
    });

    it('sort=oldest is created_at asc, then id asc', async () => {
      const result = await list2({ sort: 'oldest' });

      expect(result.assets.map((asset) => asset.id)).toEqual([ids.old, ...midTwin(), ids.new]);
    });

    it('sort=largest is bytes desc, then id asc', async () => {
      const result = await list2({ sort: 'largest' });

      expect(result.assets.map((asset) => asset.id)).toEqual([...midTwin(), ids.old, ids.new]);
    });

    it('pages through the same order', async () => {
      const first = await list2({ sort: 'largest', limit: 2, page: 1 });
      const second = await list2({ sort: 'largest', limit: 2, page: 2 });

      expect([...first.assets, ...second.assets].map((asset) => asset.id)).toEqual([
        ...midTwin(),
        ids.old,
        ids.new,
      ]);
      expect(first.total).toBe(4);
    });

    it('search matches alt case-insensitively as a substring', async () => {
      const result = await list2({ search: 'БАНЕР' });

      expect(result.assets.map((asset) => asset.id)).toEqual([ids.old]);
      expect(result.counts).toEqual({ all: 1, unused: 1, noAlt: 0 });
    });

    it('search matches an exact tag too', async () => {
      const result = await list2({ search: TAG2 });

      expect(result.total).toBe(4);
    });

    it.each([
      // `%` and `_` occur literally in exactly one alt each — as patterns they
      // would match all four rows.
      ['%', ['new']],
      ['_', ['twin']],
      ['100%', ['new']],
      // Matches «Obi_wan's» only if `_` is a wildcard.
      ['ob__wan', [] as string[]],
      ['bi_wan', ['twin']],
      ["n's", ['twin']],
      ["' OR 1=1 --", [] as string[]],
    ])('search %p is a literal needle, not a pattern', async (needle, expected) => {
      const result = await list2({ search: needle });

      expect(result.assets.map((asset) => asset.id)).toEqual(expected.map((key) => ids[key]));
    });
  });

  describe('search by the original file name (TASK-1731)', () => {
    const TAG3 = `int-1731-${s}`;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      const make = async (key: string, originalFilename: string | null) => {
        const row = await prisma.mediaAsset.create({
          data: {
            url: urlFor(`c-${key}`),
            mime: 'image/webp',
            alt: null,
            tags: [TAG3],
            originalFilename,
            originalMime: originalFilename ? 'image/jpeg' : null,
          },
        });
        assetIds.push(row.id);
        ids[key] = row.id;
      };
      await make('autumn', 'Банер осінь.JPG');
      await make('pct', '50%_off.png');
      await make('quote', "O'Brien.png");
      await make('unknown', null);
    });

    const list3 = (search: string) =>
      media.findAll({ tag: TAG3, search, view: 'all', sort: 'oldest', page: 1, limit: 100 });

    it.each([
      ['осінь', ['autumn']],
      ['БАНЕР ОСІНЬ.jpg', ['autumn']],
      ['%', ['pct']],
      ['_', ['pct']],
      ['50%_', ['pct']],
      // Would match «50%_off» and more if % and _ were wildcards.
      ['5%f', [] as string[]],
      ["o'b", ['quote']],
      ["' OR original_filename IS NULL --", [] as string[]],
    ])('search %p matches the original file name literally', async (needle, expected) => {
      const result = await list3(needle);

      expect(result.assets.map((asset) => asset.id)).toEqual(expected.map((key) => ids[key]));
    });
  });
});
