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

describe("returnableLines (TASK-373)", () => {
  it("offers the whole order when nothing has been returned yet", () => {
    expect(returnableLines(items)).toEqual([
      {
        orderItemId: "line-1",
        productName: "Чохол",
        ordered: 3,
        remaining: 3,
      },
      { orderItemId: "line-2", productName: "Скло", ordered: 1, remaining: 1 },
    ]);
  });

  // The cap is over the SUM of live returns, never over one request: someone who
  // bought three may send one back today and another next week, and a
  // per-request cap would let them return the same unit again and again.
  it("subtracts units already claimed by an earlier return", () => {
    const lines = returnableLines(items, [claim("REQUESTED", "line-1", 2)]);

    expect(lines[0]).toMatchObject({ ordered: 3, remaining: 1 });
    expect(lines[1]).toMatchObject({ remaining: 1 });
  });

  it.each(["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED"])(
    "keeps the units of a %s return claimed",
    (status) => {
      const lines = returnableLines(items, [claim(status, "line-1", 3)]);

      expect(lines[0].remaining).toBe(0);
    },
  );

  // The shop said no, nothing came back, and the customer may legitimately ask
  // again with a better reason — the server frees these units too.
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

  // A line with nothing left is still listed, greyed out — dropping it would
  // hide the very product the customer came looking for.
  it("keeps an exhausted line in the list rather than hiding it", () => {
    const lines = returnableLines(items, [claim("APPROVED", "line-2", 1)]);

    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({
      productName: "Скло",
      ordered: 1,
      remaining: 0,
    });
  });

  it("never goes negative, whatever the server says is claimed", () => {
    const lines = returnableLines(items, [claim("APPROVED", "line-2", 5)]);

    expect(lines[1].remaining).toBe(0);
  });
});

describe("clampQuantity", () => {
  it("passes a value inside the range through", () => {
    expect(clampQuantity(2, 3)).toBe(2);
  });

  it("caps at what remains — a number input's max is a suggestion", () => {
    expect(clampQuantity(9, 3)).toBe(3);
  });

  it("floors at zero", () => {
    expect(clampQuantity(-4, 3)).toBe(0);
  });

  it("reads an empty or non-numeric field as «not returning this line»", () => {
    expect(clampQuantity(Number.NaN, 3)).toBe(0);
  });

  it("truncates a pasted fraction — units are whole", () => {
    expect(clampQuantity(2.7, 3)).toBe(2);
  });

  it("offers nothing on a line with nothing left", () => {
    expect(clampQuantity(2, 0)).toBe(0);
  });
});
