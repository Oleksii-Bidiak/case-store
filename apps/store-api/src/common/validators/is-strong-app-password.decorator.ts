import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MinLength } from 'class-validator';

/**
 * Application-wide password strength policy (TASK-227).
 *
 * Baseline: at least 8 characters with at least one lowercase letter, one
 * uppercase letter and one digit. Special characters are welcome but NOT
 * required (UA-friendly baseline). Letter classes are Unicode-aware
 * (`\p{Ll}` / `\p{Lu}`) so Cyrillic passwords like `Пароль123` satisfy the
 * policy — requiring Latin-only letters would silently reject them.
 *
 * IMPORTANT: this policy applies to endpoints that SET a password
 * (registration, future change-password). It must never be applied to login —
 * existing accounts may predate the policy.
 *
 * The storefront mirrors this exact regex in
 * `apps/store-client/src/shared/lib/password-policy.ts` — keep them in sync.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_POLICY_REGEX = /^(?=.*\p{Ll})(?=.*\p{Lu})(?=.*\d).*$/u;

export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;

export const PASSWORD_POLICY_MESSAGE =
  'Password must contain at least one lowercase letter, one uppercase letter and one digit';

/** Human-readable policy summary for OpenAPI (`@ApiProperty`) descriptions. */
export const PASSWORD_POLICY_DESCRIPTION =
  `minimum ${PASSWORD_MIN_LENGTH} characters, ` +
  'at least one lowercase letter, one uppercase letter and one digit';

/**
 * Composite property decorator enforcing the application password policy.
 * Single source of truth — use this on every DTO field where a user sets a
 * new password instead of ad-hoc `@MinLength`/`@Matches` combinations.
 */
export function IsStrongAppPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE }),
    Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE }),
  );
}
