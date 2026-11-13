import { z } from "zod";
import { dict } from "@/shared/config";
import { phoneField } from "./phone-field";

/**
 * TASK-1984 (forms convention, Rule 5b): the one way an admin schema says
 * "this is a phone". The DTO behind the field names the rule — `@IsUaPhone` →
 * `rule: "ua"`, `@IsInternationalPhone` → `rule: "international"` (Rule 5a).
 */
function messageOf(schema: z.ZodTypeAny, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("phoneField({ rule: 'ua' })", () => {
  const schema = phoneField({ rule: "ua" });

  it.each(["+380 50 111 2233", "0501112233", "+38 (050) 111-22-33"])(
    "accepts %p",
    (value) => {
      expect(schema.safeParse(value).success).toBe(true);
    },
  );

  it.each(["050 111 2233 ccc", "----------", "+48 123 456 789", "12345", ""])(
    "refuses %p with the localized default message",
    (value) => {
      expect(messageOf(schema, value)).toBe(dict.forms.phoneInvalid);
    },
  );
});

describe("phoneField({ rule: 'international' })", () => {
  const schema = phoneField({ rule: "international" });

  it.each([
    "+48 123 456 789",
    "+1 234 567 8901",
    "+380 50 111 2233",
    "0 800 30 30 30",
  ])("accepts %p", (value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each(["050 111 2233 ccc", "----------", "12345", "(((((((((", ""])(
    "refuses %p with the localized default message",
    (value) => {
      expect(messageOf(schema, value)).toBe(dict.forms.phoneInvalid);
    },
  );

  it("returns the value as typed — the shop's own numbers are stored as typed (D4)", () => {
    expect(schema.parse("0 800 30 30 30")).toBe("0 800 30 30 30");
  });
});

describe("phoneField options", () => {
  it.each(["ua", "international"] as const)(
    "rule %p with optional: true accepts a blank value but not garbage",
    (rule) => {
      const schema = phoneField({ rule, optional: true });

      expect(schema.safeParse("").success).toBe(true);
      expect(schema.safeParse("   ").success).toBe(true);
      expect(messageOf(schema, "222фіфів")).toBe(dict.forms.phoneInvalid);
    },
  );

  it("uses a custom message when given one", () => {
    expect(
      messageOf(
        phoneField({ rule: "international", message: "Свій текст" }),
        "123",
      ),
    ).toBe("Свій текст");
  });
});
