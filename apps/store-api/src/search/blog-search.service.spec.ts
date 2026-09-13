import { PublishStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BlogRepository } from '../blog/blog.repository';
import { MeiliClient, BLOG_POSTS_INDEX } from './meili.client';
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

    it('searches title, excerpt, category and the cross-script terms', () => {
      expect(BLOG_POSTS_INDEX_SETTINGS.searchableAttributes).toEqual([
        'title',
        'excerpt',
        'categoryName',
        'searchTerms',
      ]);
      expect(BLOG_POSTS_INDEX_SETTINGS.filterableAttributes).toContain('categorySlug');
    });

    it('shares the products index typo tolerance and synonyms verbatim', () => {
      // The header dropdown searches both in one keystroke — a query that is
      // typo-corrected for products must be typo-corrected for articles too.
      expect(BLOG_POSTS_INDEX_SETTINGS.typoTolerance).toEqual(
        PRODUCTS_INDEX_SETTINGS.typoTolerance,
      );
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
          }),
        ],
        BLOG_POSTS_INDEX,
      );
      const [[docs]] = meili.indexDocuments.mock.calls;
      expect(Array.isArray((docs[0] as { searchTerms: string[] }).searchTerms)).toBe(true);
      // The sanitized HTML body is deliberately NOT indexed — it would put tag
      // names and attribute values into the searchable text.
      expect(docs[0]).not.toHaveProperty('content');
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
        estimatedTotalHits: 2,
      });

      const result = await service.search({
        q: 'павербнак',
        categorySlug: 'guides',
        offset: 9,
        limit: 9,
      });

      expect(meili.search).toHaveBeenCalledWith(
        'павербнак',
        { limit: 9, offset: 9, filter: ['categorySlug = "guides"'] },
        BLOG_POSTS_INDEX,
      );
      expect(result).toEqual({ ids: ['post-3', 'post-1'], total: 2 });
    });

    // The value sits inside a QUOTED filter expression, so a quote in it
    // rewrites the expression. The DTO rejects a non-slug; this is the second
    // lock, because `BlogSearchQuery` is a plain interface a future caller can
    // satisfy without going through that DTO.
    it('drops a category slug that could rewrite the filter expression', async () => {
      meili.search.mockResolvedValue({ hits: [{ id: 'post-1' }] as never, estimatedTotalHits: 1 });

      await service.search({
        q: 'огляд',
        categorySlug: 'x" OR categorySlug != "zzz',
        offset: 0,
        limit: 9,
      });

      expect(meili.search).toHaveBeenCalledWith(
        'огляд',
        { limit: 9, offset: 0, filter: undefined },
        BLOG_POSTS_INDEX,
      );
    });

    it('answers null for a blank query, an unconfigured engine, or zero hits', async () => {
      expect(await service.search({ q: '   ', offset: 0, limit: 9 })).toBeNull();
      expect(meili.search).not.toHaveBeenCalled();

      meili.isConfigured.mockReturnValue(false);
      expect(await service.search({ q: 'iphone', offset: 0, limit: 9 })).toBeNull();

      // Zero hits is "could not tell you", not "no such article": the index may
      // simply be empty on a freshly seeded server (TASK-376).
      meili.isConfigured.mockReturnValue(true);
      meili.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });
      expect(await service.search({ q: 'iphone', offset: 0, limit: 9 })).toBeNull();
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
  });
});
