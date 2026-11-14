import { dict } from "@/shared/config";
import { orderLookupSchema } from "./order-lookup-schema";

function phoneMessage(phone: string) {
  const result = orderLookupSchema.safeParse({ number: "#94F5F971", phone });
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === "phone")
    ?.message;
}

/** TASK-1984 (forms Rule 5b): the shared UA `phoneField`, shape first. */
describe("orderLookupSchema phone", () => {
  it.each(["+380 50 111 2233", "0501112233", "(050) 111-22-33"])(
    "accepts %s",
    (phone) => {
      expect(phoneMessage(phone)).toBeUndefined();
    },
  );

  it.each(["050 111 2233 ccc", "12345", "+48 123 456 789"])(
    "refuses %s",
    (phone) => {
      expect(phoneMessage(phone)).toBe(dict.orderLookup.errors.phoneRequired);
    },
  );
});
