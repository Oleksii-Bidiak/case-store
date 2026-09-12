/**
 * Ukrainian phone numbers — the admin panel's mirror of the storefront rule in
 * `apps/store-client/src/shared/lib/phone.ts` (TASK-407). Keep the mask, the
 * pattern and the normaliser in sync with it and with the API's
 * `apps/store-api/src/common/validators/is-ua-phone.decorator.ts`.
 *
 * ── Why this file exists (TASK-426) ──────────────────────────────────────────
 * The operator's create-order form asked for three phone numbers with a plain
 * text input and a `length >= 6` rule, so `123456` was an acceptable number for
 * the courier to call — the same defect the storefront had before TASK-407, in
 * the one place where nobody can check it later: there is no shopper on the other
 * end to notice that their own number is wrong. A mask also does real work here,
 * because an operator types a number they are hearing out loud, in whatever
 * grouping the customer dictates it.
 *
 * ── The property that must not be lost in the copy ───────────────────────────
 * VALIDATE THE NORMALISED DIGITS, NEVER THE MASK. {@link formatUAPhone}
 * TRUNCATES at nine local digits, so a rule written in terms of the mask would
 * quietly accept `+1 234 567 8901` as the Ukrainian number `+380 12 345 6789`.
 * {@link normalizeUAPhone} never truncates, which is why the rule is built on it.
 *
 * ── Why a mirror and not an import ──────────────────────────────────────────
 * Exactly the precedent set by `shared/lib/password-policy.ts`: store-admin and
 * store-client are separate Next.js apps with separate bundles and no shared
 * source package, so cross-importing `@/shared/lib` from the other app is not
 * expressible. The duplication is deliberate and this docblock is the pointer to
 * the original.
 *
 * ── Two rules live here, and the field decides which one applies ─────────────
 * {@link isValidUAPhone} is the strict Ukrainian rule (the storefront's, mirrored
 * here). {@link isValidInternationalPhone} mirrors the API's
 * `@IsInternationalPhone` — 9 to 15 digits, any country.
 *
 * THE ORDER FORMS USE THE INTERNATIONAL ONE, and that is not an oversight. The
 * endpoints an operator-created order reaches are country-agnostic ON PURPOSE:
 * `order/dto/address.dto.ts` and `order/dto/guest-contact.dto.ts` carry
 * `@IsInternationalPhone`, because "an operator entering a phone order may
 * legitimately be given a roaming or foreign number" — the owner's standing
 * decision, TASK-338, restated 2026-09-10. The first cut of TASK-426 put the UA
 * rule on the admin create-order form, and the panel then refused +48 numbers
 * the API accepts: a border-region customer could not be served at all. The two
 * halves must agree, and the API side is the one the owner decided.
 *
 * The UA rule therefore applies only where the SERVER demands a Ukrainian number
 * — the storefront checkout and contact forms, which have no admin counterpart
 * today. Before putting {@link isValidUAPhone} or the `+380` mask on a new admin
 * field, check which decorator the DTO behind it carries.
 */

/** Digits in a UA local number, after the `380` country code. */
export const UA_PHONE_LOCAL_LENGTH = 9;

/** A normalised UA number: country code + local part, digits only. */
export const UA_PHONE_PATTERN = /^380\d{9}$/;

/**
 * Strip a raw phone string down to the local (post-`380`) digits, capped at
 * {@link UA_PHONE_LOCAL_LENGTH}. The shared half of the mask:
 *
 *   - `"0501234567"`    → `"501234567"` (domestic leading 0)
 *   - `"380501234567"`  → `"501234567"` (country code)
 *   - `"80501234567"`   → `"501234567"` (old inter-city prefix)
 *   - `"+380 50 123 4"` → `"501234"`    (partial)
 */
function localDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  let local: string;
  if (digits.startsWith("380")) {
    local = digits.slice(3);
  } else if (digits.startsWith("80")) {
    local = digits.slice(2);
  } else if (digits.startsWith("0")) {
    local = digits.slice(1);
  } else {
    local = digits;
  }

  return local.slice(0, UA_PHONE_LOCAL_LENGTH);
}

/**
 * Format a raw phone string into the Ukrainian mask `+380 NN NNN NNNN`.
 *
 * The `+380` country prefix is always present; the local part is normalised so
 * the operator can type any of the common forms without producing a doubled
 * prefix:
 *
 *   - `""`              → `"+380"`
 *   - `"0501234567"`    → `"+380 50 123 4567"`
 *   - `"380501234567"`  → `"+380 50 123 4567"`
 *   - `"+380501234567"` → `"+380 50 123 4567"`
 *   - `"+380 50 123 4"` → `"+380 50 123 4"`    (partial preserved)
 *   - `"12345678901"`   → `"+380 12 345 6789"` (capped at 9 local digits)
 *
 * NOTE the last example: the mask *truncates* an over-long number, which is
 * exactly why {@link isValidUAPhone} must not be written in terms of it.
 */
export function formatUAPhone(raw: string): string {
  const local = localDigits(raw);

  let out = "+380";
  if (local.length > 0) out += " " + local.slice(0, 2);
  if (local.length > 2) out += " " + local.slice(2, 5);
  if (local.length > 5) out += " " + local.slice(5, 9);
  return out;
}

/**
 * Reduce a raw phone string to comparable digits: `380` + the local part when the
 * input carries a recognisable Ukrainian shape, and the bare digits otherwise
 * (which then simply fails {@link UA_PHONE_PATTERN}).
 *
 * Unlike {@link formatUAPhone} this NEVER truncates. An 11-digit foreign number
 * such as `+1 234 567 8901` keeps all 11 digits and is rejected, where the mask
 * would have quietly cut it down to a plausible-looking 9.
 */
export function normalizeUAPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("380")) return digits;
  if (digits.startsWith("80")) return `3${digits}`;
  if (digits.startsWith("0")) return `38${digits}`;
  // A bare local number, typed without any prefix at all.
  if (digits.length === UA_PHONE_LOCAL_LENGTH) return `380${digits}`;
  return digits;
}

/** Whether `raw` is a Ukrainian number, whatever separators it was typed with. */
export function isValidUAPhone(raw: string): boolean {
  return UA_PHONE_PATTERN.test(normalizeUAPhone(raw));
}

// ─── The country-agnostic rule the order endpoints actually enforce ───────────

/** Shortest number we accept: a UA local number, typed without a prefix, is 9 digits. */
export const PHONE_MIN_DIGITS = 9;

/** Longest number that can exist: E.164 caps a full international number at 15 digits. */
export const PHONE_MAX_DIGITS = 15;

/**
 * The characters a human legitimately types AROUND the digits — a leading `+`,
 * then digits and the usual separators. Mirrors `PHONE_SHAPE` in the API's
 * `is-international-phone.decorator.ts`: letters or an extension make a value
 * nobody can dial as we store it, and the server's `normalizePhone` refuses to
 * normalise such a value for exactly that reason.
 */
export const PHONE_SHAPE = /^\+?[\d\s().-]+$/;

/**
 * Whether `raw` is a dialable number of ANY country — the admin mirror of the
 * API's `@IsInternationalPhone`.
 *
 * Counts DIGITS, not mask characters, so `(((((((((` — nine brackets and not one
 * digit — is refused, while `+48 123 456 789` and `+1 (212) 555-0123` pass.
 *
 * It counts them on the NORMALISED value, because that is the order the server
 * runs in: under the global `transform: true` pipe `normalizePhone` runs before
 * `@IsInternationalPhone`, so `0501234567` reaches the validator as
 * `380501234567`. Counting the typed digits instead would let a 15-digit value
 * beginning with `0` pass here and 400 there — the same "the two halves must
 * agree" defect this function exists to close, one rule further down.
 */
export function isValidInternationalPhone(raw: string): boolean {
  const trimmed = raw.trim();
  if (!PHONE_SHAPE.test(trimmed)) return false;

  const digits = normalizeUAPhone(trimmed).length;
  return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS;
}
