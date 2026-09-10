import { z } from "zod";
import { dict } from "@/shared/config";

/**
 * Password strength policy — the storefront mirror of the API rule in
 * `apps/store-api/src/common/validators/password-policy.decorator.ts`. Keep the
 * regexes and the minimum length in sync with the backend.
 *
 * ── Two policies, one minimum (owner decision, 2026-09-10 / TASK-407) ─────────
 * There used to be one rule for everybody: 8+ characters with a lowercase, an
 * UPPERCASE and a digit. The live demo run watched shoppers fail registration on
 * the uppercase requirement and give up, which is a real cost paid for very
 * little security — length is what matters, and a shopper account holds an
 * address and an order history, not the shop.
 *
 *   - CUSTOMER (registration, password reset, self-service change): 8+ chars,
 *     at least one letter and one digit. No uppercase requirement.
 *   - STAFF (accounts created in the admin panel, and any password an
 *     ADMIN/MANAGER sets): the strict rule, unchanged. These accounts can edit
 *     the catalogue, read every order and create other staff.
 *
 * Letter classes stay Unicode-aware (`\p{Ll}` / `\p{Lu}`) so Cyrillic passwords
 * like `пароль123` pass — requiring Latin-only letters would silently reject
 * them.
 *
 * Applies only where a user SETS a password — never to the login form, since
 * existing accounts may predate any of this.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Shopper accounts: at least one lowercase letter and one digit. */
export const CUSTOMER_PASSWORD_REGEX = /^(?=.*\p{Ll})(?=.*\d).*$/u;

/** Staff accounts: lowercase + UPPERCASE + digit. */
export const STAFF_PASSWORD_REGEX = /^(?=.*\p{Ll})(?=.*\p{Lu})(?=.*\d).*$/u;

/**
 * zod schema for a NEW shopper password — the one to reach for in the
 * storefront's registration / reset / change forms.
 */
export const customerPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, dict.auth.register.validationPassword)
  .regex(CUSTOMER_PASSWORD_REGEX, dict.auth.register.validationPasswordPolicy);

/**
 * zod schema for a NEW staff password.
 *
 * The storefront has no staff-provisioning screen, so nothing here renders it
 * today — but `POST /api/auth/password/change` is shared with the admin panel
 * and rejects a weak password from an ADMIN/MANAGER server-side. Keeping the
 * mirror here is what lets a future storefront screen state the same rule
 * instead of inventing a third copy of it.
 */
export const staffPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, dict.auth.register.validationPassword)
  .regex(
    STAFF_PASSWORD_REGEX,
    dict.auth.register.validationPasswordPolicyStaff,
  );
