/**
 * E2E test environment setup.
 *
 * Runs before any test module is imported (via `setupFiles` in jest-e2e.json),
 * so these values are present in `process.env` before `AppModule`'s
 * `ConfigModule.forRoot({ validate })` executes. `dotenv` does not override
 * already-set variables, so these take precedence over the local `.env`.
 *
 * The e2e suites mock the repository/Prisma layer, so these secrets are never
 * used to talk to a real database — they only need to satisfy env validation.
 *
 * `NODE_ENV=test` is also what keeps the Pino transport off (see
 * `src/config/pino.config.ts`): a transport is a worker thread that `app.close()`
 * does not end, so with one app booted per spec file the threads pile up.
 * Overriding NODE_ENV here brings them back.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

// No background cron jobs in e2e (TASK-381). The suites boot a REAL application
// and replace PrismaService with a mock — but the workers are real and tick on a
// schedule, the catalogue import every ten seconds. A tick landing mid-run calls
// into a mock that has no `catalogImportRun` and throws
// `Cannot read properties of undefined (reading 'findFirst')` inside whichever
// test happened to be executing, failing a random unrelated suite while the next
// run comes back green.
//
// Nothing is lost: every worker exposes `tick()` publicly precisely so its
// behaviour is tested directly rather than by waiting for a timer.
process.env.SCHEDULER_ENABLED = 'false';

process.env.JWT_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';

// Force the in-memory ThrottlerModule store for EVERY e2e worker. Without this,
// each suite's AppModule reads REDIS_HOST from the local `.env` and connects to
// the real Redis, so all suites would share a single rate-limit counter keyed by
// the test client IP (127.0.0.1): their combined auth logins blow the 5-req/60s
// login limit and unrelated suites (auth, cart-guest, wishlist-guest merge) start
// getting spurious 429s. An empty string is still "set", so dotenv won't override
// it — every app gets its own in-memory throttler, fully isolated. The dedicated
// rate-limit assertion in security.e2e still exercises the real ThrottlerGuard
// (in-memory enforces the limit identically).
//
// This isolation is what lets the suites run in parallel workers at all — see
// `maxWorkers: 2` in `jest-e2e.json` (TASK-296). Serial execution used to be the
// workaround for the shared-Redis 429s; it is no longer needed, and it was in
// fact the cause of the native abort: `maxWorkers: 1` makes Jest run every spec
// in-band, so all 22 AppModule boots accumulated in ONE process (~950 MB RSS by
// the last file) until it aborted natively at a random point (Windows exit
// 3221226505 / 0xC0000409, no test reported as failed). Two workers keep each
// process to ~11 boots, and `workerIdleMemoryLimit` recycles one that still
// grows too large. Do not lower this back to 1.
process.env.REDIS_HOST = '';
