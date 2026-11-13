import { dict } from "@/shared/config";
import { contactSchema } from "./contact-schema";

const valid = {
  topic: "order",
  name: "Олександр",
  phone: "+380 50 111 2233",
  email: "shopper@example.com",
  orderRef: "",
  message: "Питання про доставку",
  consent: true,
  website: "",
};

function messageFor(field: string, overrides: Record<string, unknown>) {
  const result = contactSchema.safeParse({ ...valid, ...overrides });
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

/** TASK-1984 (forms Rule 5): the client rule is `CreateContactMessageDto`'s. */
describe("contactSchema", () => {
  it("accepts a complete message", () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a phone with letters instead of stripping them (SF-ACC-36)", () => {
    expect(messageFor("phone", { phone: "050 111 2233 ccc" })).toBe(
      dict.contact.errors.phoneRequired,
    );
  });

  it("refuses a 255-character email (DTO cap 254)", () => {
    const email = `${"u".repeat(60)}@${"a".repeat(50)}.${"b".repeat(50)}.${"c".repeat(50)}.${"d".repeat(37)}.com`;
    expect(email).toHaveLength(255);
    expect(messageFor("email", { email })).toBe(dict.forms.tooLong);
  });

  it.each([
    ["name", "x".repeat(121), dict.contact.errors.nameMax],
    ["message", "x".repeat(5001), dict.contact.errors.messageMax],
    ["orderRef", "x".repeat(121), dict.contact.errors.orderRefMax],
    ["topic", "x".repeat(61), dict.contact.errors.topicMax],
  ])("says the %s is too long with its own sentence", (field, value, text) => {
    expect(messageFor(field, { [field]: value })).toBe(text);
  });

  it("still refuses a whitespace-only name as required", () => {
    expect(messageFor("name", { name: "   " })).toBe(
      dict.contact.errors.nameRequired,
    );
  });
});
