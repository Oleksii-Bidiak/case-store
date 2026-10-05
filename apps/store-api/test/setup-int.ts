/**
 * Integration test environment setup (REAL database).
 *
 * Runs before any module is imported (via `setupFiles` in jest-int.json), so
 * these values are present in `process.env` before `PrismaService` reads
 * `DATABASE_URL`. Unlike the e2e suites (which mock Prisma), integration tests
 * talk to a real Postgres instance.
 *
 * DATABASE_URL is FORCED to an isolated `*_test` database so integration tests
 * can never run against the dev/prod database. Point it elsewhere with
 * `DATABASE_URL_TEST` (e.g. in CI).
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://postgres:postgres@localhost:5432/store_test';

// No real Telegram from integration tests (TASK-675), same guard as setup-e2e.ts:
// a spec that boots the notification providers would otherwise run the start-up
// `getMe` — and the updates poller — against api.telegram.org with whatever
// token a developer left in the local env file. Empty = "unconfigured"; it is
// still "set", so dotenv will not fill it in. Never put a real token here.
process.env.TELEGRAM_BOT_TOKEN = '';
