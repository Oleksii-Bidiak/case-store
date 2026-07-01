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
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET = 'test-access-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test';

// Force the in-memory ThrottlerModule store for EVERY e2e worker. Without this,
// each suite's AppModule reads REDIS_HOST from the local `.env` and connects to
// the real Redis, so all suites share a single rate-limit counter keyed by the
// test client IP (127.0.0.1). Jest runs suites in parallel workers, so their
// combined auth logins blow the 5-req/60s login limit and unrelated suites
// (auth, cart-guest, wishlist-guest merge) start getting spurious 429s. An empty
// string is still "set", so dotenv won't override it — every worker gets its own
// per-app in-memory throttler, fully isolated. The dedicated rate-limit
// assertion in security.e2e still exercises the real ThrottlerGuard (in-memory
// enforces the limit identically).
process.env.REDIS_HOST = '';
