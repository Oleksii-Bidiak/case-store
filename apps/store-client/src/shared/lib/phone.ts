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
 * The rule (owner decision, 2026-09-10): a storefront contact number is a
 * Ukrainian one — 12 digits, `380` + a 9-digit local number. It is applied to
 * the **checkout** and **contact** forms only. `order/dto/guest-contact.dto.ts`
 * on the API deliberately stays format-free for roaming and border numbers;
 * that decision is written down there and still stands.
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

/** Whether `raw` is a Ukrainian number, whatever separators it was typed with. */
export function isValidUAPhone(raw: string): boolean {
  return UA_PHONE_PATTERN.test(normalizeUAPhone(raw));
}
