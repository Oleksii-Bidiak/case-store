import { z } from "zod";
import { dict } from "@/shared/config";
import { phoneField } from "./phone-field";

/**
 * TASK-1984 (forms convention, Rule 5b): the one way a storefront schema says
 * "this is a phone". It runs `isValidUAPhone` — the API's `@IsUaPhone` — so the
 * form never accepts what the server refuses.
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

  it.each([
    "050 111 2233 ccc",
    "----------",
    "+48 123 456 789",
    "12345",
    "(((((((((",
  ])("refuses %p with the localized default message", (value) => {
    expect(messageOf(schema, value)).toBe(dict.forms.phoneInvalid);
  });

  it("is required by default — an empty value is refused", () => {
    expect(messageOf(schema, "")).toBe(dict.forms.phoneInvalid);
  });

  it("returns the value as typed, not normalised (the DTO normalises)", () => {
    expect(schema.parse("+380 50 111 2233")).toBe("+380 50 111 2233");
  });

  it("uses a custom message when given one", () => {
    expect(
      messageOf(phoneField({ rule: "ua", message: "Свій текст" }), "123"),
    ).toBe("Свій текст");
  });

  it("reuses the storefront's existing phone copy", () => {
    expect(dict.forms.phoneInvalid).toBe(dict.account.phoneInvalid);
  });
});

describe("phoneField({ rule: 'ua', optional: true })", () => {
  const schema = phoneField({ rule: "ua", optional: true });

  it.each(["", "   "])("accepts the blank value %p", (value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it("still refuses a non-blank invalid value", () => {
    expect(messageOf(schema, "050 111 2233 ccc")).toBe(dict.forms.phoneInvalid);
  });

  it("accepts a valid value", () => {
    expect(schema.safeParse("0501112233").success).toBe(true);
  });
});
