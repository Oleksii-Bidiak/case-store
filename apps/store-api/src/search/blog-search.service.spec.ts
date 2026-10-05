import { PublishStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BlogRepository } from '../blog/blog.repository';
import {
  MeiliClient,
  BLOG_POSTS_INDEX,
  SEARCH_MAX_TOTAL_HITS,
  type BlogPostSearchDocument,
} from './meili.client';
import { BlogSearchService, BLOG_POSTS_INDEX_SETTINGS } from './blog-search.service';
import { PRODUCTS_INDEX_SETTINGS } from './search.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const loggerMock = {
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    slug: 'best-powerbanks',
    title: 'Найкращі павербанки 2026',
    excerpt: 'Що брати в дорогу.',
    content: '<p>Body</p>',
    coverImageUrl: null,
    coverBlurDataUrl: null,
    authorName: 'Олег Пилипенко',
    readingMinutes: 6,
    featured: false,
    categoryId: 'cat-1',
    status: PublishStatus.PUBLISHED,
    publishedAt: new Date('2026-06-28T00:00:00.000Z'),
    scheduledAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-28T00:00:00.000Z'),
    keywords: [],
    listed: true,
    category: { id: 'cat-1', slug: 'guides', name: 'Гайди' },
    ...overrides,
  };
}

describe('BlogSearchService', () => {
  let service: BlogSearchService;
  let meili: jest.Mocked<
    Pick<
      MeiliClient,
      | 'isConfigured'
      | 'ensureIndex'
      | 'indexDocuments'
      | 'deleteDocument'
      | 'deleteDocuments'
      | 'listDocumentIds'
      | 'waitForTasks'
      | 'search'
    >
  >;
  let repo: jest.Mocked<Pick<BlogRepository, 'findById' | 'findAllAdmin'>>;
  /** The first post document handed to `indexDocuments`. */
  const firstIndexedPost = () => meili.indexDocuments.mock.calls[0][0][0] as BlogPostSearchDocument;

  beforeEach(() => {
    jest.clearAllMocks();
    meili = {
      isConfigured: jest.fn().mockReturnValue(true),
      ensureIndex: jest.fn().mockResolvedValue(undefined),
      indexDocuments: jest.fn().mockResolvedValue(10),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
      deleteDocuments: jest.fn().mockResolvedValue(11),
      listDocumentIds: jest.fn().mockResolvedValue(new Set<string>()),
      waitForTasks: jest.fn().mockResolvedValue({ failedUids: [] }),
      search: jest.fn(),
    };
    repo = { findById: jest.fn(), findAllAdmin: jest.fn() };
    service = new BlogSearchService(
      meili as unknown as MeiliClient,
      repo as unknown as BlogRepository,
      loggerMock,
    );
  });

  // ─── settings ──────────────────────────────────────────────────────────────

  describe('index settings', () => {
    it('targets the blog index, not the product one', async () => {
      await service.ensureIndex();
      expect(meili.ensureIndex).toHaveBeenCalledWith(BLOG_POSTS_INDEX_SETTINGS, BLOG_POSTS_INDEX);
      expect(BLOG_POSTS_INDEX).toBe('blog_posts');
    });

    it('searches title, keywords, excerpt, category and the cross-script terms', () => {
      // `keywords` (TASK-558) rank right after the title, mirroring the product
      // index: an admin tag outranks a passing mention in the excerpt.
      expect(BLOG_POSTS_INDEX_SETTINGS.searchableAttributes).toEqual([
        'title',
        'keywords',
        'excerpt',
        'categoryName',
        'searchTerms',
      ]);
      expect(BLOG_POSTS_INDEX_SETTINGS.filterableAttributes).toContain('categorySlug');
      // `listed` (TASK-537): the engine has to drop unlisted posts itself, or its
      // exact total counts posts the hub's re-read then removes.
      expect(BLOG_POSTS_INDEX_SETTINGS.filterableAttributes).toContain('listed');
    });

    it('shares the products index word typo tolerance and synonyms verbatim', () => {
      // The header dropdown searches both in one keystroke — a query that is
      // typo-corrected for products must be typo-corrected for articles too.
      // Only the per-attribute opt-out differs: products exempt `sku` (TASK-522),
      // an attribute articles do not have.
      const { disableOnAttributes, ...productWordTypos } = PRODUCTS_INDEX_SETTINGS.typoTolerance!;
      expect(disableOnAttributes).toEqual(['sku']);
      expect(BLOG_POSTS_INDEX_SETTINGS.typoTolerance).toEqual(productWordTypos);
      expect(BLOG_POSTS_INDEX_SETTINGS.synonyms).toBe(PRODUCTS_INDEX_SETTINGS.synonyms);
    });
  });

  // ─── indexPost / removePost ────────────────────────────────────────────────

  describe('indexPost', () => {
    it('upserts a document carrying the card fields and cross-script terms', async () => {
      repo.findById.mockResolvedValue(makePost() as never);

      await service.indexPost('post-1');

      expect(meili.indexDocuments).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: 'post-1',
            title: 'Найкращі павербанки 2026',
            slug: 'best-powerbanks',
            categorySlug: 'guides',
            categoryName: 'Гайди',
            publishedAt: new Date('2026-06-28T00:00:00.000Z').getTime(),
            listed: true,
          }),
        ],
        BLOG_POSTS_INDEX,
      );
      const doc = firstIndexedPost();
      expect(Array.isArray(doc.searchTerms)).toBe(true);
      // The sanitized HTML body is deliberately NOT indexed — it would put tag
      // names and attribute values into the searchable text.
      expect(doc).not.toHaveProperty('content');
    });

    it('indexes an unlisted post with listed=false, so the engine can filter it (TASK-537)', async () => {
      // Unlisted is still PUBLISHED and searchable by the sitemap; it stays in
      // the index, flagged, rather than being deleted from it.
      repo.findById.mockResolvedValue(makePost({ listed: false }) as never);

      await service.indexPost('post-1');

      const doc = firstIndexedPost();
      expect(doc.listed).toBe(false);
    });

    it('carries the admin keywords and their cross-script terms (TASK-558)', async () => {
      repo.findById.mockResolvedValue(
        makePost({ title: 'Як обрати чохол', keywords: ['MagSafe', 'подарунок'] }) as never,
      );

      await service.indexPost('post-1');

      const doc = firstIndexedPost();
      expect(doc.keywords).toEqual(['MagSafe', 'подарунок']);
      expect(doc.searchTerms).toContain('магсейф');
    });

    it('carries keywords on the full blog reindex path as well (TASK-558)', async () => {
      repo.findAllAdmin.mockResolvedValue({
        posts: [makePost({ keywords: ['подарунок'] })],
        total: 1,
      } as never);

      await service.reindexAll();

      const doc = firstIndexedPost();
      expect(doc.keywords).toEqual(['подарунок']);
    });

    it('DELETES the document when the post is a draft (unpublish removes it from search)', async () => {
      repo.findById.mockResolvedValue(makePost({ status: PublishStatus.DRAFT }) as never);

      await service.indexPost('post-1');

      expect(meili.deleteDocument).toHaveBeenCalledWith('post-1', BLOG_POSTS_INDEX);
      expect(meili.indexDocuments).not.toHaveBeenCalled();
    });

    it('deletes the document when the post is gone', async () => {
      repo.findById.mockResolvedValue(null);

      await service.indexPost('post-1');

      expect(meili.deleteDocument).toHaveBeenCalledWith('post-1', BLOG_POSTS_INDEX);
    });

    it('is inert when the engine is not configured', async () => {
      meili.isConfigured.mockReturnValue(false);

      await service.indexPost('post-1');
      await service.removePost('post-1');

      expect(repo.findById).not.toHaveBeenCalled();
      expect(meili.deleteDocument).not.toHaveBeenCalled();
    });
  });

  // ─── search ────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('returns ranked ids and the engine total, filtered by category slug', async () => {
      meili.search.mockResolvedValue({
        hits: [{ id: 'post-3' }, { id: 'post-1' }] as never,
        totalHits: 2,
      });

      const result = await service.search({
        q: 'павербнак',
        categorySlug: 'guides',
        page: 2,
        limit: 9,
        includeUnlisted: false,
      });

      // page/hitsPerPage (TASK-537): the only mode in which the engine counts
      // exactly — the hub draws numbered pages from this total.
      expect(meili.search).toHaveBeenCalledWith(
        'павербнак',
        { page: 2, hitsPerPage: 9, filter: ['categorySlug = "guides"', 'listed = true'] },
        BLOG_POSTS_INDEX,
      );
      expect(result).toEqual({ ids: ['post-3', 'post-1'], total: 2 });
    });

    // TASK-537 × TASK-436 — an exact total is only exact if the engine counts
    // what the hub shows. The re-read drops `listed = false` posts, so an index
    // that did not filter them counted every matching unlisted post into
    // `totalHits` and drew a page the hub could never fill.
    it('filters unlisted posts in the engine so its total counts only what the hub shows', async () => {
      meili.search.mockResolvedValue({ hits: [{ id: 'post-1' }] as never, totalHits: 1 });

      await service.search({ q: 'огляд', page: 1, limit: 9, includeUnlisted: false });
      expect(meili.search).toHaveBeenLastCalledWith(
        'огляд',
        expect.objectContaining({ filter: ['listed = true'] }),
        BLOG_POSTS_INDEX,
      );

      // The sitemap keeps its unlisted posts (TASK-436), so no listing clause.
      await service.search({ q: 'огляд', page: 1, limit: 9, includeUnlisted: true });
      expect(meili.search).toHaveBeenLastCalledWith(
        'огляд',
        expect.objectContaining({ filter: undefined }),
        BLOG_POSTS_INDEX,
      );
    });

    it('reports a page past the end as an empty answer, not as "could not tell you" (TASK-537)', async () => {
      // The engine matched 12 articles and the URL asks for page 5 of 9-per-page.
      // `null` would send the hub to Postgres — a different set and a different
      // total under the same URL.
      meili.search.mockResolvedValue({ hits: [], totalHits: 12 });

      const result = await service.search({
        q: 'iphone',
        page: 5,
        limit: 9,
        includeUnlisted: false,
      });

      expect(result).toEqual({ ids: [], total: 12 });
    });

    it('caps the deepest reachable page at the index maxTotalHits (TASK-537)', () => {
      expect(BLOG_POSTS_INDEX_SETTINGS.pagination).toEqual({ maxTotalHits: SEARCH_MAX_TOTAL_HITS });
    });

    // The value sits inside a QUOTED filter expression, so a quote in it
    // rewrites the expression. The DTO rejects a non-slug; this is the second
    // lock, because `BlogSearchQuery` is a plain interface a future caller can
    // satisfy without going through that DTO.
    it('drops a category slug that could rewrite the filter expression', async () => {
      meili.search.mockResolvedValue({ hits: [{ id: 'post-1' }] as never, totalHits: 1 });

      await service.search({
        q: 'огляд',
        categorySlug: 'x" OR categorySlug != "zzz',
        page: 1,
        limit: 9,
        includeUnlisted: true,
      });

      expect(meili.search).toHaveBeenCalledWith(
        'огляд',
        { page: 1, hitsPerPage: 9, filter: undefined },
        BLOG_POSTS_INDEX,
      );
    });

    it('answers null for a blank query, an unconfigured engine, or zero hits', async () => {
      expect(
        await service.search({ q: '   ', page: 1, limit: 9, includeUnlisted: false }),
      ).toBeNull();
      expect(meili.search).not.toHaveBeenCalled();

      meili.isConfigured.mockReturnValue(false);
      expect(
        await service.search({ q: 'iphone', page: 1, limit: 9, includeUnlisted: false }),
      ).toBeNull();

      // Zero hits is "could not tell you", not "no such article": the index may
      // simply be empty on a freshly seeded server (TASK-376).
      meili.isConfigured.mockReturnValue(true);
      meili.search.mockResolvedValue({ hits: [], totalHits: 0 });
      expect(
        await service.search({ q: 'iphone', page: 1, limit: 9, includeUnlisted: false }),
      ).toBeNull();
    });
  });

  // ─── reindexAll ────────────────────────────────────────────────────────────

  describe('reindexAll', () => {
    it('upserts published posts and prunes only what the database no longer has', async () => {
      repo.findAllAdmin.mockResolvedValue({ posts: [makePost()], total: 1 } as never);
      meili.listDocumentIds.mockResolvedValue(new Set(['post-1', 'gone-1']));

      const indexed = await service.reindexAll();

      expect(repo.findAllAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ status: PublishStatus.PUBLISHED }),
      );
      expect(indexed).toBe(1);
      expect(meili.deleteDocuments).toHaveBeenCalledWith(['gone-1'], BLOG_POSTS_INDEX);
    });

    it('keeps existing documents when the database returns nothing publishable', async () => {
      repo.findAllAdmin.mockResolvedValue({ posts: [], total: 0 } as never);
      meili.listDocumentIds.mockResolvedValue(new Set(['post-1']));

      const indexed = await service.reindexAll();

      expect(indexed).toBe(0);
      expect(meili.deleteDocuments).not.toHaveBeenCalled();
    });

    it('counts only the batches Meilisearch confirmed it applied', async () => {
      repo.findAllAdmin.mockResolvedValue({ posts: [makePost()], total: 1 } as never);
      meili.waitForTasks.mockResolvedValue({ failedUids: [10] });

      expect(await service.reindexAll()).toBe(0);
    });

    it('returns 0 without touching Meili when unconfigured', async () => {
      meili.isConfigured.mockReturnValue(false);

      expect(await service.reindexAll()).toBe(0);
      expect(repo.findAllAdmin).not.toHaveBeenCalled();
    });

    it('joins a reindex already in flight instead of starting a second one', async () => {
      // Same rule as the product index: the boot reindex and the reindex script
      // meet in one process, and two passes would race their prunes.
      repo.findAllAdmin.mockResolvedValue({ posts: [makePost()], total: 1 } as never);

      const [first, second] = await Promise.all([service.reindexAll(), service.reindexAll()]);

      expect([first, second]).toEqual([1, 1]);
      expect(repo.findAllAdmin).toHaveBeenCalledTimes(1);

      await service.reindexAll();
      expect(repo.findAllAdmin).toHaveBeenCalledTimes(2);
    });
  });
});
