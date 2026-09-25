import { BLOG_POSTS_INDEX, PRODUCTS_INDEX } from './meili.client';
import { PRODUCTS_INDEX_SETTINGS } from './search.service';
import { BLOG_POSTS_INDEX_SETTINGS } from './blog-search.service';
import { runSearchReindex, type SearchReindexDeps } from './search-reindex.runner';

/**
 * The reindex script is the deploy step that makes a settings change real
 * (TASK-522 put `sku` into the searchable attributes). Its whole value is that
 * it does not report success it has not checked — so these specs are mostly
 * about the ways it must FAIL.
 */
function ids(count: number, prefix: string): Set<string> {
  return new Set(Array.from({ length: count }, (_, i) => `${prefix}-${i}`));
}

function makeDeps(): SearchReindexDeps & {
  meili: { [K in keyof SearchReindexDeps['meili']]: jest.Mock };
  products: { reindexAll: jest.Mock };
  blog: { reindexAll: jest.Mock };
  sleep: jest.Mock;
} {
  return {
    meili: {
      isConfigured: jest.fn().mockReturnValue(true),
      health: jest.fn().mockResolvedValue(true),
      getSearchableAttributes: jest.fn((uid: string) =>
        Promise.resolve(
          uid === PRODUCTS_INDEX
            ? PRODUCTS_INDEX_SETTINGS.searchableAttributes
            : BLOG_POSTS_INDEX_SETTINGS.searchableAttributes,
        ),
      ),
      listDocumentIds: jest.fn((uid: string) =>
        Promise.resolve(uid === PRODUCTS_INDEX ? ids(40, 'p') : ids(12, 'b')),
      ),
    },
    products: { reindexAll: jest.fn().mockResolvedValue(40) },
    blog: { reindexAll: jest.fn().mockResolvedValue(12) },
    sleep: jest.fn().mockResolvedValue(undefined),
  };
}

describe('runSearchReindex', () => {
  it('rebuilds products AND blog and reports what each index now holds', async () => {
    const deps = makeDeps();

    const report = await runSearchReindex(deps);

    expect(deps.products.reindexAll).toHaveBeenCalledTimes(1);
    expect(deps.blog.reindexAll).toHaveBeenCalledTimes(1);
    expect(report).toEqual([
      { index: PRODUCTS_INDEX, indexed: 40, documents: 40 },
      { index: BLOG_POSTS_INDEX, indexed: 12, documents: 12 },
    ]);
  });

  it('refuses to run without an engine instead of "reindexing" nothing', async () => {
    const deps = makeDeps();
    deps.meili.isConfigured.mockReturnValue(false);

    await expect(runSearchReindex(deps)).rejects.toThrow(/not configured/);
    expect(deps.products.reindexAll).not.toHaveBeenCalled();
  });

  it('refuses to run when the engine does not answer its health check', async () => {
    const deps = makeDeps();
    deps.meili.health.mockResolvedValue(false);

    await expect(runSearchReindex(deps)).rejects.toThrow(/not reachable/);
    expect(deps.products.reindexAll).not.toHaveBeenCalled();
  });

  it('fails when the engine never applied the new searchable attributes', async () => {
    // `ensureIndex` swallows a rejected settings update — without this read-back
    // the script would print success over an index that still cannot see `sku`.
    const deps = makeDeps();
    deps.meili.getSearchableAttributes.mockImplementation((uid: string) =>
      Promise.resolve(
        uid === PRODUCTS_INDEX
          ? ['name', 'description', 'categoryName', 'brandName', 'searchTerms']
          : BLOG_POSTS_INDEX_SETTINGS.searchableAttributes,
      ),
    );

    await expect(runSearchReindex(deps)).rejects.toThrow(/products.*searchable attributes/s);
    // The blog is still rebuilt — one broken index is no reason to skip the other.
    expect(deps.blog.reindexAll).toHaveBeenCalled();
  });

  it('waits for a settings update still in the engine queue', async () => {
    const deps = makeDeps();
    deps.meili.getSearchableAttributes
      .mockResolvedValueOnce(['name', 'description'])
      .mockImplementation((uid: string) =>
        Promise.resolve(
          uid === PRODUCTS_INDEX
            ? PRODUCTS_INDEX_SETTINGS.searchableAttributes
            : BLOG_POSTS_INDEX_SETTINGS.searchableAttributes,
        ),
      );

    await expect(runSearchReindex(deps)).resolves.toHaveLength(2);
    expect(deps.sleep).toHaveBeenCalled();
  });

  it('fails when the index holds a different number of documents than were confirmed', async () => {
    const deps = makeDeps();
    deps.products.reindexAll.mockResolvedValue(38); // two batches rejected

    await expect(runSearchReindex(deps)).rejects.toThrow(/products.*40.*38/s);
  });

  it('fails when the index contents cannot be read back', async () => {
    const deps = makeDeps();
    deps.meili.listDocumentIds.mockImplementation((uid: string) =>
      Promise.resolve(uid === PRODUCTS_INDEX ? ids(40, 'p') : null),
    );

    await expect(runSearchReindex(deps)).rejects.toThrow(/blog_posts.*could not/s);
  });
});
