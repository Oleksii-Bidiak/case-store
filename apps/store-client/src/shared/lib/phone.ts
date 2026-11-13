/**
 * Ukrainian phone numbers — one place for the mask and the rule (TASK-407).
 *
 * The storefront used to check the *mask* rather than the number:
 * `/^\+?[\d\s()-]{10,20}$/` on the checkout schema counted the spaces and
 * brackets `PhoneInput` had just drawn, so `(((((((((((` passed while a shopper
 * who deleted two digits out of the middle of a formatted number heard nothing
 * about it until an operator called. Validation therefore runs on the
 * NORMALISED value — digits only — and the mask stays presentation.
 *
 * The rule (plan 173, TASK-407 §1): a number a shopper types into the storefront
 * is a Ukrainian one — 12 digits, `380` + a 9-digit local number. It is applied
 * to the **checkout** and **contact** forms only, and mirrored on the API by
 * `@IsUaPhone()` on the contact DTO.
 *
 * The order endpoints deliberately stay format-free: they also carry orders an
 * operator enters by hand and orders from API clients, where a roaming or
 * border-region number is legitimate. That decision is written down at
 * `apps/store-api/src/order/dto/guest-contact.dto.ts:39-41` (TASK-338) and was
 * not reopened here — see the scope note on `IsUaPhone` in
 * `apps/store-api/src/common/validators/is-ua-phone.decorator.ts`, which states
 * the same split from the other side. A shopper still cannot submit a non-UA
 * number, because this schema refuses it before the request is made.
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
  return localPart(raw).slice(0, UA_PHONE_LOCAL_LENGTH);
}

/** {@link localDigits} without the cap — every digit after the prefix. */
function localPart(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("380")) return digits.slice(3);
  if (digits.startsWith("80")) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * Format a raw phone string into the Ukrainian mask `+380 NN NNN NNNN`.
 *
 * The `+380` country prefix is always present; the local part is normalised so
 * the user can type any of the common forms without producing a doubled prefix:
 *
 *   - `""`              → `"+380"`
 *   - `"0501234567"`    → `"+380 50 123 4567"`
 *   - `"380501234567"`  → `"+380 50 123 4567"`
 *   - `"+380501234567"` → `"+380 50 123 4567"`
 *   - `"+380 50 123 4"` → `"+380 50 123 4"`    (partial preserved)
 *   - `"12345678901"`   → `"+380 12 345 6789"` (capped at 9 local digits)
 *
 * Grouping is applied progressively as the user types: 2 digits (operator
 * code), 3 digits, then 4 digits, separated by regular ASCII spaces.
 *
 * NOTE the last example: the mask *truncates* an over-long number, which is
 * exactly why {@link isValidUAPhone} must not be written in terms of it — see
 * {@link normalizeUAPhone}.
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
 * Reduce a raw phone string to comparable digits: `380` + the local part when
 * the input carries a recognisable Ukrainian shape, and the bare digits
 * otherwise (which then simply fails {@link UA_PHONE_PATTERN}).
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

/**
 * The characters a human legitimately types AROUND the digits — a leading `+`,
 * then digits and the usual separators. Spelled exactly as `PHONE_SHAPE` in the
 * API's `is-international-phone.decorator.ts`; `phone-parity.spec.ts` in
 * store-api fails the moment the two differ (forms convention, Rule 5a).
 */
export const PHONE_SHAPE = /^\+?[\d\s().-]+$/;

/** One character outside the {@link PHONE_SHAPE} alphabet. */
const NOT_PHONE_CHAR = /[^\d\s+().-]/g;

/**
 * What `PhoneInput` hands the form (TASK-1984, Rule 5b): the raw string with
 * every character outside the {@link PHONE_SHAPE} alphabet removed — letters
 * typed or pasted never reach the value. NEVER truncates and never reorders, so
 * the rule still judges exactly what the user meant (Rule 4b); a second `+` is
 * kept for {@link PHONE_SHAPE} to refuse.
 */
export function sanitizePhoneInput(raw: string): string {
  return raw.replace(NOT_PHONE_CHAR, "");
}

/** The prefix {@link formatUAPhone} draws into every masked field, empty or not. */
const MASK_PREFIX = "+380";

/** The drawn prefix followed by a domestic trunk zero: `+380` + `0…`. */
const MASK_PREFIX_TRUNK_ZERO = /^\+380\s*0/;

/**
 * What the masked `PhoneInput` hands the form for what the browser now holds
 * (TASK-1984). The mask draws `+380` into every field, so everything a person
 * types lands AFTER it; without this the value carried the drawn prefix too:
 *
 *   - only the prefix, or what Backspace left of it (`+38`, `+3`, `+`) → `""`,
 *     so the field can be emptied (and an optional number removed);
 *   - a domestic `0…` typed after it is the trunk zero — no UA local number
 *     starts with 0 — so it is dropped: `+3800501112233` → `+380501112233`.
 *
 * Everything else is {@link sanitizePhoneInput}d and passed whole (Rule 5b). A
 * pasted whole number never gets here with the prefix: `PhoneInput` replaces the
 * value with it ({@link isWholePhonePaste}).
 */
export function maskedPhoneValue(raw: string): string {
  const clean = sanitizePhoneInput(raw).replace(
    MASK_PREFIX_TRUNK_ZERO,
    MASK_PREFIX,
  );
  // Only what is left OF the drawn prefix counts as empty — `----------` is
  // something typed, and stays for the rule to refuse (TASK-799).
  return MASK_PREFIX.startsWith(clean.replace(/\s/g, "")) ? "" : clean;
}

/**
 * Whether pasted text is a whole number (at least a UA local number's worth of
 * digits) — `PhoneInput` then REPLACES the value with it instead of inserting it
 * after the drawn `+380` (TASK-1984): `+380` + `+380501112233` is two numbers.
 */
export function isWholePhonePaste(text: string): boolean {
  return text.replace(/\D/g, "").length >= UA_PHONE_LOCAL_LENGTH;
}

/**
 * What the masked `PhoneInput` SHOWS (TASK-1984): {@link formatUAPhone}, but a
 * digit past the ninth is shown rather than cut. The field's value is never
 * truncated (Rule 5b), so a mask that hid the 10th digit showed a valid-looking
 * number under the error that refused it.
 */
export function maskedPhoneDisplay(raw: string): string {
  const masked = formatUAPhone(raw);
  const local = localPart(raw);
  return local.length > UA_PHONE_LOCAL_LENGTH
    ? masked + local.slice(UA_PHONE_LOCAL_LENGTH)
    : masked;
}

/**
 * Whether `raw` is a Ukrainian number, whatever separators it was typed with.
 *
 * Shape first, then digits — the API's `@IsUaPhone` order (TASK-1984). The
 * normaliser strips every non-digit, so without the shape check
 * `050 111 2233 ccc` reduced to a valid number here while the server refused it.
 */
export function isValidUAPhone(raw: string): boolean {
  const trimmed = raw.trim();
  return (
    PHONE_SHAPE.test(trimmed) &&
    UA_PHONE_PATTERN.test(normalizeUAPhone(trimmed))
  );
}

/**
 * A stored phone, shown back to a person: the UA mask `+380 50 123 4567` when
 * the number IS a Ukrainian one, the stored text as-is otherwise. Order
 * snapshots are format-free (an operator's order can carry a roaming number),
 * and {@link formatUAPhone} would truncate such a number into a wrong one — so
 * only a valid UA number is re-masked (TASK-647).
 */
export function displayPhone(raw: string): string {
  return isValidUAPhone(raw) ? formatUAPhone(raw) : raw;
}

/**
 * `tel:` URI for a human-formatted number the shop typed into its contact
 * settings: keeps the digits and a leading `+`
 * («+380 44 000-00-00» → «tel:+380440000000», «0 800 30 30 30» →
 * «tel:0800303030»). Deliberately NOT normalised to `380…` — a free-phone
 * `0 800` line must dial as written. Null when nothing dialable is left, so a
 * stray non-number in the admin field hides the link rather than rendering one
 * that dials nothing (TASK-873).
 */
export function toTelHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
