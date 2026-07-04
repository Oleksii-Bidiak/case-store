import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Application password strength policy (TASK-227) — the storefront mirror of
 * the API rule in
 * `apps/store-api/src/common/validators/is-strong-app-password.decorator.ts`.
 * Keep the regex and minimum length in sync with the backend.
 *
 * Baseline: at least 8 characters with at least one lowercase letter, one
 * uppercase letter and one digit. Special characters are allowed but NOT
 * required. Letter classes are Unicode-aware (`\p{Ll}` / `\p{Lu}`) so
 * Cyrillic passwords like `Пароль123` pass.
 *
 * Applies only where a user SETS a password (registration, future password
 * change) — never to the login form, since existing accounts may predate the
 * policy.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_POLICY_REGEX = /^(?=.*\p{Ll})(?=.*\p{Lu})(?=.*\d).*$/u;

/** zod schema for a NEW password — reuse in every password-setting form. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, dict.auth.register.validationPassword)
  .regex(PASSWORD_POLICY_REGEX, dict.auth.register.validationPasswordPolicy);
