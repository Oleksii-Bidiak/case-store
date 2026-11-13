import {
  displayPhone,
  formatUAPhone,
  isValidUAPhone,
  maskedPhoneDisplay,
  maskedPhoneValue,
  PHONE_SHAPE,
  sanitizePhoneInput,
  normalizeUAPhone,
  toTelHref,
  UA_PHONE_LOCAL_LENGTH,
} from "./phone";

/**
 * TASK-407 — the mask is NOT the value.
 *
 * The old checkout rule (`/^\+?[\d\s()-]{10,20}$/`) matched the characters the
 * mask had drawn, so punctuation counted as a phone number and a truncated one
 * still passed. These tests pin the separation: `formatUAPhone` decorates,
 * `normalizeUAPhone` reduces to digits, and only the reduced value is judged.
 */
describe("formatUAPhone (mask)", () => {
  it.each([
    ["", "+380"],
    ["0", "+380"],
    ["050", "+380 50"],
    ["0501234567", "+380 50 123 4567"],
    ["380501234567", "+380 50 123 4567"],
    ["+380501234567", "+380 50 123 4567"],
    ["80501234567", "+380 50 123 4567"],
    ["501234567", "+380 50 123 4567"],
    ["+380 50 123 4", "+380 50 123 4"],
    // The mask truncates; validation must not be built on it (see below).
    ["12345678901", "+380 12 345 6789"],
  ])("formats %s as %s", (input, expected) => {
    expect(formatUAPhone(input)).toBe(expected);
  });
});

describe("normalizeUAPhone (value)", () => {
  it.each([
    ["+380 50 123 4567", "380501234567"],
    ["0501234567", "380501234567"],
    ["80501234567", "380501234567"],
    ["501234567", "380501234567"],
    ["+38 (050) 123-45-67", "380501234567"],
  ])("reduces %s to %s", (input, expected) => {
    expect(normalizeUAPhone(input)).toBe(expected);
  });

  it("never truncates an over-long number the way the mask does", () => {
    // The mask would render this as a plausible "+380 12 345 6789".
    expect(formatUAPhone("+1 234 567 8901")).toBe("+380 12 345 6789");
    expect(normalizeUAPhone("+1 234 567 8901")).toBe("12345678901");
  });
});

describe("isValidUAPhone", () => {
  it.each([
    ["+380501234567", "full international form"],
    ["+380 50 123 4567", "the mask the input renders"],
    ["0501234567", "domestic leading zero"],
    ["80501234567", "old inter-city prefix"],
    ["501234567", "bare local part"],
    ["+38 (050) 123-45-67", "brackets and dashes"],
    ["  +380 50 123 4567  ", "surrounding whitespace"],
  ])("accepts %s (%s)", (phone) => {
    expect(isValidUAPhone(phone)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["123", "far too short"],
    ["+380 50 123", "a half-typed number"],
    ["05012345678", "one digit too many"],
    ["+1 234 567 8901", "a foreign number the mask would have truncated"],
    ["(((((((((((", "the punctuation the old mask-shaped regex accepted"],
    ["+380 50 123 456", "eight local digits"],
    // TASK-1984 (Rule 5a): the shape is checked BEFORE the digits are counted, as
    // the API's `@IsUaPhone` does — letters make the value refused, never cleaned.
    ["050 111 2233 ccc", "a valid number followed by letters"],
    ["++380501234567", "a second plus"],
    ["+380 50 123 4567 ext 5", "an extension"],
  ])("rejects %s (%s)", (phone) => {
    expect(isValidUAPhone(phone)).toBe(false);
  });

  it("exports the API's PHONE_SHAPE literal (pinned by phone-parity.spec.ts in store-api)", () => {
    expect(PHONE_SHAPE).toEqual(/^\+?[\d\s().-]+$/);
  });

  it("keeps the local length at 9 digits", () => {
    expect(UA_PHONE_LOCAL_LENGTH).toBe(9);
  });
});

describe("displayPhone (TASK-647)", () => {
  it.each([
    ["380501234567", "+380 50 123 4567"],
    ["+380501234567", "+380 50 123 4567"],
    ["0501234567", "+380 50 123 4567"],
    // Not a UA number: shown as stored, never truncated into a wrong one.
    ["+48 600 123 456", "+48 600 123 456"],
    ["12345", "12345"],
  ])("shows %s as %s", (input, expected) => {
    expect(displayPhone(input)).toBe(expected);
  });
});

describe("toTelHref (TASK-873)", () => {
  it.each([
    [" +380 (44) 000-00-00 ", "tel:+380440000000"],
    // A free-phone line dials as written — not rewritten to +380.
    ["0 800 30 30 30", "tel:0800303030"],
  ])("turns %s into %s", (input, expected) => {
    expect(toTelHref(input)).toBe(expected);
  });

  it.each([["телефон"], ["—"], ["   "]])(
    "returns null when nothing dialable is left in %j",
    (input) => {
      expect(toTelHref(input)).toBeNull();
    },
  );
});

/**
 * TASK-1984 (Rule 5b) — what `PhoneInput` hands the form: the raw string with
 * every character outside the `PHONE_SHAPE` alphabet removed, never truncated.
 */
describe("sanitizePhoneInput", () => {
  it.each([
    ["050 111 2233 ccc", "050 111 2233 "],
    ["+38 (050) 111-22.33", "+38 (050) 111-22.33"],
    ["тел. 050ф1112233", ". 0501112233"],
    ["+48 123 456 789 012 345", "+48 123 456 789 012 345"],
    ["", ""],
  ])("%p → %p", (raw, expected) => {
    expect(sanitizePhoneInput(raw)).toBe(expected);
  });
});

/**
 * TASK-1984 — the mask draws `+380` into every field, so what the browser hands
 * `onChange` always starts with it. `maskedPhoneValue` turns that back into the
 * value the person meant.
 */
describe("maskedPhoneValue (what the masked field emits)", () => {
  it.each([
    // Only the drawn prefix, or what Backspace left of it: an empty field.
    ["+380", ""],
    ["+38", ""],
    ["+3", ""],
    ["+", ""],
    ["", ""],
    // A domestic 0 typed after the drawn +380 is the trunk zero — no UA local
    // number starts with 0.
    ["+3800", ""],
    ["+3800501112233", "+380501112233"],
    ["+3805", "+3805"],
    ["+380 50 111 2233", "+380 50 111 2233"],
    // Not the drawn prefix: passed whole, only sanitised (Rule 5b).
    ["0501112233", "0501112233"],
    ["+38 (050) 111-22.33 4455", "+38 (050) 111-22.33 4455"],
    ["+380 50 111 2233 ccc", "+380 50 111 2233 "],
  ])("%p → %p", (raw, expected) => {
    expect(maskedPhoneValue(raw)).toBe(expected);
  });

  it("turns a domestic number typed after the drawn prefix into a valid one", () => {
    expect(isValidUAPhone(maskedPhoneValue("+3800501112233"))).toBe(true);
  });
});

/**
 * TASK-1984 — what the masked FIELD shows. Unlike `formatUAPhone` (a stored
 * number shown back, only ever called on a valid one) it never hides a digit the
 * value carries: a 10th digit hidden by the mask left a field that looked right
 * saying "invalid phone".
 */
describe("maskedPhoneDisplay (what the masked field shows)", () => {
  it.each([
    ["", "+380"],
    ["+3805", "+380 5"],
    ["0501112233", "+380 50 111 2233"],
    ["+380501112233", "+380 50 111 2233"],
    ["+380 50 111 22334", "+380 50 111 22334"],
    ["12345678901", "+380 12 345 678901"],
  ])("%p → %p", (raw, expected) => {
    expect(maskedPhoneDisplay(raw)).toBe(expected);
  });
});
