import { AdminSearchController } from './admin-search.controller';
import type { SearchService } from './search.service';
import type { BlogSearchService } from './blog-search.service';

/**
 * TASK-525 — the admin's one repair button rebuilt the products index only; the
 * `blog_posts` index could drift until the next restart. The endpoint now
 * rebuilds both and reports both counts, so the operator can see an empty blog
 * index instead of assuming it was covered.
 */
describe('AdminSearchController.reindex (TASK-525)', () => {
  const calls: string[] = [];
  const searchService = {
    reindexAll: jest.fn(async () => {
      calls.push('products:start');
      await new Promise((resolve) => setImmediate(resolve));
      calls.push('products:end');
      return 178;
    }),
  };
  const blogSearchService = {
    reindexAll: jest.fn(async () => {
      calls.push('blog:start');
      return 12;
    }),
  };

  function build(): AdminSearchController {
    return new AdminSearchController(
      searchService as unknown as SearchService,
      blogSearchService as unknown as BlogSearchService,
    );
  }

  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
  });

  it('rebuilds the products AND the blog index and reports both counts', async () => {
    await expect(build().reindex()).resolves.toEqual({ data: { indexed: 178, blogPosts: 12 } });

    expect(searchService.reindexAll).toHaveBeenCalledTimes(1);
    expect(blogSearchService.reindexAll).toHaveBeenCalledTimes(1);
  });

  it('runs the two passes one after the other, never at once', async () => {
    // Same reason as `npm run search:reindex`: two full passes at once only
    // compete for one small engine.
    await build().reindex();

    expect(calls).toEqual(['products:start', 'products:end', 'blog:start']);
  });
});
