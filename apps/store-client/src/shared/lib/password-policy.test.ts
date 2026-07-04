import { dict } from "@/shared/config";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_REGEX,
  passwordSchema,
} from "./password-policy";

/**
 * Password policy (TASK-227) — must mirror the API rule in
 * `apps/store-api/src/common/validators/is-strong-app-password.decorator.ts`:
 * min 8 chars + at least one lowercase, one uppercase and one digit; special
 * characters allowed but not required; Unicode-aware letter classes.
 */
describe("passwordSchema (TASK-227 policy)", () => {
  it.each([
    ["testtest", "the QA sample — no uppercase, no digit"],
    ["TESTTEST1", "no lowercase letter"],
    ["testtest1", "no uppercase letter"],
    ["TestTestTest", "no digit"],
    ["12345678", "digits only"],
    ["Tt1", "shorter than 8 characters"],
  ])("rejects %s (%s)", (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });

  it.each([
    ["Testtest1", "exactly 8 chars with lower + upper + digit"],
    ["StrongP@ss123", "special characters allowed but not required"],
    ["Пароль123", "Unicode-aware — Cyrillic letters count"],
  ])("accepts %s (%s)", (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(true);
  });

  it("reports the min-length message for a short password", () => {
    const result = passwordSchema.safeParse("Tt1");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        dict.auth.register.validationPassword,
      );
    }
  });

  it("reports the policy message for a long-enough weak password", () => {
    const result = passwordSchema.safeParse("testtest");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        dict.auth.register.validationPasswordPolicy,
      );
    }
  });

  it("keeps the constants aligned with the backend baseline", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_POLICY_REGEX.flags).toContain("u");
  });
});
