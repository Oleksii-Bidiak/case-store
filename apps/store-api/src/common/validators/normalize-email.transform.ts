/**
 * The one spelling an email address is stored and looked up in (TASK-772).
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `users.email` is a plain `text` column under a case-SENSITIVE unique index, so
 * to Postgres `A@Gmail.com` and `a@gmail.com` are two rows. Registration kept
 * whatever the shopper typed while Google sign-in brought back its own spelling,
 * so the same person ended up with two accounts — and a password login typed in
 * a different case than the registration answered "invalid credentials".
 *
 * ── Why lowercasing the whole address ─────────────────────────────────────────
 * RFC 5321 allows a case-sensitive local part in theory; no mailbox provider a
 * shopper uses honours it, and every other system that treats one address as one
 * identity (Google included) folds it. The alternative — `citext` or a functional
 * unique index — changes the schema to tolerate two spellings instead of making
 * there be one.
 *
 * Use {@link normalizeEmailAddress} in services for addresses that never went
 * through a DTO (an OAuth profile, a CLI argument); use {@link normalizeEmail}
 * as the `@Transform` on every DTO email field.
 */
export const normalizeEmailAddress = (email: string): string => email.trim().toLowerCase();

/**
 * `class-transformer` transform for DTO email fields — see
 * {@link normalizeEmailAddress}.
 *
 * Non-string values pass through untouched so `@IsEmail()` / `@IsString()` still
 * report the type error rather than a normalised lie. `value` is the raw input
 * (class-transformer hands custom transforms the plain value BEFORE the implicit
 * String conversion), so the boolean-DTO gotcha does not apply to a string field.
 */
export const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeEmailAddress(value) : value;
