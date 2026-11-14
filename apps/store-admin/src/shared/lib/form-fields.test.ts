import { z } from "zod";
import { dict } from "@/shared/config";
import { EMAIL_MAX_LENGTH, emailField } from "./form-fields";

/**
 * TASK-1984 (forms convention, Rule 5c): `trim()` → `max(254)` → `email()`, the
 * client half of `@IsEmail() @MaxLength(254)` + `normalizeEmail` on the API.
 */
function messageOf(schema: z.ZodTypeAny, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

const LONG_EMAIL = `${"a".repeat(245)}@example.com`; // 257 characters

describe("emailField()", () => {
  const schema = emailField();

  it("mirrors the DTO's @MaxLength(254)", () => {
    expect(EMAIL_MAX_LENGTH).toBe(254);
  });

  it("trims before judging and returns the trimmed value", () => {
    expect(schema.parse("  ivan@example.com  ")).toBe("ivan@example.com");
  });

  it.each(["ivan", "ivan@", "@example.com", "iv an@example.com"])(
    "refuses %p with the localized default message",
    (value) => {
      expect(messageOf(schema, value)).toBe(dict.forms.emailInvalid);
    },
  );

  it("refuses an empty value — required by default", () => {
    expect(messageOf(schema, "   ")).toBe(dict.forms.emailInvalid);
  });

  it("refuses an address over 254 characters with the too-long message", () => {
    expect(messageOf(schema, LONG_EMAIL)).toBe(dict.forms.tooLong);
  });

  it("uses a custom message when given one", () => {
    expect(messageOf(emailField({ message: "Свій текст" }), "ivan")).toBe(
      "Свій текст",
    );
  });
});

describe("emailField({ optional: true })", () => {
  const schema = emailField({ optional: true });

  it.each(["", "   "])("accepts the blank value %p as ''", (value) => {
    expect(schema.parse(value)).toBe("");
  });

  it("still refuses a non-blank invalid value", () => {
    expect(messageOf(schema, "ivan")).toBe(dict.forms.emailInvalid);
  });

  it("still enforces the length cap", () => {
    expect(messageOf(schema, LONG_EMAIL)).toBe(dict.forms.tooLong);
  });
});
