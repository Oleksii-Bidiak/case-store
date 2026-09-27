import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PublishStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma';
import { PermissionRepository } from '../src/auth/permissions';
import { createPermissionRepositoryMock } from './permission-repository.mock';
import { BLOG_POSTS_INDEX, BlogSearchService, MeiliClient, SearchService } from '../src/search';
import type { MeiliClientApi, MeiliIndexApi } from '../src/search/meili.client';

/**
 * E2E tests for the public blog list's free-text path (TASK-544):
 * `GET /api/blog?q=` → `blog_posts` index → PUBLISHED re-read, and the fall back
 * to the Postgres `contains` scan when the index cannot answer.
 *
 * What differs from `search.e2e-spec.ts`: there the whole `MeiliClient` is
 * replaced, so a failing engine can only be simulated by the wrapper's `null`
 * sentinel. Here the wrapper is the REAL `MeiliClient`, and only the SDK beneath
 * it is a double — so "the SDK rejects" → "the wrapper swallows it and answers
 * null" → "the service falls back to Postgres" runs as one chain, which nothing
 * else covered for the blog. PrismaService is mocked (no DB).
 */

class ThrottlerGuardPassThrough extends ThrottlerGuard {
  protected async handleRequest(): Promise<boolean> {
    return true;
  }
}

/** A Prisma-shaped PUBLISHED post, as `POST_INCLUDE` returns it. */
function makePostRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    slug: 'power-bank-guide',
    title: 'Як обрати павербанк',
    excerpt: 'Ємність, потужність і що ще важливо',
    content: '<p>Тіло статті</p>',
    coverImageUrl: null,
    coverBlurDataUrl: null,
    authorName: 'Редакція',
    readingMinutes: 5,
    featured: false,
    listed: true,
    metaTitle: null,
    metaDescription: null,
    keywords: [],
    ogImage: null,
    status: PublishStatus.PUBLISHED,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    scheduledAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    categoryId: 'blog-cat-1',
    authorId: null,
    category: { id: 'blog-cat-1', slug: 'guides', name: 'Гайди' },
    author: null,
    ...overrides,
  };
}

/** The `where` of a `findMany` call, for telling the two blog reads apart. */
type FindManyArgs = { where?: { id?: { in?: string[] } } };

describe('Blog (e2e)', () => {
  let app: INestApplication;

  const prismaServiceMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    blogPost: {
      findMany: jest.fn(async (_args?: FindManyArgs) => [] as unknown[]),
      count: jest.fn(async () => 0),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    // The boot-time product reindex runs through the real repository too; an
    // empty catalogue keeps it a quiet no-op.
    product: {
      findMany: jest.fn(async () => [] as unknown[]),
      count: jest.fn(async () => 0),
    },
    $queryRaw: jest.fn(async () => [] as unknown[]),
  };

  // The SDK double. Every index uid gets the same index object; the blog tests
  // only look at calls made against `blog_posts`.
  const sdkIndex: jest.Mocked<MeiliIndexApi> = {
    updateSettings: jest.fn().mockResolvedValue({ taskUid: 1 }),
    addDocuments: jest.fn().mockResolvedValue({ taskUid: 2 }),
    deleteDocument: jest.fn().mockResolvedValue({ taskUid: 3 }),
    deleteDocuments: jest.fn().mockResolvedValue({ taskUid: 4 }),
    deleteAllDocuments: jest.fn().mockResolvedValue({ taskUid: 5 }),
    getDocuments: jest.fn().mockResolvedValue({ results: [], total: 0 }),
    waitForTask: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    search: jest.fn().mockResolvedValue({ hits: [], totalHits: 0, totalPages: 0 }),
    getSettings: jest.fn().mockResolvedValue({ searchableAttributes: [] }),
  };
  const sdkClient: jest.Mocked<MeiliClientApi> = {
    health: jest.fn().mockResolvedValue({ status: 'available' }),
    index: jest.fn().mockReturnValue(sdkIndex),
    createIndex: jest.fn().mockResolvedValue({ taskUid: 0 }),
    getIndex: jest.fn().mockResolvedValue({ uid: BLOG_POSTS_INDEX }),
  };

  // The real wrapper's own logger — asserted on to prove it was the WRAPPER
  // that absorbed the SDK failure, not the service's belt-and-braces catch.
  const meiliLogger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const realMeiliClient = new MeiliClient(
    { get: () => undefined } as unknown as ConfigService,
    meiliLogger as unknown as PinoLogger,
    sdkClient,
  );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
        AppModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaServiceMock)
      .overrideProvider(PermissionRepository)
      .useValue(createPermissionRepositoryMock())
      .overrideProvider(MeiliClient)
      .useValue(realMeiliClient)
      .overrideProvider(APP_GUARD)
      .useClass(ThrottlerGuardPassThrough)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api', { exclude: ['health'] });
    await app.init();

    // The engine is "configured" (a client was injected), so both indexes start
    // a fire-and-forget reindex on boot. Join those passes (single-flight) so
    // none of their Prisma reads lands inside a test and eats its fixture.
    await app.get(BlogSearchService).reindexAll();
    await app.get(SearchService).reindexAll();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    sdkClient.index.mockReturnValue(sdkIndex);
    sdkIndex.search.mockResolvedValue({ hits: [], totalHits: 0, totalPages: 0 });
    prismaServiceMock.blogPost.findMany.mockResolvedValue([]);
    prismaServiceMock.blogPost.count.mockResolvedValue(0);
  });

  describe('GET /api/blog?q= — search index path', () => {
    it('hydrates the ranked engine ids through the PUBLISHED re-read, in engine order', async () => {
      sdkIndex.search.mockResolvedValue({
        hits: [{ id: 'post-2' }, { id: 'post-1' }],
        totalHits: 2,
        totalPages: 1,
      });
      // Prisma returns the rows in its own order; the response must not.
      prismaServiceMock.blogPost.findMany.mockResolvedValue([
        makePostRow({ id: 'post-1', slug: 'power-bank-guide' }),
        makePostRow({ id: 'post-2', slug: 'magsafe-guide', title: 'MagSafe пояснюємо' }),
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/blog')
        .query({ q: 'павербнак' })
        .expect(200);

      expect(sdkClient.index).toHaveBeenCalledWith(BLOG_POSTS_INDEX);
      expect(sdkIndex.search).toHaveBeenCalledWith('павербнак', {
        page: 1,
        hitsPerPage: 9,
        filter: ['listed = true'],
      });
      // The re-read is gated to PUBLISHED + listed and scoped to the hit ids.
      expect(prismaServiceMock.blogPost.findMany).toHaveBeenCalledTimes(1);
      expect(prismaServiceMock.blogPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: ['post-2', 'post-1'] },
            status: PublishStatus.PUBLISHED,
            listed: true,
          },
        }),
      );
      // The Postgres scan never ran.
      expect(prismaServiceMock.blogPost.count).not.toHaveBeenCalled();

      expect(res.body.data.map((post: { id: string }) => post.id)).toEqual(['post-2', 'post-1']);
      expect(res.body.data[0]).toMatchObject({
        slug: 'magsafe-guide',
        category: { slug: 'guides', name: 'Гайди' },
      });
      expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 9, totalPages: 1 });
    });

    it('narrows the engine query to the category chip and asks for the requested page', async () => {
      sdkIndex.search.mockResolvedValue({ hits: [{ id: 'post-1' }], totalHits: 4, totalPages: 2 });
      prismaServiceMock.blogPost.findMany.mockResolvedValue([makePostRow()]);

      const res = await request(app.getHttpServer())
        .get('/api/blog')
        .query({ q: 'чохол', category: 'guides', page: 2, limit: 3 })
        .expect(200);

      expect(sdkIndex.search).toHaveBeenCalledWith('чохол', {
        page: 2,
        hitsPerPage: 3,
        filter: ['categorySlug = "guides"', 'listed = true'],
      });
      expect(res.body.meta).toEqual({ total: 4, page: 2, limit: 3, totalPages: 2 });
    });

    it('answers a page past the end from the engine instead of swapping in Postgres', async () => {
      sdkIndex.search.mockResolvedValue({ hits: [], totalHits: 10, totalPages: 2 });

      const res = await request(app.getHttpServer())
        .get('/api/blog')
        .query({ q: 'чохол', page: 5 })
        .expect(200);

      expect(res.body).toEqual({ data: [], meta: { total: 10, page: 5, limit: 9, totalPages: 2 } });
      expect(prismaServiceMock.blogPost.findMany).not.toHaveBeenCalled();
      expect(prismaServiceMock.blogPost.count).not.toHaveBeenCalled();
    });

    it('does not consult the engine for a request without q', async () => {
      prismaServiceMock.blogPost.findMany.mockResolvedValue([makePostRow()]);
      prismaServiceMock.blogPost.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer()).get('/api/blog').expect(200);

      expect(sdkIndex.search).not.toHaveBeenCalled();
      expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 9, totalPages: 1 });
    });

    it('rejects a category that is not a slug with 400 before it reaches the filter', async () => {
      await request(app.getHttpServer())
        .get('/api/blog')
        .query({ q: 'чохол', category: 'guides" OR listed = false OR categorySlug = "x' })
        .expect(400);

      expect(sdkIndex.search).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/blog?q= — Postgres fallback', () => {
    /** The `contains` scan the fallback runs for `q`. */
    function expectPostgresScan(q: string) {
      const where = {
        status: PublishStatus.PUBLISHED,
        listed: true,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { excerpt: { contains: q, mode: 'insensitive' } },
        ],
      };
      expect(prismaServiceMock.blogPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where }),
      );
      expect(prismaServiceMock.blogPost.count).toHaveBeenCalledWith({ where });
    }

    it('falls back when the SDK request fails — the real client absorbs the error', async () => {
      sdkIndex.search.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:7700'));
      prismaServiceMock.blogPost.findMany.mockResolvedValue([makePostRow()]);
      prismaServiceMock.blogPost.count.mockResolvedValue(1);
      const clientSearch = jest.spyOn(realMeiliClient, 'search');

      try {
        const res = await request(app.getHttpServer())
          .get('/api/blog')
          .query({ q: 'павербанк' })
          .expect(200);

        expect(sdkIndex.search).toHaveBeenCalledTimes(1);
        // The WRAPPER turned the rejection into its `null` sentinel. Checked on
        // its resolved value, not on the HTTP outcome: `BlogService` also
        // catches a throwing indexer, so a wrapper that rethrew would still
        // produce a 200 here and hide the broken contract every other caller
        // (product search, suggest) relies on.
        expect(clientSearch).toHaveBeenCalledTimes(1);
        await expect(clientSearch.mock.results[0].value).resolves.toBeNull();
        expect(meiliLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ indexUid: BLOG_POSTS_INDEX, query: 'павербанк' }),
          'Meilisearch search failed; caller will fall back',
        );
        expectPostgresScan('павербанк');
        expect(res.body.data.map((post: { id: string }) => post.id)).toEqual(['post-1']);
        expect(res.body.meta).toEqual({ total: 1, page: 1, limit: 9, totalPages: 1 });
      } finally {
        clientSearch.mockRestore();
      }
    });

    it('falls back when the engine matches nothing (an empty or stale index)', async () => {
      sdkIndex.search.mockResolvedValue({ hits: [], totalHits: 0, totalPages: 0 });
      prismaServiceMock.blogPost.findMany.mockResolvedValue([makePostRow()]);
      prismaServiceMock.blogPost.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/blog')
        .query({ q: 'павербанк' })
        .expect(200);

      expectPostgresScan('павербанк');
      expect(res.body.data).toHaveLength(1);
    });

    it('falls back when no engine hit survives the PUBLISHED re-read', async () => {
      // The index still holds a post that has since been unpublished.
      sdkIndex.search.mockResolvedValue({
        hits: [{ id: 'unpublished-post' }],
        totalHits: 1,
        totalPages: 1,
      });
      prismaServiceMock.blogPost.findMany.mockImplementation(async (args?: FindManyArgs) =>
        args?.where?.id?.in ? [] : [makePostRow()],
      );
      prismaServiceMock.blogPost.count.mockResolvedValue(1);

      const res = await request(app.getHttpServer())
        .get('/api/blog')
        .query({ q: 'павербанк' })
        .expect(200);

      expect(prismaServiceMock.blogPost.findMany).toHaveBeenCalledTimes(2);
      expectPostgresScan('павербанк');
      expect(res.body.data.map((post: { id: string }) => post.id)).toEqual(['post-1']);
      expect(res.body.meta.total).toBe(1);
    });
  });

  // TASK-543 — the header popup's own endpoint: the same index → re-read →
  // Postgres chain as `?q=`, but four columns per article and never the body.
  describe('GET /api/blog/suggest', () => {
    const SELECT = { id: true, slug: true, title: true, coverImageUrl: true };

    it('answers engine hits in engine order with id/slug/title/cover only', async () => {
      sdkIndex.search.mockResolvedValue({
        hits: [{ id: 'post-2' }, { id: 'post-1' }],
        totalHits: 2,
        totalPages: 1,
      });
      prismaServiceMock.blogPost.findMany.mockResolvedValue([
        makePostRow({ id: 'post-1', slug: 'power-bank-guide' }),
        makePostRow({ id: 'post-2', slug: 'magsafe-guide', title: 'MagSafe пояснюємо' }),
      ]);

      const res = await request(app.getHttpServer())
        .get('/api/blog/suggest')
        .query({ q: 'павербнак' })
        .expect(200);

      expect(sdkIndex.search).toHaveBeenCalledWith('павербнак', {
        page: 1,
        hitsPerPage: 5,
        filter: ['listed = true'],
      });
      // A select-only re-read, gated like the list's: no `include`, no body.
      expect(prismaServiceMock.blogPost.findMany).toHaveBeenCalledTimes(1);
      expect(prismaServiceMock.blogPost.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['post-2', 'post-1'] },
          status: PublishStatus.PUBLISHED,
          listed: true,
        },
        select: SELECT,
      });
      expect(prismaServiceMock.blogPost.count).not.toHaveBeenCalled();

      expect(res.body).toEqual({
        data: [
          { id: 'post-2', slug: 'magsafe-guide', title: 'MagSafe пояснюємо', coverImageUrl: null },
          {
            id: 'post-1',
            slug: 'power-bank-guide',
            title: 'Як обрати павербанк',
            coverImageUrl: null,
          },
        ],
      });
      expect(res.body.data[0]).not.toHaveProperty('content');
      expect(res.body).not.toHaveProperty('meta');
    });

    it('falls back to the Postgres scan when the SDK request fails, honouring limit', async () => {
      sdkIndex.search.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:7700'));
      prismaServiceMock.blogPost.findMany.mockResolvedValue([makePostRow()]);

      const res = await request(app.getHttpServer())
        .get('/api/blog/suggest')
        .query({ q: 'павербанк', limit: 3 })
        .expect(200);

      expect(sdkIndex.search).toHaveBeenCalledWith('павербанк', {
        page: 1,
        hitsPerPage: 3,
        filter: ['listed = true'],
      });
      expect(prismaServiceMock.blogPost.findMany).toHaveBeenCalledWith({
        where: {
          status: PublishStatus.PUBLISHED,
          listed: true,
          OR: [
            { title: { contains: 'павербанк', mode: 'insensitive' } },
            { excerpt: { contains: 'павербанк', mode: 'insensitive' } },
          ],
        },
        select: SELECT,
        take: 3,
        orderBy: [{ featured: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      });
      expect(res.body.data).toEqual([
        {
          id: 'post-1',
          slug: 'power-bank-guide',
          title: 'Як обрати павербанк',
          coverImageUrl: null,
        },
      ]);
    });

    it('is its own route, not a post slug', async () => {
      // `findFirst` (the :slug read) is not even on the Prisma double — were
      // the request routed there it would 500, not answer an empty list.
      const res = await request(app.getHttpServer())
        .get('/api/blog/suggest')
        .query({ q: 'нічого' })
        .expect(200);

      expect(res.body).toEqual({ data: [] });
    });

    it('rejects a missing q and an out-of-range limit with 400', async () => {
      await request(app.getHttpServer()).get('/api/blog/suggest').expect(400);
      await request(app.getHttpServer())
        .get('/api/blog/suggest')
        .query({ q: 'чохол', limit: 11 })
        .expect(400);

      expect(sdkIndex.search).not.toHaveBeenCalled();
      expect(prismaServiceMock.blogPost.findMany).not.toHaveBeenCalled();
    });
  });
});
