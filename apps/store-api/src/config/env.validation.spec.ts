import 'reflect-metadata';
import { validateEnv } from './env.validation';

/**
 * Guards TASK-048 acceptance: the Sentry env vars are ALL optional, so the API
 * must boot (validation must pass) with no SENTRY_* configured, and must accept
 * them when present.
 */
describe('validateEnv — Sentry config is optional', () => {
  const baseConfig = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  };

  it('validates successfully with no SENTRY_* variables set', () => {
    expect(() => validateEnv({ ...baseConfig })).not.toThrow();

    const result = validateEnv({ ...baseConfig });
    expect(result.SENTRY_DSN).toBeUndefined();
    expect(result.SENTRY_ENVIRONMENT).toBeUndefined();
    expect(result.SENTRY_TRACES_SAMPLE_RATE).toBeUndefined();
  });

  it('accepts a full valid Sentry configuration', () => {
    const result = validateEnv({
      ...baseConfig,
      SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_TRACES_SAMPLE_RATE: '0.2',
    });

    expect(result.SENTRY_DSN).toBe('https://examplePublicKey@o0.ingest.sentry.io/0');
    expect(result.SENTRY_ENVIRONMENT).toBe('production');
    expect(result.SENTRY_TRACES_SAMPLE_RATE).toBe(0.2);
  });

  it('rejects a traces sample rate outside the 0..1 range', () => {
    expect(() => validateEnv({ ...baseConfig, SENTRY_TRACES_SAMPLE_RATE: '5' })).toThrow(
      /environment configuration/i,
    );
  });
});
