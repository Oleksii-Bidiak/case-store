import { dict } from "@/shared/config";
import {
  CUSTOMER_PASSWORD_REGEX,
  PASSWORD_MIN_LENGTH,
  STAFF_PASSWORD_REGEX,
  customerPasswordSchema,
  staffPasswordSchema,
} from "./password-policy";

/**
 * Two mirrors of the API rule in
 * `apps/store-api/src/common/validators/password-policy.decorator.ts`
 * (TASK-227, split by owner decision 2026-09-10 / TASK-407):
 *
 *   - shopper: min 8 + a lowercase letter + a digit, NO uppercase requirement;
 *   - staff:   min 8 + lowercase + UPPERCASE + digit, as before.
 *
 * Both allow special characters without requiring them, and both use
 * Unicode-aware letter classes.
 */
describe("customerPasswordSchema (shopper policy)", () => {
  it.each([
    ["testtest1", "the case that used to be rejected for want of an uppercase"],
    ["Testtest1", "an uppercase letter is allowed, just not demanded"],
    ["strongp@ss123", "special characters allowed but not required"],
    ["пароль123", "Unicode-aware — Cyrillic letters count"],
  ])("accepts %s (%s)", (password) => {
    expect(customerPasswordSchema.safeParse(password).success).toBe(true);
  });

  it.each([
    ["testtest", "the QA sample — no digit"],
    ["12345678", "digits only, no letter"],
    ["TESTTEST1", "no lowercase letter"],
    ["tt1", "shorter than 8 characters"],
  ])("rejects %s (%s)", (password) => {
    expect(customerPasswordSchema.safeParse(password).success).toBe(false);
  });

  it("reports the min-length message for a short password", () => {
    const result = customerPasswordSchema.safeParse("tt1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        dict.auth.register.validationPassword,
      );
    }
  });

  it("reports the policy message for a long-enough weak password", () => {
    const result = customerPasswordSchema.safeParse("testtest");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        dict.auth.register.validationPasswordPolicy,
      );
    }
  });

  it("no longer asks the shopper for an uppercase letter, in copy either", () => {
    expect(dict.auth.register.validationPasswordPolicy).not.toMatch(/велик/i);
  });
});

describe("staffPasswordSchema (staff policy — unchanged)", () => {
  it.each([
    ["Testtest1", "exactly 8 chars with lower + upper + digit"],
    ["StrongP@ss123", "special characters allowed but not required"],
    ["Пароль123", "Unicode-aware — Cyrillic letters count"],
  ])("accepts %s (%s)", (password) => {
    expect(staffPasswordSchema.safeParse(password).success).toBe(true);
  });

  it.each([
    ["testtest1", "no uppercase — fine for a shopper, not for staff"],
    ["testtest", "no uppercase, no digit"],
    ["TESTTEST1", "no lowercase letter"],
    ["TestTestTest", "no digit"],
    ["12345678", "digits only"],
    ["Tt1", "shorter than 8 characters"],
  ])("rejects %s (%s)", (password) => {
    expect(staffPasswordSchema.safeParse(password).success).toBe(false);
  });

  it("is strictly stronger than the shopper policy", () => {
    // Everything staff accepts a shopper account accepts too — the two rules
    // must never disagree in that direction.
    for (const password of ["Testtest1", "StrongP@ss123", "Пароль123"]) {
      expect(staffPasswordSchema.safeParse(password).success).toBe(true);
      expect(customerPasswordSchema.safeParse(password).success).toBe(true);
    }
    // …but not the other way round.
    expect(customerPasswordSchema.safeParse("testtest1").success).toBe(true);
    expect(staffPasswordSchema.safeParse("testtest1").success).toBe(false);
  });
});

describe("policy constants", () => {
  it("keeps the constants aligned with the backend baseline", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(CUSTOMER_PASSWORD_REGEX.flags).toContain("u");
    expect(STAFF_PASSWORD_REGEX.flags).toContain("u");
  });
});
