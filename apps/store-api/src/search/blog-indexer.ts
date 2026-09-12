import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BlogSearchService, type BlogSearchQuery } from './blog-search.service';

/** Ranked post ids for one page of a blog query, plus the engine's own total. */
export interface BlogSearchHits {
  ids: string[];
  total: number;
}

/**
 * BlogIndexer — the narrow seam `BlogService` depends on to keep the blog index
 * in step with post mutations AND to ask it a question, WITHOUT knowing anything
 * about Meilisearch. The exact shape `ProductIndexer` has for products
 * (`SearchModule` provides the concrete implementation; tests inject a mock),
 * with one method more: the blog has no separate search endpoint — the hub grid
 * and the header dropdown both read `GET /api/blog?q=`, so the query path has to
 * come through the same seam.
 *
 * Every method is best-effort: writes resolve even when indexing fails, and
 * `search` answers `null` for "the engine could not tell you", which the caller
 * reads as "fall back to Postgres" rather than "no results".
 */
export abstract class BlogIndexer {
  /** Upsert the post (by id) into the index — or drop it when not published. */
  abstract index(postId: string): Promise<void>;
  /** Remove the post (by id) from the index. */
  abstract remove(postId: string): Promise<void>;
  /** Ranked ids for a query, or `null` when the engine cannot answer. */
  abstract search(query: BlogSearchQuery): Promise<BlogSearchHits | null>;
}

/**
 * Meilisearch-backed {@link BlogIndexer}. Delegates to {@link BlogSearchService}
 * and swallows any failure (logged) so the caller's blog mutation always
 * succeeds and a down engine degrades search to the Prisma scan instead of
 * 500-ing the hub.
 */
@Injectable()
export class SearchBlogIndexer extends BlogIndexer {
  constructor(
    private readonly blogSearchService: BlogSearchService,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(SearchBlogIndexer.name);
  }

  async index(postId: string): Promise<void> {
    try {
      await this.blogSearchService.indexPost(postId);
    } catch (err) {
      this.logger.warn({ err, postId }, 'Best-effort blog post index failed');
    }
  }

  async remove(postId: string): Promise<void> {
    try {
      await this.blogSearchService.removePost(postId);
    } catch (err) {
      this.logger.warn({ err, postId }, 'Best-effort blog post de-index failed');
    }
  }

  async search(query: BlogSearchQuery): Promise<BlogSearchHits | null> {
    try {
      return await this.blogSearchService.search(query);
    } catch (err) {
      this.logger.warn({ err }, 'Blog index query failed; caller will fall back');
      return null;
    }
  }
}
