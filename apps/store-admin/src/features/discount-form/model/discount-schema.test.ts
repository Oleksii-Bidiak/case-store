import { dict } from "@/shared/config";
import { discountSchema } from "./discount-schema";

const e = dict.discountForm.errors;

const base = {
  code: "summer",
  type: "FIXED" as const,
  value: "100",
  minSpend: "",
  maxRedemptions: "",
  perUserLimit: "",
  startsAt: "",
  expiresAt: "",
};

const issueFor = (field: "value" | "minSpend", raw: string) => {
  const result = discountSchema.safeParse({ ...base, [field]: raw });
  return result.success
    ? undefined
    : result.error.issues.find((issue) => issue.path[0] === field)?.message;
};

describe("discountSchema — money through parseKop (TASK-1984, Rule 5e)", () => {
  it.each(["Infinity", "1e400", "1e3", "100000000"])(
    "refuses %s as a discount value",
    (raw) => {
      expect(issueFor("value", raw)).toBe(e.amountInvalid);
    },
  );

  it.each(["Infinity", "1e3", "100000000"])(
    "refuses %s as a minimum spend",
    (raw) => {
      expect(issueFor("minSpend", raw)).toBe(e.amountInvalid);
    },
  );

  it("keeps the existing words for zero, negative and three decimals", () => {
    expect(issueFor("value", "0")).toBe(e.valuePositive);
    expect(issueFor("value", "-5")).toBe(e.valuePositive);
    expect(issueFor("value", "10.555")).toBe(e.decimalsMax);
    expect(issueFor("minSpend", "-1")).toBe(e.minSpendInvalid);
  });

  it("parses a comma or a dot, up to parseKop's ceiling", () => {
    const parsed = discountSchema.parse({
      ...base,
      value: "21474836.47",
      minSpend: "1500,5",
    });
    expect(parsed.value).toBe(21_474_836.47);
    expect(parsed.minSpend).toBe(1500.5);
  });

  it("keeps a blank minimum spend as «no minimum»", () => {
    expect(discountSchema.parse(base).minSpend).toBeUndefined();
  });
});
