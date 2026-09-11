import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MinLength } from 'class-validator';

/**
 * Application password strength policy (TASK-227), split in two by owner
 * decision on 2026-09-10 (TASK-407).
 *
 * ── Why two ───────────────────────────────────────────────────────────────────
 * One rule used to cover everybody: 8+ characters with a lowercase letter, an
 * UPPERCASE letter and a digit. The live demo run watched shoppers fail
 * registration on the uppercase requirement and abandon the form — a real cost
 * for very little security. What a shopper account protects is an address and an
 * order history; what a staff account protects is the catalogue, every order in
 * the shop and the ability to create more staff. The two are not the same risk,
 * so they no longer share one rule:
 *
 *   - {@link IsCustomerPassword} — 8+ chars, at least one lowercase letter and
 *     one digit. Registration, password reset, self-service change. Lowercase
 *     specifically, not "a letter": `PAROLE123` is rejected, and every message
 *     and hint that states this rule has to say so.
 *   - {@link IsStaffPassword} — the original strict rule. `POST /api/users` and
 *     the owner's reset of an employee's password.
 *
 * Letter classes are Unicode-aware (`\p{Ll}` / `\p{Lu}`) in both, so Cyrillic
 * passwords like `Пароль123` satisfy them — requiring Latin-only letters would
 * silently reject a Ukrainian shopper's password.
 *
 * ── The one endpoint that cannot decide from its DTO ──────────────────────────
 * `POST /api/auth/password/change` serves the storefront AND the admin panel,
 * and its body carries no role. It therefore validates with the CUSTOMER policy
 * here, and `AuthService.changePassword` applies {@link STAFF_PASSWORD_REGEX} on
 * top once it has loaded the user and can see an ADMIN/MANAGER. A DTO cannot
 * know who is calling; the service can.
 *
 * IMPORTANT: neither policy may ever be applied to login — existing accounts
 * predate all of it.
 *
 * The storefront mirrors both regexes in
 * `apps/store-client/src/shared/lib/password-policy.ts` — keep them in sync.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Shopper accounts: at least one lowercase letter and one digit. */
export const CUSTOMER_PASSWORD_REGEX = /^(?=.*\p{Ll})(?=.*\d).*$/u;

/** Staff accounts: lowercase + UPPERCASE + digit. */
export const STAFF_PASSWORD_REGEX = /^(?=.*\p{Ll})(?=.*\p{Lu})(?=.*\d).*$/u;

export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;

// Says "lowercase" because CUSTOMER_PASSWORD_REGEX means it: `PAROLE123` has a
// letter and a digit and is still rejected. A message that describes a laxer
// rule than the one being enforced reads as a bug in the form.
export const CUSTOMER_PASSWORD_MESSAGE =
  'Password must contain at least one lowercase letter and one digit';

export const STAFF_PASSWORD_MESSAGE =
  'Password must contain at least one lowercase letter, one uppercase letter and one digit';

/** Human-readable policy summaries for OpenAPI (`@ApiProperty`) descriptions. */
export const CUSTOMER_PASSWORD_DESCRIPTION =
  `minimum ${PASSWORD_MIN_LENGTH} characters, ` + 'at least one lowercase letter and one digit';

export const STAFF_PASSWORD_DESCRIPTION =
  `minimum ${PASSWORD_MIN_LENGTH} characters, ` +
  'at least one lowercase letter, one uppercase letter and one digit';

/**
 * Composite property decorator for a password a SHOPPER sets on their own
 * account. Use it on every such DTO field instead of ad-hoc
 * `@MinLength`/`@Matches` combinations.
 */
export function IsCustomerPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE }),
    Matches(CUSTOMER_PASSWORD_REGEX, { message: CUSTOMER_PASSWORD_MESSAGE }),
  );
}

/**
 * Composite property decorator for a password on a STAFF account — one that can
 * reach the admin panel.
 */
export function IsStaffPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, { message: PASSWORD_MIN_LENGTH_MESSAGE }),
    Matches(STAFF_PASSWORD_REGEX, { message: STAFF_PASSWORD_MESSAGE }),
  );
}
