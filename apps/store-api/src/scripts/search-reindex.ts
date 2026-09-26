/**
 * search-reindex — rebuild the product AND blog search indexes and verify them
 * (TASK-522).
 *
 * WHEN TO RUN IT
 * --------------
 * After a deploy that changes the search index settings (TASK-522 made the
 * article number searchable), after restoring a database backup, or whenever
 * search answers "nothing found" over a catalogue that plainly has the goods.
 * It is safe at any time: the reindex upserts then prunes, so it never empties a
 * working index (TASK-376), and it can run next to the live API.
 *
 * WHY NOT JUST RESTART THE API
 * ----------------------------
 * The API does reindex on boot, but fire-and-forget: every failure is logged and
 * swallowed, so a restart proves nothing. This script waits for the result and
 * checks it (see `runSearchReindex`) — it exits 0 only when the engine has
 * applied the configured searchable attributes and each index holds exactly the
 * documents the reindex confirmed. Anything else exits 1 with the reasons.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *   on the server:
 *     docker compose -f docker-compose.prod.yml exec store-api \
 *       node dist/scripts/search-reindex.js
 *   locally:
 *     npm run search:reindex -w apps/store-api
 *
 * It boots its own copy of the application WITHOUT HTTP and with background
 * scheduling switched off (`SCHEDULER_ENABLED=false`), so this second process
 * never works the mail outbox, payment reconciliation or publishing queues that
 * the live API owns.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MeiliClient } from '../search/meili.client';
import { SearchService } from '../search/search.service';
import { BlogSearchService } from '../search/blog-search.service';
import { runSearchReindex } from '../search/search-reindex.runner';

async function main(): Promise<void> {
  // Must be set before the app boots: every worker reads it in onModuleInit.
  process.env.SCHEDULER_ENABLED = 'false';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const report = await runSearchReindex({
      meili: app.get(MeiliClient),
      products: app.get(SearchService),
      blog: app.get(BlogSearchService),
    });
    for (const { index, documents } of report) {
      console.log(`${index}: ${documents} documents indexed and verified`);
    }
    console.log('Search reindex complete.');
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

// Explicit exit, as in `export-swagger.ts`: the app's Redis clients keep the
// event loop alive after `close()`, and a script that never returns hangs the
// deploy step that ran it.
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
