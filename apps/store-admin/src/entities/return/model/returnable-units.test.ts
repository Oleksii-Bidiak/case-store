import {
  clampQuantity,
  returnableLines,
  type ExistingReturn,
  type OrderLine,
} from "./returnable-units";

const items: OrderLine[] = [
  { id: "line-1", productName: "Чохол", quantity: 3 },
  { id: "line-2", productName: "Скло", quantity: 1 },
];

const claim = (
  status: string,
  orderItemId: string,
  quantity: number,
): ExistingReturn => ({ status, items: [{ orderItemId, quantity }] });

describe("returnableLines (TASK-1963)", () => {
  it("offers the whole order when nothing has been returned yet", () => {
    expect(returnableLines(items)).toEqual([
      { orderItemId: "line-1", productName: "Чохол", ordered: 3, remaining: 3 },
      { orderItemId: "line-2", productName: "Скло", ordered: 1, remaining: 1 },
    ]);
  });

  it("subtracts units already claimed by an earlier return", () => {
    const lines = returnableLines(items, [claim("REQUESTED", "line-1", 2)]);

    expect(lines[0]).toMatchObject({ ordered: 3, remaining: 1 });
    expect(lines[1]).toMatchObject({ remaining: 1 });
  });

  it.each(["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED"])(
    "keeps the units of a %s return claimed",
    (status) => {
      expect(returnableLines(items, [claim(status, "line-1", 3)])[0]).toEqual(
        expect.objectContaining({ remaining: 0 }),
      );
    },
  );

  // The shop said no and nothing came back — the server frees these units too.
  it("frees the units of a REJECTED return", () => {
    const lines = returnableLines(items, [claim("REJECTED", "line-1", 3)]);

    expect(lines[0].remaining).toBe(3);
  });

  it("adds up several live returns against the same line", () => {
    const lines = returnableLines(items, [
      claim("REQUESTED", "line-1", 1),
      claim("RECEIVED", "line-1", 1),
    ]);

    expect(lines[0].remaining).toBe(1);
  });

  it("keeps an exhausted line in the list rather than hiding it", () => {
    const lines = returnableLines(items, [claim("APPROVED", "line-2", 1)]);

    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ orderItemId: "line-2", remaining: 0 });
  });

  it("never goes below zero when the claims exceed the order", () => {
    const lines = returnableLines(items, [claim("REQUESTED", "line-2", 5)]);

    expect(lines[1].remaining).toBe(0);
  });
});

describe("clampQuantity", () => {
  it.each([
    [2, 3, 2],
    [5, 3, 3],
    [-1, 3, 0],
    [1.7, 3, 1],
    [Number.NaN, 3, 0],
    [2, 0, 0],
  ])("clamps %p into [0, %p] → %p", (value, remaining, expected) => {
    expect(clampQuantity(value, remaining)).toBe(expected);
  });
});
