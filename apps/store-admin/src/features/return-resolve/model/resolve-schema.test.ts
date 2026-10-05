import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import {
  OPERATOR_NOTES_MAX_LENGTH,
  createResolveReturnSchema,
  orderBalanceOf,
  refundCapOf,
  returnedValueOf,
  type RefundCeilings,
  type ResolveReturnFormValues,
} from "./resolve-schema";

const t = dict.returns;

function values(
  overrides: Partial<ResolveReturnFormValues> = {},
): ResolveReturnFormValues {
  return {
    status: "REFUNDED",
    operatorNotes: "",
    refundedAmount: "",
    restock: false,
    ...overrides,
  };
}

/** The message on `refundedAmount`, or undefined when it passes. */
function refundIssue(amount: string, ceilings: RefundCeilings) {
  const result = createResolveReturnSchema(ceilings).safeParse(
    values({ refundedAmount: amount }),
  );
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === "refundedAmount")
    ?.message;
}

describe("returnedValueOf — ceiling (1), the gross value of the lines (TASK-785)", () => {
  it("sums unit price × quantity in kopiykas", () => {
    expect(
      returnedValueOf([
        { price: "499.00", quantity: 2 },
        { price: "0.10", quantity: 3 },
      ]),
    ).toBe("998.30");
  });

  it("does not drift on amounts a float cannot hold", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floats.
    expect(
      returnedValueOf([
        { price: "0.10", quantity: 1 },
        { price: "0.20", quantity: 1 },
      ]),
    ).toBe("0.30");
  });

  it("is zero for a return with no lines, as the API computes it", () => {
    expect(returnedValueOf([])).toBe("0.00");
  });

  it("gives no bound at all when a line has no price", () => {
    // Guessing a ceiling the server does not use would refuse amounts it takes.
    expect(
      returnedValueOf([
        { price: "499.00", quantity: 1 },
        { price: null, quantity: 1 },
      ]),
    ).toBeNull();
  });
});

describe("orderBalanceOf — ceiling (2), what the order has left (TASK-785)", () => {
  it("subtracts every other return's refund, counting a null as zero", () => {
    expect(orderBalanceOf("1000.00", ["250.00", null, "0.50"])).toBe("749.50");
  });

  it("never goes below zero", () => {
    expect(orderBalanceOf("100.00", ["80.00", "80.00"])).toBe("0.00");
  });
});

describe("createResolveReturnSchema — the refund ceilings (TASK-785)", () => {
  it("accepts an amount exactly at the returned value", () => {
    expect(refundIssue("499.00", { returnedValue: "499.00" })).toBeUndefined();
  });

  it("refuses one kopiyka over it, naming the ceiling", () => {
    expect(refundIssue("499.01", { returnedValue: "499.00" })).toBe(
      t.resolveRefundExceedsReturnedValue(formatCurrency("499.00")),
    );
  });

  it("refuses 49900 typed for 499.00 — the defect the ceiling exists for", () => {
    expect(refundIssue("49900", { returnedValue: "499.00" })).toBe(
      t.resolveRefundExceedsReturnedValue(formatCurrency("499.00")),
    );
  });

  it("enforces the discount through the order balance", () => {
    // A 499.00 line bought for 400.00: the line allows 499, the order 400.
    const ceilings = {
      returnedValue: "499.00",
      orderBalance: orderBalanceOf("400.00", []),
    };
    expect(refundIssue("400.00", ceilings)).toBeUndefined();
    expect(refundIssue("400.01", ceilings)).toBe(
      t.resolveRefundExceedsOrderBalance(formatCurrency("400.00")),
    );
  });

  it("checks the returned value first, like the API", () => {
    expect(
      refundIssue("600.00", {
        returnedValue: "499.00",
        orderBalance: "100.00",
      }),
    ).toBe(t.resolveRefundExceedsReturnedValue(formatCurrency("499.00")));
  });

  it("never checks an empty amount — clearing a mistyped one must work", () => {
    expect(
      refundIssue("", { returnedValue: "0.00", orderBalance: "0.00" }),
    ).toBeUndefined();
  });

  it("reports a malformed amount as a format error, not as over a ceiling", () => {
    expect(refundIssue("499,00", { returnedValue: "1.00" })).toBe(
      t.resolveRefundedAmountInvalid,
    );
  });

  it("skips a bound it was not given", () => {
    expect(refundIssue("99999.00", {})).toBeUndefined();
    expect(refundIssue("99999.00", { returnedValue: null })).toBeUndefined();
  });
});

describe("createResolveReturnSchema — operator notes (TASK-794)", () => {
  const notesIssue = (operatorNotes: string) => {
    const result = createResolveReturnSchema().safeParse(
      values({ operatorNotes }),
    );
    if (result.success) return undefined;
    return result.error.issues.find(
      (issue) => issue.path[0] === "operatorNotes",
    )?.message;
  };

  it("accepts a note at exactly the DTO's limit", () => {
    expect(notesIssue("н".repeat(OPERATOR_NOTES_MAX_LENGTH))).toBeUndefined();
  });

  it("refuses one character more with a sentence the form can show", () => {
    expect(notesIssue("н".repeat(OPERATOR_NOTES_MAX_LENGTH + 1))).toBe(
      t.operatorNotesTooLong,
    );
  });
});

describe("refundCapOf — «Можна повернути максимум» (TASK-959)", () => {
  it("is the lower of the two ceilings", () => {
    expect(
      refundCapOf({ returnedValue: "1299.00", orderBalance: "1099.00" }),
    ).toBe("1099.00");
    expect(
      refundCapOf({ returnedValue: "499.00", orderBalance: "1000.00" }),
    ).toBe("499.00");
  });

  it("is the one it knows, or nothing", () => {
    expect(refundCapOf({ returnedValue: "499.00" })).toBe("499.00");
    expect(refundCapOf({ returnedValue: null, orderBalance: null })).toBeNull();
  });
});
