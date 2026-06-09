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
