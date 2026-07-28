import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';
import { IsOriginList } from '../common/validators/is-origin-list.decorator';

/**
 * An exact origin: scheme + host + optional port. No path, no trailing slash —
 * these values are concatenated with a path (`${origin}/login?…`), so one stray
 * slash produces `//login`, and a path prefix produces a URL nobody serves.
 */
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;

/**
 * Supported runtime environments.
 */
export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Schema for required and optional environment variables.
 *
 * Security-critical secrets (JWT_SECRET, JWT_REFRESH_SECRET) are REQUIRED
 * and must be at least 32 characters — the app must never fall back to a
 * default secret, since a known signing key allows token forgery.
 *
 * Validation runs once at startup via ConfigModule's `validate` hook, so a
 * misconfigured deployment fails fast instead of booting with insecure defaults.
 */
export class EnvironmentVariables {
  @IsEnum(Environment, {
    message: `NODE_ENV must be one of: ${Object.values(Environment).join(', ')}`,
  })
  NODE_ENV!: Environment;

  @IsOptional()
  @IsInt()
  PORT?: number;

  @IsString()
  @MinLength(1, { message: 'DATABASE_URL is required' })
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters' })
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRATION?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRATION?: string;

  // How long a password-reset link stays usable. Optional — defaults to 1h in
  // AuthService.
  @IsOptional()
  @IsString()
  PASSWORD_RESET_TOKEN_EXPIRATION?: string;

  // REQUIRED in production, and its format is checked. Previously optional and
  // unvalidated, which failed in the worst possible way: main.ts falls back to
  // `http://localhost:3000` when it is unset, and a typo'd entry (trailing slash,
  // missing scheme) simply never matches the browser's Origin header. Either way
  // the API boots and reports itself healthy, while every request from the real
  // storefront dies in the customer's browser with an opaque CORS error. Fail at
  // start-up instead, where the cause is written on the tin.
  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.NODE_ENV === Environment.Production || env.CORS_ORIGINS !== undefined,
  )
  @IsOriginList()
  CORS_ORIGINS?: string;

  // ─── Storefront origin (TASK-324) ─────────────────────────────────────────
  // Where the API sends a person back to: the Google-OAuth callback redirect and
  // the "reset your password" link in the email.
  //
  // REQUIRED in production. It used to be read with a `http://localhost:3000`
  // default and set by nothing — not by compose, not by the example env file —
  // so in production both journeys pointed at a machine that does not exist,
  // and the API booted, passed its health check and reported itself perfectly
  // fine. A default is exactly what makes this class of bug invisible: there is
  // no error to see. Failing at startup is the only way it surfaces at all.
  //
  // Compose sets it from NEXT_PUBLIC_APP_URL rather than as a variable of its
  // own: it is the same storefront origin, and two independent variables for one
  // origin drift apart with certainty.
  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.NODE_ENV === Environment.Production || env.STORE_CLIENT_URL !== undefined,
  )
  @IsString({ message: 'STORE_CLIENT_URL is required in production' })
  @Matches(ORIGIN, {
    message:
      'STORE_CLIENT_URL must be an exact origin — scheme + host + optional port, ' +
      'no path and no trailing slash. e.g. "https://shop.example.com"',
  })
  STORE_CLIENT_URL?: string;

  // ─── ISR revalidation (TASK-187) ──────────────────────────────────────────
  // The shared secret and the storefront endpoint RevalidationNotifier POSTs to
  // after published content changes. Both optional: when either is absent the
  // notifier is a silent no-op, which is what dev and CI want. In production
  // both are set by docker-compose.prod.yml — and were not, until TASK-324,
  // which is why on-demand revalidation was dead there.
  @IsOptional()
  @IsString()
  REVALIDATE_SECRET?: string;

  @IsOptional()
  @IsString()
  STOREFRONT_REVALIDATE_URL?: string;

  // ─── Umami CSP origin (TASK-261) ──────────────────────────────────────────
  // Optional. When set, Helmet's CSP allows the Umami script/connect origin.
  // Declared here so the invariant holds with no exceptions: everything
  // docker-compose.prod.yml hands to store-api is described in this class, and
  // `scripts/env-check.js` enforces that.
  @IsOptional()
  @IsString()
  UMAMI_ORIGIN?: string;

  // Rate limit for the locked-account owner notice (TASK-287): the minimum gap,
  // in hours, between two such emails to the same address no matter how often the
  // login is retried. Optional — defaults to 24h in AuthService.
  @IsOptional()
  @IsInt()
  @Min(1)
  ACCOUNT_LOCKED_NOTICE_WINDOW_HOURS?: number;

  // ─── Mail (transactional email) ───────────────────────────────────────────
  // All optional: the app boots without SMTP credentials. When MAIL_ENABLED is
  // not "true", MailService is a no-op and never reads the SMTP_* vars.

  @IsOptional()
  @IsString()
  MAIL_ENABLED?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsInt()
  SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  SMTP_SECURE?: string;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASS?: string;

  @IsOptional()
  @IsString()
  MAIL_FROM?: string;

  // ─── Outbound-mail queue + scheduled publishing ────────────────────────────
  // All optional tuning knobs with defaults in their services. They are declared
  // here anyway, because "read through ConfigService but declared nowhere" is the
  // exact shape of the STORE_CLIENT_URL bug: a value with a default is a value
  // that keeps its default silently. Declaring them also means a garbled number
  // (MAIL_OUTBOX_BATCH_SIZE=ten) fails at startup instead of turning into NaN
  // and stalling the queue with no error at all.

  @IsOptional()
  @IsString()
  MAIL_OUTBOX_CRON?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  MAIL_OUTBOX_BATCH_SIZE?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  MAIL_OUTBOX_BACKOFF_BASE_MS?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  MAIL_OUTBOX_BACKOFF_MAX_MS?: number;

  @IsOptional()
  @IsString()
  PUBLISHING_CRON?: string;

  // ─── Redis / Cache ──────────────────────────────────────────────────────────
  // All optional: when REDIS_HOST is absent the cache falls back to an in-memory
  // store, so the app boots and serves requests without a Redis dependency.

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @IsInt()
  REDIS_PORT?: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsInt()
  REDIS_CACHE_TTL_SECONDS?: number;

  // ─── CSRF ─────────────────────────────────────────────────────────────────
  // The HMAC key that signs the double-submit CSRF token.
  //
  // REQUIRED in production (and at least 32 characters): the development
  // fallback secret is committed to this repository, so booting production with
  // it would let anyone forge a valid CSRF token. Startup therefore fails here
  // instead of degrading silently — CsrfService throws on the same condition.
  // Outside production it stays optional (the fallback applies), but a value
  // that IS set must still meet the length floor.

  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.NODE_ENV === Environment.Production || env.CSRF_SECRET !== undefined,
  )
  @IsString({ message: 'CSRF_SECRET is required in production' })
  @MinLength(32, { message: 'CSRF_SECRET must be at least 32 characters' })
  CSRF_SECRET?: string;

  // ─── Logging ──────────────────────────────────────────────────────────────
  // Optional Pino log-level override. Accepted values (pino levels):
  // `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`.
  // When unset the level defaults to `debug` in development and `info` in
  // production, so operators can quieten or widen logs (e.g. LOG_LEVEL=warn in
  // production) without a NODE_ENV or code change. Not validated against the
  // enum so a future custom level is not rejected at startup.

  @IsOptional()
  @IsString()
  LOG_LEVEL?: string;

  // ─── File storage (product images) ──────────────────────────────────────────
  // Iteration 1 (TASK-073) stores uploaded images on the local filesystem and
  // serves them statically. Neither var is a secret and the defaults work for
  // local development with no `.env` changes.
  //
  // UPLOAD_DEST: root directory for uploads (relative to CWD or absolute).
  //   Default `./uploads`; files land in `<UPLOAD_DEST>/products/`.
  // PUBLIC_BASE_URL: public origin of this API, used to build absolute image
  //   URLs (`<PUBLIC_BASE_URL>/uploads/products/<file>`). Default
  //   `http://localhost:3001`. In production set it to the API's public origin
  //   (or, after TASK-074, the CDN base URL).

  @IsOptional()
  @IsString()
  UPLOAD_DEST?: string;

  @IsOptional()
  @IsString()
  PUBLIC_BASE_URL?: string;

  // ─── Refresh-token cleanup (TASK-102) ───────────────────────────────────────
  // Scheduled purge of expired/revoked RefreshToken rows. Both optional with
  // safe defaults so the app boots without any extra configuration.
  //
  // REFRESH_TOKEN_CLEANUP_CRON: standard 5-field cron expression controlling
  //   when the purge runs. Default `0 3 * * *` (daily at 03:00 server time).
  // REFRESH_TOKEN_REVOKED_RETENTION_DAYS: days to retain revoked rows before
  //   purge (audit grace window). Default 0 = purge revoked rows immediately.

  @IsOptional()
  @IsString()
  REFRESH_TOKEN_CLEANUP_CRON?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  REFRESH_TOKEN_REVOKED_RETENTION_DAYS?: number;

  // ─── Nova Poshta delivery (TASK-080) ────────────────────────────────────────
  // Both optional: the app boots without NP credentials. When NP_API_KEY is
  // absent the delivery endpoints return 503 and checkout falls back to
  // free-text city/address entry.
  //
  // NP_API_KEY: API key from the Nova Poshta business cabinet (server-side only).
  // NP_SENDER_CITY_REF: bootstrap fallback for the dispatch-origin city (NP city
  //   UUID) used in the cost estimate. The source of truth becomes the
  //   admin-editable DeliverySetting (TASK-080-E); until set this seeds the
  //   origin, defaulting to Kyiv when unset.

  @IsOptional()
  @IsString()
  NP_API_KEY?: string;

  @IsOptional()
  @IsString()
  NP_SENDER_CITY_REF?: string;

  // NP_ALLOW_KEYLESS: dev/staging escape hatch (TASK-337). Verified live on
  // 2026-07-28 that every NP method this project calls answers with an EMPTY
  // apiKey, so a stand can exercise the real API before the client issues a key.
  // Undocumented behaviour NP could withdraw at any time, and certainly rate
  // limited — production fails loudly on a missing key instead.
  @IsOptional()
  @IsString()
  NP_ALLOW_KEYLESS?: string;

  // ─── Online payments — LiqPay (TASK-330) ────────────────────────────────────
  // All optional: with no keys the app boots and online payment is simply
  // unavailable (checkout offers cash on delivery only). Both keys come from the
  // merchant cabinet, which belongs to the shop owner, not the developer.
  //
  // LIQPAY_PRIVATE_KEY is the signing secret. It never leaves the server and must
  // never be exposed as a NEXT_PUBLIC_* build arg.
  //
  // LIQPAY_SANDBOX must be false in production. Sandbox mode makes LiqPay report
  // status "sandbox", which the adapter maps to a successful payment — left on in
  // production, anyone who learns the public key could mark orders paid.

  @IsOptional()
  @IsString()
  LIQPAY_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  LIQPAY_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  LIQPAY_SANDBOX?: string;

  // Comma-separated LiqPay `paytypes`. `payparts` / `moment_part` (ПриватБанк
  // instalments) require a separate agreement with the bank — listing them
  // without one shows a button that fails.
  @IsOptional()
  @IsString()
  LIQPAY_PAYTYPES?: string;

  // Safety net for callbacks that never arrive: LiqPay does not document its
  // retry behaviour, so without polling a customer can pay while the order stays
  // unpaid forever.
  @IsOptional()
  @IsString()
  PAYMENT_RECONCILE_CRON?: string;

  // ─── Unpaid online orders (owner decision 2026-07-28) ───────────────────────
  // Stock is reserved at order creation, before payment — two shoppers must not
  // both be able to pay for the last unit. Card orders get a deadline on that
  // reservation; cash-on-delivery orders keep theirs indefinitely.
  //
  // Both are settings rather than constants on purpose (TASK-352): the client has
  // not confirmed the window, and the answer must be an env change, not a rewrite
  // of the state machine.

  @IsOptional()
  @IsInt()
  @Min(1)
  ORDER_RESERVATION_TTL_MINUTES?: number;

  @IsOptional()
  @IsString()
  ORDER_AUTOCANCEL_UNPAID?: string;

  // How long a guest's order-status link stays valid (TASK-338) — the only way a
  // guest reaches their own order once the cart cookie is gone.
  @IsOptional()
  @IsInt()
  @Min(1)
  GUEST_ORDER_TOKEN_TTL_DAYS?: number;

  // ─── Admin 2FA (TASK-344) ───────────────────────────────────────────────────
  // Encrypts TOTP secrets at rest (AES-256-GCM). Required only once 2FA is
  // enabled. Losing it locks every enrolled admin out — the secrets cannot be
  // re-derived, only backup codes remain.
  @IsOptional()
  @IsString()
  @MinLength(32)
  TOTP_ENCRYPTION_KEY?: string;

  // How long an email-verification link stays usable (TASK-342). Optional —
  // EmailVerificationService has a default. Declared here for the same reason as
  // the mail-outbox knobs: "read through ConfigService but declared nowhere" is
  // the exact shape of the STORE_CLIENT_URL bug, and a garbled value would
  // otherwise become NaN at runtime instead of failing at boot.
  @IsOptional()
  @IsString()
  EMAIL_VERIFICATION_TOKEN_EXPIRATION?: string;

  // How long the RBAC guard caches a role's effective permissions (TASK-334).
  // Optional; PermissionService defaults it. This is the knob that decides how
  // long a revoked permission can still be honoured, so it is worth being able to
  // set — and worth failing at boot rather than silently becoming NaN.
  @IsOptional()
  @IsInt()
  @Min(0)
  RBAC_PERMISSION_CACHE_TTL_SECONDS?: number;

  // ─── Meilisearch full-text search (TASK-075) ────────────────────────────────
  // ALL optional: the app boots without a search engine. When MEILI_HOST /
  // MEILI_MASTER_KEY are absent the search endpoints transparently fall back to
  // the Postgres `contains` scan and index sync is inert.
  //
  // MEILI_HOST: engine base URL (e.g. http://localhost:7700).
  // MEILI_MASTER_KEY: master/admin key — server-side index writes + search.
  // MEILI_SEARCH_KEY: optional public search-only key, reserved for future
  //   browser-side querying (unused by the backend today).

  @IsOptional()
  @IsString()
  MEILI_HOST?: string;

  @IsOptional()
  @IsString()
  MEILI_MASTER_KEY?: string;

  @IsOptional()
  @IsString()
  MEILI_SEARCH_KEY?: string;

  // ─── Sentry error tracking (TASK-048) ───────────────────────────────────────
  // All optional: the app boots without any Sentry config. When SENTRY_DSN is
  // absent, Sentry.init runs with `enabled: false` (see `instrument.ts`) and the
  // whole integration is a no-op — no network calls, no captured events.
  //
  // SENTRY_DSN: project ingest URL from the Sentry dashboard. Presence toggles
  //   the SDK on.
  // SENTRY_ENVIRONMENT: optional environment tag (e.g. production, staging).
  //   Defaults to NODE_ENV when unset.
  // SENTRY_TRACES_SAMPLE_RATE: optional performance-trace sample rate (0..1).
  //   Defaults to 0 (tracing off).

  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  SENTRY_ENVIRONMENT?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  SENTRY_TRACES_SAMPLE_RATE?: number;

  // ─── Google OAuth sign-in (TASK-168) ────────────────────────────────────────
  // All optional: the app boots without Google credentials. When
  // GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are absent, GET /api/auth/google
  // (+ /callback) respond 503 (GoogleAuthGuard) — mirroring the NP_API_KEY
  // graceful-degradation pattern above. No @MinLength: unlike JWT_SECRET these
  // are not signing secrets whose weak length would be a security issue —
  // Google itself enforces the client-secret format.
  //
  // GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET: OAuth client credentials from
  //   Google Cloud Console (APIs & Services → Credentials).
  // GOOGLE_CALLBACK_URL: must EXACTLY match the "Authorized redirect URI"
  //   configured there. Defaults to the local dev callback when unset.

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CALLBACK_URL?: string;
}

/**
 * ConfigModule `validate` callback.
 *
 * Coerces raw env values into the typed schema and validates them.
 * Throws (aborting startup) if any required variable is missing or invalid.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${messages}`);
  }

  // Cross-field rule the decorators cannot express: the access- and
  // refresh-token signing keys MUST differ. With one shared key an access token
  // verifies as a refresh token, so a leaked (long-lived in the browser) access
  // token could be replayed against POST /api/auth/refresh to mint fresh
  // sessions — collapsing the whole point of the split. `.env.production.example`
  // already demands distinct values; this makes it enforceable.
  if (validatedConfig.JWT_SECRET === validatedConfig.JWT_REFRESH_SECRET) {
    throw new Error(
      'Invalid environment configuration: JWT_SECRET and JWT_REFRESH_SECRET must be different values',
    );
  }

  return validatedConfig;
}
