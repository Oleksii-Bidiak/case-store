import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { PublishStatus } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
// eslint-disable-next-line local/no-deep-module-import -- cycle: blog barrel > blog.module > search.module > this file. (BlogRepository is not in BlogModule.exports either; SearchModule provides its own — TASK-827)
import { BlogRepository, type BlogPostWithCategory } from '../blog/blog.repository';
import {
  MeiliClient,
  BLOG_POSTS_INDEX,
  SEARCH_MAX_TOTAL_HITS,
  type BlogPostSearchDocument,
  type IndexSettings,
} from './meili.client';
import { UA_EN_SYNONYMS, extractSearchSynonymTerms, type SynonymMap } from './search-synonyms';
import { SearchSynonymsService } from '../search-synonyms';
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
 *
 * `keywords` (TASK-558) — the admin's tags (TASK-437) — rank right after the
 * title, exactly as they follow the name/article number on products: a tag is a
 * deliberate statement of what the article is about, a word in the excerpt is
 * not. A settings change reaches a live index through `npm run search:reindex`.
 */
export const BLOG_POSTS_INDEX_SETTINGS: IndexSettings = {
  searchableAttributes: ['title', 'keywords', 'excerpt', 'categoryName', 'searchTerms'],
  // `listed` (TASK-537): filtered in the engine so its exact total matches what
  // the hub shows — see `BlogPostSearchDocument.listed`.
  filterableAttributes: ['categorySlug', 'listed'],
  sortableAttributes: ['publishedAt'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
  },
  synonyms: UA_EN_SYNONYMS,
  // The deepest result the hub's page list can reach (TASK-537).
  pagination: { maxTotalHits: SEARCH_MAX_TOTAL_HITS },
};

/**
 * One page of a blog index query. Addressed by page NUMBER, not offset
 * (TASK-537): the engine only counts exactly in page/hitsPerPage mode, and the
 * hub draws its numbered page list from that count.
 */
export interface BlogSearchQuery {
  q: string;
  /** Restrict to one category slug (the hub's chip row). */
  categorySlug?: string;
  /** 1-based page number. */
  page: number;
  /** Posts per page. */
  limit: number;
  /**
   * Keep `listed = false` posts (the sitemap) or drop them (every list surface).
   * Required, like on the repository reads (TASK-436): the engine must count the
   * same set the re-read keeps, or the exact total is exact about the wrong set.
   */
  includeUnlisted: boolean;
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
 * Build the filter clauses, or nothing at all.
 *
 * Category: the value lands inside a QUOTED Meilisearch filter expression, so a
 * quote in it rewrites the expression. `BlogPostListQueryDto` already rejects
 * anything that is not a slug; this is the second lock, because
 * `BlogSearchQuery` is a plain interface any future caller can satisfy without
 * passing that DTO. A non-slug drops the clause rather than throwing: `search`
 * is best-effort by contract, and a widened engine answer is still re-gated to
 * PUBLISHED posts on hydration. It can never widen past that.
 *
 * Listing (TASK-537): unless the caller keeps unlisted posts, the engine drops
 * them — so its exact total counts the set the re-read keeps.
 */
function buildFilter(query: BlogSearchQuery): string[] | undefined {
  const clauses: string[] = [];
  if (query.categorySlug && SLUG.test(query.categorySlug)) {
    clauses.push(`categorySlug = "${query.categorySlug}"`);
  }
  if (!query.includeUnlisted) clauses.push('listed = true');
  return clauses.length > 0 ? clauses : undefined;
}

@Injectable()
export class BlogSearchService implements OnModuleInit {
  /** The full reindex currently running, if any — see {@link reindexAll}. */
  private reindexInFlight: Promise<number> | null = null;

  constructor(
    private readonly meili: MeiliClient,
    private readonly blogRepository: BlogRepository,
    private readonly logger: PinoLogger,
    // The admin-edited synonym list (TASK-559) — optional for the hand-built
    // unit specs only; absent → the built-in dictionary.
    @Optional() private readonly synonyms?: SearchSynonymsService,
  ) {
    this.logger.setContext(BlogSearchService.name);
  }

  /** The synonym map to index with: the saved list, or the built-in one. */
  private synonymMap(): Promise<SynonymMap> {
    return this.synonyms ? this.synonyms.getSynonymMap() : Promise.resolve(UA_EN_SYNONYMS);
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
    // Same map as the products index, from the admin's saved list (TASK-559).
    await this.meili.ensureIndex(
      { ...BLOG_POSTS_INDEX_SETTINGS, synonyms: await this.synonymMap() },
      BLOG_POSTS_INDEX,
    );
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
    await this.meili.indexDocuments([toDocument(post, await this.synonymMap())], BLOG_POSTS_INDEX);
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
   *
   * Single-flight, like the product reindex (TASK-522): a call made while a
   * pass is running joins it, so the boot reindex and the reindex script never
   * run two passes whose prunes race.
   */
  reindexAll(): Promise<number> {
    if (!this.reindexInFlight) {
      this.reindexInFlight = this.runReindex().finally(() => {
        this.reindexInFlight = null;
      });
    }
    return this.reindexInFlight;
  }

  private async runReindex(): Promise<number> {
    if (!this.meili.isConfigured()) return 0;
    await this.ensureIndex();

    // One synonym map for the whole pass, so every document of it agrees.
    const synonyms = await this.synonymMap();
    const seenIds = new Set<string>();
    const batches: { uid: number; count: number }[] = [];
    for (let page = 1; ; page++) {
      const { posts } = await this.blogRepository.findAllAdmin({
        page,
        limit: REINDEX_BATCH,
        status: PublishStatus.PUBLISHED,
      });
      if (posts.length === 0) break;
      const docs = posts.map((post) => toDocument(post, synonyms));
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
   * Ranked post ids for one page of a query, with the engine's EXACT total
   * (TASK-537), or `null` when the engine is unconfigured, the request failed,
   * or it matched nothing at all. `null` — not an empty page — is deliberate for
   * the zero-match case (TASK-376): an empty or stale index must fall through to
   * Postgres rather than answer "no articles" over a full blog.
   *
   * Matches but no hits on the requested page is NOT that case: the engine has
   * answered and the page is past the end, so it comes back as `ids: []` with
   * the real total — a fallback there would put Postgres' different set and
   * total under the same URL.
   */
  async search(query: BlogSearchQuery): Promise<BlogSearchHits | null> {
    const q = (query.q ?? '').trim();
    if (!this.meili.isConfigured() || q.length === 0) return null;

    const result = await this.meili.search<BlogPostSearchDocument>(
      q,
      {
        page: query.page,
        hitsPerPage: query.limit,
        filter: buildFilter(query),
      },
      BLOG_POSTS_INDEX,
    );
    if (!result) return null;

    const ids = result.hits.map((hit) => hit.id);
    // A page-mode answer always carries `totalHits`; should one ever lack it,
    // count only what is provably there (never an estimate that overshoots).
    const total =
      result.totalHits ?? (ids.length > 0 ? (query.page - 1) * query.limit + ids.length : 0);
    if (total === 0) return null;

    return { ids, total };
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
 * the searchable text; the title, the admin's tags, the excerpt and the
 * category are what a reader actually searches by.
 */
function toDocument(post: BlogPostWithCategory, synonyms: SynonymMap): BlogPostSearchDocument {
  const keywords = post.keywords ?? [];
  return {
    id: post.id,
    title: post.title,
    keywords,
    excerpt: post.excerpt,
    slug: post.slug,
    categorySlug: post.category.slug,
    categoryName: post.category.name,
    publishedAt: post.publishedAt ? post.publishedAt.getTime() : 0,
    listed: post.listed,
    // Tags feed the cross-script terms too (TASK-558), as they do on products.
    searchTerms: extractSearchSynonymTerms(
      `${post.title} ${post.category.name} ${keywords.join(' ')}`,
      synonyms,
    ),
  };
}
