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

/**
 * The two JWT signing secrets must be DIFFERENT: an access token would otherwise
 * verify as a refresh token (and vice versa), so a leaked short-lived access
 * token could be replayed against `POST /api/auth/refresh` to mint new sessions.
 * `.env.production.example` already demands distinct values — validation now
 * enforces it at boot.
 */
describe('validateEnv — JWT secrets must differ', () => {
  const secret = 'a'.repeat(32);

  const config = (overrides: Record<string, unknown> = {}) => ({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: secret,
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    ...overrides,
  });

  it('accepts distinct JWT secrets', () => {
    expect(() => validateEnv(config())).not.toThrow();
  });

  it('rejects identical JWT_SECRET and JWT_REFRESH_SECRET', () => {
    expect(() => validateEnv(config({ JWT_REFRESH_SECRET: secret }))).toThrow(
      /JWT_SECRET and JWT_REFRESH_SECRET must be different/i,
    );
  });
});

/**
 * CSRF_SECRET is the HMAC key signing the double-submit token. It stays optional
 * in development (CsrfService falls back to a weak built-in secret) but is
 * REQUIRED — and at least 32 characters — in production, where a known signing
 * key lets an attacker forge a valid CSRF token.
 */
describe('validateEnv — CSRF_SECRET is required in production', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  };

  it('boots in development without CSRF_SECRET', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
  });

  it('fails fast in production when CSRF_SECRET is missing', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/CSRF_SECRET/i);
  });

  it('fails fast in production when CSRF_SECRET is too short', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', CSRF_SECRET: 'short' })).toThrow(
      /CSRF_SECRET/i,
    );
  });

  it('accepts a 32+ character CSRF_SECRET in production', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', CSRF_SECRET: 'c'.repeat(32) }),
    ).not.toThrow();
  });

  it('still rejects a too-short CSRF_SECRET outside production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development', CSRF_SECRET: 'short' })).toThrow(
      /CSRF_SECRET/i,
    );
  });
});
