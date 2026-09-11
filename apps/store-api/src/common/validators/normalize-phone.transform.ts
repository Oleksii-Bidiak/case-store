import { PHONE_SHAPE } from './is-international-phone.decorator';
import { normalizeUaPhone } from './is-ua-phone.decorator';

/**
 * `class-transformer` transform that stores one phone number in ONE shape
 * (TASK-466).
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The storefront checkout posts a masked value (`+380 50 111 2233`); an operator
 * entering a phone order types into an unmasked field and sends `050 111 2233`
 * or `0501112233`. Both landed in the same columns unchanged, so one number
 * lived as several strings and the admin order search — `contains` on
 * `guestPhone` / `user.phone` — found whichever spelling it happened to be given
 * and missed the rest.
 *
 * ── Why `normalizeUaPhone` and not `phoneDigits` ──────────────────────────────
 * `phoneDigits` only strips the separators, so `+380 50 111 2233` still reduces
 * to `380501112233` while `050 111 2233` reduces to `0501112233` — two strings,
 * defect intact. {@link normalizeUaPhone} converges every Ukrainian spelling on
 * `380XXXXXXXXX` and leaves a foreign number as its bare digits. Owner's
 * decision, 2026-09-11 (the BACKLOG row naming `phoneDigits` is wrong).
 *
 * ── Why the shape guard ───────────────────────────────────────────────────────
 * This changes NORMALISATION, never VALIDATION. Under the global
 * `transform: true` pipe class-transformer runs BEFORE class-validator, so an
 * unguarded normalise would hand the validators a value they never saw:
 * `+380 50 123 45 67 call after 6pm` would arrive as `380501234567` and pass,
 * where `@IsInternationalPhone` refuses it today (letters are not part of a
 * number a courier can dial, and silently deleting the operator's note is not
 * normalisation). Normalising only a value that is already "a number and nothing
 * else" keeps every existing accept/reject outcome identical — including the
 * `stays country-agnostic` block in `is-international-phone.decorator.spec.ts`.
 *
 * Non-string values pass through untouched so `@IsString()` still reports the
 * type error rather than a normalised lie.
 */
export const normalizePhone = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  // Not phone-shaped → hand it on unnormalised and let the validators refuse it.
  return PHONE_SHAPE.test(trimmed) ? normalizeUaPhone(trimmed) : trimmed;
};
