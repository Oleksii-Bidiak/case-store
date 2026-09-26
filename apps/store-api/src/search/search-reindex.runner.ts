import { BLOG_POSTS_INDEX, PRODUCTS_INDEX, type MeiliClient } from './meili.client';
import { PRODUCTS_INDEX_SETTINGS, type SearchService } from './search.service';
import { BLOG_POSTS_INDEX_SETTINGS, type BlogSearchService } from './blog-search.service';

/** How many times the applied settings are read back before giving up. */
const SETTINGS_READBACK_ATTEMPTS = 20;
/** Pause between two settings read-backs (20 × 500 ms ≈ 10 s of engine queue). */
const SETTINGS_READBACK_DELAY_MS = 500;

/** What the runner needs — narrow, so the spec drives it without an engine. */
export interface SearchReindexDeps {
  meili: Pick<
    MeiliClient,
    'isConfigured' | 'health' | 'getSearchableAttributes' | 'listDocumentIds'
  >;
  products: Pick<SearchService, 'reindexAll'>;
  blog: Pick<BlogSearchService, 'reindexAll'>;
  /** Injectable so the spec does not wait out the read-back delay. */
  sleep?: (ms: number) => Promise<void>;
}

/** One verified index: how many documents the reindex confirmed and the index holds. */
export interface IndexReport {
  index: string;
  indexed: number;
  documents: number;
}

/** Thrown with every problem found, so the operator sees all of them at once. */
export class SearchReindexError extends Error {
  constructor(readonly problems: string[]) {
    super(`Search reindex did not verify:\n  - ${problems.join('\n  - ')}`);
    this.name = 'SearchReindexError';
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * Rebuild BOTH search indexes (products and blog) and prove the result
 * (TASK-522). This is what `npm run search:reindex` runs; the entry point
 * (`src/scripts/search-reindex.ts`) only boots the app and prints.
 *
 * Why a script at all, when the API reindexes on every boot: a settings change —
 * `sku` joining the searchable attributes — is only real once the engine has
 * applied it AND every document carries the new field. The boot path is
 * fire-and-forget and swallows every failure (`ensureIndex` does not even wait
 * for its settings task), so "the container restarted" proves nothing. This
 * runner checks, per index:
 *
 *  - the engine's APPLIED searchable attributes equal the configured ones (read
 *    back, retried while the settings task may still be queued);
 *  - the index holds exactly as many documents as the reindex confirmed —
 *    fewer means rejected batches, more means the prune could not run.
 *
 * Both indexes are rebuilt before anything is judged, so one broken index is
 * never a reason to leave the other stale. Any failure throws a
 * {@link SearchReindexError} listing every problem.
 */
export async function runSearchReindex(deps: SearchReindexDeps): Promise<IndexReport[]> {
  const { meili } = deps;
  const sleep = deps.sleep ?? defaultSleep;

  if (!meili.isConfigured()) {
    throw new SearchReindexError([
      'Meilisearch is not configured (MEILI_HOST / MEILI_MASTER_KEY are unset) — ' +
        'search runs on the Postgres fallback and there is no index to rebuild',
    ]);
  }
  if (!(await meili.health())) {
    throw new SearchReindexError([
      'Meilisearch is not reachable (health check failed) — start the engine and rerun',
    ]);
  }

  // Sequential on purpose: two full passes at once would only compete for the
  // same small engine.
  const productsIndexed = await deps.products.reindexAll();
  const postsIndexed = await deps.blog.reindexAll();

  const targets = [
    {
      index: PRODUCTS_INDEX,
      expected: PRODUCTS_INDEX_SETTINGS.searchableAttributes,
      indexed: productsIndexed,
    },
    {
      index: BLOG_POSTS_INDEX,
      expected: BLOG_POSTS_INDEX_SETTINGS.searchableAttributes,
      indexed: postsIndexed,
    },
  ];

  const problems: string[] = [];
  const report: IndexReport[] = [];
  for (const target of targets) {
    let applied: string[] | null = null;
    for (let attempt = 1; attempt <= SETTINGS_READBACK_ATTEMPTS; attempt++) {
      applied = await meili.getSearchableAttributes(target.index);
      if (applied && sameList(applied, target.expected)) break;
      if (attempt < SETTINGS_READBACK_ATTEMPTS) await sleep(SETTINGS_READBACK_DELAY_MS);
    }
    if (!applied || !sameList(applied, target.expected)) {
      problems.push(
        `${target.index}: the engine's searchable attributes are ` +
          `${applied ? `[${applied.join(', ')}]` : 'unreadable'}, ` +
          `expected [${target.expected.join(', ')}] — the settings update was not applied`,
      );
    }

    const documentIds = await meili.listDocumentIds(target.index);
    if (documentIds === null) {
      problems.push(`${target.index}: could not read the index contents back`);
      continue;
    }
    if (documentIds.size !== target.indexed) {
      problems.push(
        `${target.index}: the index holds ${documentIds.size} documents but the reindex ` +
          `confirmed ${target.indexed} — some batches were rejected or the prune was skipped ` +
          '(see the API log); rerun once, then investigate',
      );
    }
    report.push({ index: target.index, indexed: target.indexed, documents: documentIds.size });
  }

  if (problems.length > 0) throw new SearchReindexError(problems);
  return report;
}
