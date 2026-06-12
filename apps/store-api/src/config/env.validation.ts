import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

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
