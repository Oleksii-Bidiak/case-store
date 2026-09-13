import { Injectable, OnModuleInit } from '@nestjs/common';
import { PublishStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BlogRepository, type BlogPostWithCategory } from '../blog/blog.repository';
import {
  MeiliClient,
  BLOG_POSTS_INDEX,
  type BlogPostSearchDocument,
  type IndexSettings,
} from './meili.client';
import { UA_EN_SYNONYMS, extractSearchSynonymTerms } from './search-synonyms';
import type { BlogSearchHits } from './blog-indexer';

/** Batch size for the full blog reindex pull. */
const REINDEX_BATCH = 100;

/**
 * Settings for the `blog_posts` index (TASK-417).
 *
 * Deliberately the SAME `typoTolerance` and `synonyms` as the products index:
 * the header dropdown searches both in one keystroke, and a shopper who types
 * «павербнак» must not get typo-corrected products next to an empty article
 * list. `excerpt` is searchable but ranks after the title; `searchTerms` carries
 * the cross-script equivalents, last, for the same reason it does on products.
 */
export const BLOG_POSTS_INDEX_SETTINGS: IndexSettings = {
  searchableAttributes: ['title', 'excerpt', 'categoryName', 'searchTerms'],
  filterableAttributes: ['categorySlug'],
  sortableAttributes: ['publishedAt'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
  },
  synonyms: UA_EN_SYNONYMS,
};

/** One page of a blog index query. */
export interface BlogSearchQuery {
  q: string;
  /** Restrict to one category slug (the hub's chip row). */
  categorySlug?: string;
  offset: number;
  limit: number;
}

/**
 * BlogSearchService — owns the `blog_posts` index lifecycle and its query path,
 * mirroring {@link SearchService} for products.
 *
 * Only PUBLISHED posts are ever indexed: `indexPost` re-reads the row and
 * DELETES the document when the post is a draft, scheduled again, or gone, so
 * unpublishing removes an article from search without a separate call. Query
 * results are ids only — `BlogService` re-hydrates them through the
 * published-only repository read, so even a stale document cannot surface an
 * unpublished article.
 *
 * Every engine call is best-effort. With no engine configured the service is
 * inert and `search` answers `null`, which the caller reads as "use Postgres".
 */

/** The charset `generateSlug` produces — and the only one safe to interpolate. */
const SLUG = /^[a-z0-9-]+$/;

/**
 * Build the category clause, or nothing at all.
 *
 * The value lands inside a QUOTED Meilisearch filter expression, so a quote in
 * it rewrites the expression. `BlogPostListQueryDto` already rejects anything
 * that is not a slug; this is the second lock, because `BlogSearchQuery` is a
 * plain interface any future caller can satisfy without passing that DTO.
 *
 * A non-slug drops the clause rather than throwing: `search` is best-effort by
 * contract, and a widened engine answer is still re-gated to PUBLISHED posts on
 * hydration. It can never widen past that.
 */
function buildCategoryFilter(categorySlug?: string): string[] | undefined {
  if (!categorySlug || !SLUG.test(categorySlug)) return undefined;
  return [`categorySlug = "${categorySlug}"`];
}

@Injectable()
export class BlogSearchService implements OnModuleInit {
  constructor(
    private readonly meili: MeiliClient,
    private readonly blogRepository: BlogRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BlogSearchService.name);
  }

  /** Bootstrap: ensure the index + settings, then best-effort self-populate. */
  async onModuleInit(): Promise<void> {
    if (!this.meili.isConfigured()) return;
    await this.ensureIndex();
    // Fire-and-forget so a slow/down engine never blocks app boot.
    void this.reindexAll().catch((err) =>
      this.logger.warn({ err }, 'Bootstrap blog reindex failed (non-fatal)'),
    );
  }

  /** Apply the index settings (idempotent, best-effort). */
  async ensureIndex(): Promise<void> {
    await this.meili.ensureIndex(BLOG_POSTS_INDEX_SETTINGS, BLOG_POSTS_INDEX);
  }

  /**
   * Upsert a post into the index, or remove it when it is not (or no longer)
   * publicly readable — missing, draft, or scheduled.
   */
  async indexPost(postId: string): Promise<void> {
    if (!this.meili.isConfigured()) return;
    const post = await this.blogRepository.findById(postId);
    if (!post || post.status !== PublishStatus.PUBLISHED) {
      await this.meili.deleteDocument(postId, BLOG_POSTS_INDEX);
      return;
    }
    await this.meili.indexDocuments([toDocument(post)], BLOG_POSTS_INDEX);
  }

  /** Remove a post from the index (unpublish / delete). */
  async removePost(postId: string): Promise<void> {
    if (!this.meili.isConfigured()) return;
    await this.meili.deleteDocument(postId, BLOG_POSTS_INDEX);
  }

  /**
   * Full reindex: upsert every published post, then drop whatever the database
   * no longer knows about. Upsert-then-prune, never clear-then-refill, for the
   * reason spelled out on the product reindex (TASK-376): a failure part-way
   * through must not be able to empty a working index.
   */
  async reindexAll(): Promise<number> {
    if (!this.meili.isConfigured()) return 0;
    await this.ensureIndex();

    const seenIds = new Set<string>();
    const batches: { uid: number; count: number }[] = [];
    for (let page = 1; ; page++) {
      const { posts } = await this.blogRepository.findAllAdmin({
        page,
        limit: REINDEX_BATCH,
        status: PublishStatus.PUBLISHED,
      });
      if (posts.length === 0) break;
      const docs = posts.map(toDocument);
      for (const doc of docs) seenIds.add(doc.id);
      const uid = await this.meili.indexDocuments(docs, BLOG_POSTS_INDEX);
      if (uid !== null) batches.push({ uid, count: docs.length });
      if (posts.length < REINDEX_BATCH) break;
    }

    const { failedUids } = await this.meili.waitForTasks(
      batches.map((b) => b.uid),
      BLOG_POSTS_INDEX,
    );
    const failed = new Set(failedUids);
    const indexed = batches.filter((b) => !failed.has(b.uid)).reduce((sum, b) => sum + b.count, 0);

    const pruned = await this.pruneStaleDocuments(seenIds);
    this.logger.info({ indexed, pruned }, 'Meilisearch blog reindex complete');
    return indexed;
  }

  /**
   * Ranked post ids for a query, or `null` when the engine is unconfigured, the
   * request failed, or it matched nothing. `null` — not an empty page — is
   * deliberate for the zero-hit case (TASK-376): an empty or stale index must
   * fall through to Postgres rather than answer "no articles" over a full blog.
   */
  async search(query: BlogSearchQuery): Promise<BlogSearchHits | null> {
    const q = (query.q ?? '').trim();
    if (!this.meili.isConfigured() || q.length === 0) return null;

    const result = await this.meili.search<BlogPostSearchDocument>(
      q,
      {
        limit: query.limit,
        offset: query.offset,
        filter: buildCategoryFilter(query.categorySlug),
      },
      BLOG_POSTS_INDEX,
    );
    if (!result || result.hits.length === 0) return null;

    return { ids: result.hits.map((hit) => hit.id), total: result.estimatedTotalHits };
  }

  /**
   * Delete documents the database no longer backs. Same two guards as the
   * product prune: an unreadable listing (`null`) means "could not check", and
   * an empty `seenIds` means the read found nothing at all — neither is grounds
   * for emptying the index.
   */
  private async pruneStaleDocuments(seenIds: Set<string>): Promise<number> {
    const indexedIds = await this.meili.listDocumentIds(BLOG_POSTS_INDEX);
    if (indexedIds === null) return 0;
    if (seenIds.size === 0) {
      if (indexedIds.size > 0) {
        this.logger.warn(
          { indexedDocuments: indexedIds.size },
          'Blog reindex found no published posts; keeping existing documents',
        );
      }
      return 0;
    }
    const stale = [...indexedIds].filter((id) => !seenIds.has(id));
    if (stale.length === 0) return 0;
    const uid = await this.meili.deleteDocuments(stale, BLOG_POSTS_INDEX);
    if (uid !== null) await this.meili.waitForTasks([uid], BLOG_POSTS_INDEX);
    return stale.length;
  }
}

/**
 * Build a blog search document from a post row. The body is NOT indexed: it is
 * sanitized HTML, so indexing it would put tag names and attribute values into
 * the searchable text; the title, excerpt and category are what a reader
 * actually searches by.
 */
function toDocument(post: BlogPostWithCategory): BlogPostSearchDocument {
  return {
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    slug: post.slug,
    categorySlug: post.category.slug,
    categoryName: post.category.name,
    publishedAt: post.publishedAt ? post.publishedAt.getTime() : 0,
    searchTerms: extractSearchSynonymTerms(`${post.title} ${post.category.name}`),
  };
}
