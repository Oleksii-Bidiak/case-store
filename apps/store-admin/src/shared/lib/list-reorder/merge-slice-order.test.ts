/**
 * `mergeSliceOrder` (TASK-1990) — a list that carries ONE global order but is
 * reordered one slice at a time (static pages: the «Юридичні» / «Довідкові»
 * views). The reordered slice goes back into the SLOTS its rows held, so every
 * row outside the slice keeps its exact place and the payload still names
 * every id.
 */

import { mergeSliceOrder } from "./merge-slice-order";

describe("mergeSliceOrder", () => {
  it("puts the reordered slice back into the slots its rows held", () => {
    // L1, L2, L3 are one kind; I1, I2 another, interleaved in the global order.
    const full = ["L1", "I1", "L2", "I2", "L3"];
    expect(mergeSliceOrder(full, ["L3", "L1", "L2"])).toEqual([
      "L3",
      "I1",
      "L1",
      "I2",
      "L2",
    ]);
  });

  it("leaves every row outside the slice exactly where it was", () => {
    const full = ["I1", "L1", "I2", "L2", "I3"];
    const merged = mergeSliceOrder(full, ["L2", "L1"]);
    expect(merged).toEqual(["I1", "L2", "I2", "L1", "I3"]);
    expect(merged?.filter((id) => id.startsWith("I"))).toEqual([
      "I1",
      "I2",
      "I3",
    ]);
  });

  it("is the identity for the slice in its current order", () => {
    const full = ["A", "B", "C", "D"];
    expect(mergeSliceOrder(full, ["B", "D"])).toEqual(full);
  });

  it("covers the whole list when the slice IS the whole list", () => {
    expect(mergeSliceOrder(["A", "B", "C"], ["C", "A", "B"])).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  it("refuses (null) a slice that is not a permutation of rows in the list", () => {
    const full = ["A", "B", "C"];
    // An id the list does not hold.
    expect(mergeSliceOrder(full, ["A", "X"])).toBeNull();
    // A duplicate.
    expect(mergeSliceOrder(full, ["A", "A"])).toBeNull();
  });
});
