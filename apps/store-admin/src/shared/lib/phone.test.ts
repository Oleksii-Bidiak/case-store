import {
  formatUAPhone,
  isValidInternationalPhone,
  isValidUAPhone,
  normalizeUAPhone,
  PHONE_MAX_DIGITS,
  PHONE_MIN_DIGITS,
  UA_PHONE_LOCAL_LENGTH,
} from "./phone";

/**
 * TASK-426 — the mask is NOT the value, in the admin panel either.
 *
 * Ported from `apps/store-client/src/shared/lib/phone.test.ts` (TASK-407)
 * together with the module it covers. The cases are kept identical on purpose:
 * the moment the two files disagree, one of the two apps has silently changed
 * what counts as a phone number.
 *
 * The operator's create-order form used to accept `length >= 6`, which made
 * `123456` a courier callback number in the one place where no shopper is around
 * to notice their own number is wrong.
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
  ])("accepts %s (%s)", (phone) => {
    expect(isValidUAPhone(phone)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["123", "far too short"],
    ["123456", "the six characters the old create-order rule accepted"],
    ["+380 50 123", "a half-typed number"],
    ["05012345678", "one digit too many"],
    ["+1 234 567 8901", "a foreign number the mask would have truncated"],
    ["(((((((((((", "the punctuation a mask-shaped regex accepts"],
    ["+380 50 123 456", "eight local digits"],
  ])("rejects %s (%s)", (phone) => {
    expect(isValidUAPhone(phone)).toBe(false);
  });

  it("keeps the local length at 9 digits", () => {
    expect(UA_PHONE_LOCAL_LENGTH).toBe(9);
  });
});

/**
 * The rule the ORDER endpoints enforce, and therefore the one the operator's
 * create-order form uses (TASK-426, after review).
 *
 * `isValidUAPhone` above and this one are not interchangeable: the storefront
 * must refuse a foreign number, and the order endpoints must accept one — the
 * owner's standing decision (TASK-338, restated 2026-09-10). The cases below are
 * the ones `is-international-phone.decorator.spec.ts` pins on the server.
 */
describe("isValidInternationalPhone", () => {
  it.each([
    ["+380501234567", "a Ukrainian number, full form"],
    ["0501234567", "a Ukrainian number, domestic leading zero"],
    ["+48 123 456 789", "a Polish border-region number"],
    ["+1 (212) 555-0123", "a US number with brackets and a dash"],
    ["+49 30 123456789", "13 digits"],
    ["123456789", "the shortest we accept: 9 digits"],
  ])("accepts %s (%s)", (phone) => {
    expect(isValidInternationalPhone(phone)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["123456", "the six characters the old create-order rule accepted"],
    ["+380 50 123", "a half-typed number"],
    ["(((((((((", "nine brackets and not one digit"],
    ["050 123 45 67 після 18", "a number with a note stuck to it"],
    ["+1234567890123456", "16 digits, past what E.164 allows"],
  ])("rejects %s (%s)", (phone) => {
    expect(isValidInternationalPhone(phone)).toBe(false);
  });

  /**
   * The server normalises BEFORE validating, so the digits it counts are not
   * always the digits that were typed. Counting the typed ones here would let a
   * value pass the form and 400 at the endpoint — the very split this rule was
   * written to close.
   */
  it("counts the digits the server will count, not the ones typed", () => {
    // 14 typed digits — inside the 15-digit cap — but a leading `0` makes the
    // server read it as a domestic number and expand it to 16.
    const domestic = "0".padEnd(14, "1");

    expect(domestic).toHaveLength(14);
    expect(normalizeUAPhone(domestic)).toHaveLength(16);
    expect(isValidInternationalPhone(domestic)).toBe(false);
  });

  it("keeps the E.164 bounds it mirrors", () => {
    expect(PHONE_MIN_DIGITS).toBe(9);
    expect(PHONE_MAX_DIGITS).toBe(15);
  });
});
