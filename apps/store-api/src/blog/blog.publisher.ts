import { Injectable } from '@nestjs/common';
import type { PublishablePort, RevalidateTarget } from '../publishing';
import { BlogIndexer } from '../search/blog-indexer';
import { BlogRepository } from './blog.repository';

/**
 * BlogPublisher — the blog's {@link PublishablePort} (TASK-525).
 *
 * Registered under `PUBLISHABLE_REPOSITORY` in `BlogModule`, so the
 * PublishingScheduler flips due scheduled posts live through it. It used to be
 * `BlogRepository` itself, which flipped the rows and told nobody: an article
 * published by the cron was live on the hub but absent from search until the
 * next restart re-ran the bootstrap reindex. This port hands every post it flips
 * to the {@link BlogIndexer} seam — the one `BlogService` uses for the admin's
 * publish button — so both paths to "published" end in the same index state.
 *
 * `BlogIndexer.index` re-reads the post and drops the document when it is not
 * PUBLISHED, so indexing an id is also the de-index for a post that changed
 * again in the meantime.
 */
@Injectable()
export class BlogPublisher implements PublishablePort {
  /** Cache target purged when scheduled posts go live (see PublishingScheduler). */
  readonly revalidateTarget: RevalidateTarget = {
    tags: ['blog'],
    paths: ['/blog'],
  };

  constructor(
    private readonly blogRepository: BlogRepository,
    private readonly blogIndexer: BlogIndexer,
  ) {}

  /**
   * {@link PublishablePort.publishDue}: flip the due posts, then index each one.
   *
   * Indexing is best-effort and per post. By the time it runs the rows are
   * already PUBLISHED, so a throw here must not reach the scheduler: it would
   * log a failed tick and skip the storefront revalidation for posts that ARE
   * live. One failed post does not stop the others either.
   */
  async publishDue(now: Date): Promise<number> {
    const ids = await this.blogRepository.publishDuePosts(now);
    for (const id of ids) {
      try {
        await this.blogIndexer.index(id);
      } catch {
        // Swallowed: the indexer logs its own failures, and the next reindex
        // (admin button, `npm run search:reindex`, or a restart) repairs it.
      }
    }
    return ids.length;
  }
}
