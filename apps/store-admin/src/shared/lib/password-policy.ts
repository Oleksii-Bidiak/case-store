/**
 * Password strength policy — the admin panel's mirror of the API rule in
 * `apps/store-api/src/common/validators/password-policy.decorator.ts`. Keep the
 * regexes and the minimum length in sync with the backend.
 *
 * ── Why this file exists (TASK-465) ──────────────────────────────────────────
 * Three screens carried their own byte-identical copy of
 * `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/` — `CreateUserDialog`,
 * `UserPasswordResetDialog` and `AdminPasswordChangeForm`. Copying the rule was
 * not the bug; writing it in ASCII was. The API matches Unicode letter classes
 * (`\p{Ll}` / `\p{Lu}`), so `Пароль123` is a password the server accepts and
 * the admin panel refused — with a message that never mentions Latin letters,
 * so nobody could tell why. An operator who thinks in Cyrillic hits a wall the
 * copy does not explain.
 *
 * ── Two policies, one minimum (owner decision, 2026-09-10 / TASK-407) ─────────
 *   - CUSTOMER (storefront registration, reset, self-service change): 8+ chars,
 *     at least one LOWERCASE letter and one digit. No uppercase requirement.
 *   - STAFF (accounts created here, and any password an ADMIN/MANAGER sets):
 *     the strict rule. These accounts can edit the catalogue, read every order
 *     and create other staff.
 *
 * All three admin screens want STAFF, and `POST /api/auth/password/change`
 * agrees: its DTO validates with the customer policy because the body carries no
 * role, and `AuthService.changePassword` applies the staff rule on top once it
 * has loaded the user and can see an ADMIN/MANAGER.
 *
 * ── No zod here, on purpose ──────────────────────────────────────────────────
 * `apps/store-admin/package.json` declares neither `zod` nor `react-hook-form`;
 * the files that import them resolve them through workspace hoisting from
 * store-client. All three call sites do a plain `.test()`, so exporting the
 * constants and a predicate keeps this module free of an undeclared dependency.
 * (The storefront's equivalent, `store-client/src/shared/lib/password-policy.ts`,
 * does export zod schemas — it declares zod.)
 */

/** Minimum length for any password a user SETS (never checked on login). */
export const PASSWORD_MIN_LENGTH = 8;

/** Shopper accounts: at least one lowercase letter and one digit. */
export const CUSTOMER_PASSWORD_REGEX = /^(?=.*\p{Ll})(?=.*\d).*$/u;

/** Staff accounts: lowercase + UPPERCASE + digit. */
export const STAFF_PASSWORD_REGEX = /^(?=.*\p{Ll})(?=.*\p{Lu})(?=.*\d).*$/u;

/**
 * Whether `value` satisfies the STAFF policy.
 *
 * The length check is separate on purpose: unlike the ASCII regexes this
 * replaces, the backend's patterns carry no `{8,}` — they only assert the
 * character classes. Folding the two together here is what keeps the 8-character
 * floor from quietly disappearing along with the ASCII bug.
 */
export function isStaffPassword(value: string): boolean {
  return (
    value.length >= PASSWORD_MIN_LENGTH && STAFF_PASSWORD_REGEX.test(value)
  );
}

/** Whether `value` satisfies the CUSTOMER policy. Same length rule as above. */
export function isCustomerPassword(value: string): boolean {
  return (
    value.length >= PASSWORD_MIN_LENGTH && CUSTOMER_PASSWORD_REGEX.test(value)
  );
}
