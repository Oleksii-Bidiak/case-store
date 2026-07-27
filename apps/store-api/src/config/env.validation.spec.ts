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
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        CSRF_SECRET: 'c'.repeat(32),
        CORS_ORIGINS: 'https://shop.example.com',
        STORE_CLIENT_URL: 'https://shop.example.com',
      }),
    ).not.toThrow();
  });

  it('still rejects a too-short CSRF_SECRET outside production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development', CSRF_SECRET: 'short' })).toThrow(
      /CSRF_SECRET/i,
    );
  });
});

describe('validateEnv — CORS_ORIGINS must be a well-formed origin list', () => {
  const prod = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CSRF_SECRET: 'c'.repeat(32),
    STORE_CLIENT_URL: 'https://shop.example.com',
    NODE_ENV: 'production',
  };

  it('boots in development without CORS_ORIGINS', () => {
    expect(() => validateEnv({ ...prod, NODE_ENV: 'development' })).not.toThrow();
  });

  // Unset in production used to fall back to http://localhost:3000 in main.ts —
  // the API booted "healthy" and every request from the real storefront failed in
  // the customer's browser with an opaque CORS error.
  it('fails fast in production when CORS_ORIGINS is missing', () => {
    expect(() => validateEnv(prod)).toThrow(/CORS_ORIGINS/i);
  });

  it('accepts a comma-separated list of exact origins', () => {
    expect(() =>
      validateEnv({
        ...prod,
        CORS_ORIGINS: 'https://shop.example.com,https://admin.shop.example.com',
      }),
    ).not.toThrow();
  });

  it('accepts an origin with an explicit port', () => {
    expect(() => validateEnv({ ...prod, CORS_ORIGINS: 'http://localhost:3000' })).not.toThrow();
  });

  // A browser matches the Origin header byte-for-byte, so a single trailing
  // slash makes the entry match nothing at all — and it does so silently.
  it.each([
    ['a trailing slash', 'https://shop.example.com/'],
    ['a path', 'https://shop.example.com/store'],
    ['a missing scheme', 'shop.example.com'],
    ['an empty list', ''],
    ['one bad entry among good ones', 'https://shop.example.com,https://admin.example.com/'],
  ])('rejects %s', (_label, value) => {
    expect(() => validateEnv({ ...prod, CORS_ORIGINS: value })).toThrow(/CORS_ORIGINS/i);
  });

  it('rejects a malformed value outside production too', () => {
    expect(() =>
      validateEnv({
        ...prod,
        NODE_ENV: 'development',
        CORS_ORIGINS: 'https://shop.example.com/',
      }),
    ).toThrow(/CORS_ORIGINS/i);
  });
});

/**
 * STORE_CLIENT_URL is the storefront origin the API redirects people back to:
 * the Google-OAuth callback, and the "reset your password" link in the email.
 *
 * It was read with a `http://localhost:3000` default and set by NOTHING — not
 * docker-compose.prod.yml, not `.env.production.example`, not this class. In
 * production that meant both journeys pointed at a machine that does not exist,
 * while the API booted, answered /health and looked entirely healthy. A default
 * is what makes that invisible; requiring the value in production is what makes
 * it impossible (TASK-324).
 */
describe('validateEnv — STORE_CLIENT_URL is required in production', () => {
  const base = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CSRF_SECRET: 'c'.repeat(32),
    CORS_ORIGINS: 'https://shop.example.com',
  };

  it('boots in development without STORE_CLIENT_URL', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development' })).not.toThrow();
  });

  it('fails fast in production when STORE_CLIENT_URL is missing', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/STORE_CLIENT_URL/i);
  });

  it('accepts an exact origin in production', () => {
    const result = validateEnv({
      ...base,
      NODE_ENV: 'production',
      STORE_CLIENT_URL: 'https://shop.example.com',
    });
    expect(result.STORE_CLIENT_URL).toBe('https://shop.example.com');
  });

  it('accepts an origin with an explicit port', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'development', STORE_CLIENT_URL: 'http://localhost:3000' }),
    ).not.toThrow();
  });

  // The value is concatenated with a path (`${origin}/login?oauthError=1`), so a
  // trailing slash yields `//login` and a path prefix yields a URL nobody serves.
  it.each([
    ['a trailing slash', 'https://shop.example.com/'],
    ['a path', 'https://shop.example.com/store'],
    ['a missing scheme', 'shop.example.com'],
    ['a comma-separated list', 'https://shop.example.com,https://admin.example.com'],
  ])('rejects %s', (_label, value) => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', STORE_CLIENT_URL: value })).toThrow(
      /STORE_CLIENT_URL/i,
    );
  });

  // Outside production it stays optional, but a value that IS set must be valid —
  // otherwise a typo would only be discovered on the production deploy.
  it('rejects a malformed value outside production too', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'development',
        STORE_CLIENT_URL: 'https://shop.example.com/',
      }),
    ).toThrow(/STORE_CLIENT_URL/i);
  });
});
