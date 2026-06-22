import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength, validateSync } from 'class-validator';

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

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

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
  // Optional so the app boots in development with a weak built-in default.
  // REQUIRED in production: bootstrap() logs a warning when NODE_ENV is
  // production and this is unset. When set it must be at least 32 characters —
  // the secret is the HMAC key that signs the double-submit CSRF token.

  @IsOptional()
  @IsString()
  @MinLength(32, { message: 'CSRF_SECRET must be at least 32 characters when set' })
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

  return validatedConfig;
}
