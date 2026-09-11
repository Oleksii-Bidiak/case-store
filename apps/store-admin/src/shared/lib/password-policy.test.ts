import {
  CUSTOMER_PASSWORD_REGEX,
  PASSWORD_MIN_LENGTH,
  STAFF_PASSWORD_REGEX,
  isCustomerPassword,
  isStaffPassword,
} from "./password-policy";

/**
 * TASK-465 — the admin panel used to hold three ASCII copies of the staff rule,
 * so a Cyrillic password the API accepts was refused client-side. These tests
 * pin the two halves of that fix: the classes are Unicode, and the 8-character
 * floor still exists even though the regexes no longer carry `{8,}`.
 */
describe("isStaffPassword (staff policy)", () => {
  it.each([
    ["Parol123", "latin, all three classes"],
    ["Пароль123", "Unicode-aware — Cyrillic letters count (the whole point)"],
    ["пароЛь123", "Cyrillic with the uppercase in the middle"],
    ["aB3aaaaa", "exactly the minimum length"],
  ])("accepts %s — %s", (value) => {
    expect(isStaffPassword(value)).toBe(true);
  });

  it.each([
    ["parol123", "no uppercase"],
    ["пароль123", "no uppercase, Cyrillic"],
    ["PAROL123", "no lowercase"],
    ["ПАРОЛЬ123", "no lowercase, Cyrillic"],
    ["ParolParol", "no digit"],
    ["Par123", "shorter than the minimum"],
    ["Пар123", "shorter than the minimum, Cyrillic"],
    ["", "empty"],
  ])("rejects %s — %s", (value) => {
    expect(isStaffPassword(value)).toBe(false);
  });

  it("enforces the length itself — the regex alone does not", () => {
    // The backend's patterns assert character classes only; dropping the length
    // check here would silently remove the 8-character floor.
    expect(STAFF_PASSWORD_REGEX.test("aB3")).toBe(true);
    expect(isStaffPassword("aB3")).toBe(false);
  });
});

describe("isCustomerPassword (shopper policy)", () => {
  it.each([
    ["parol123", "no uppercase required"],
    ["пароль123", "Unicode-aware"],
    ["Parol123", "an uppercase is allowed, just not required"],
  ])("accepts %s — %s", (value) => {
    expect(isCustomerPassword(value)).toBe(true);
  });

  it.each([
    ["PAROL123", "lowercase specifically — so PAROLE123 is still refused"],
    ["parolparol", "no digit"],
    ["par123", "shorter than the minimum"],
  ])("rejects %s — %s", (value) => {
    expect(isCustomerPassword(value)).toBe(false);
  });

  it("is strictly weaker than the staff policy", () => {
    // Every staff-valid password is customer-valid; the reverse does not hold.
    expect(isCustomerPassword("Parol123")).toBe(true);
    expect(isStaffPassword("parol123")).toBe(false);
  });
});

describe("policy constants", () => {
  it("mirrors the API's minimum length", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it.each([
    ["CUSTOMER_PASSWORD_REGEX", CUSTOMER_PASSWORD_REGEX],
    ["STAFF_PASSWORD_REGEX", STAFF_PASSWORD_REGEX],
  ])("%s carries the unicode flag", (_name, regex) => {
    // Without `u`, `\p{Ll}` is not a letter class at all — it matches the
    // literal characters, which is how the ASCII bug would come back.
    expect(regex.flags).toContain("u");
  });
});
