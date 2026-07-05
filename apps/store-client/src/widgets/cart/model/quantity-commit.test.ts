import { resolveQuantityCommit } from "./quantity-commit";

/**
 * TASK-207 — manual clear of the cart quantity input must never commit 0 or an
 * empty value: the row restores the previous (server) quantity instead. The
 * component delegates the decision to this pure resolver, so the whole rule
 * set is unit-tested here in the node project.
 */
describe("resolveQuantityCommit", () => {
  const max = 10;

  it("restores the previous quantity when the input was cleared", () => {
    expect(resolveQuantityCommit("", 3, max)).toEqual({ kind: "restore" });
  });

  it("restores when the user typed 0 (never removes via the input)", () => {
    expect(resolveQuantityCommit(0, 3, max)).toEqual({ kind: "restore" });
  });

  it("restores on a negative quantity", () => {
    expect(resolveQuantityCommit(-4, 3, max)).toEqual({ kind: "restore" });
  });

  it("restores on a non-numeric value (NaN)", () => {
    expect(resolveQuantityCommit(Number.NaN, 3, max)).toEqual({
      kind: "restore",
    });
  });

  it("restores for an out-of-stock line (maxQty 0) regardless of input", () => {
    expect(resolveQuantityCommit(5, 2, 0)).toEqual({ kind: "restore" });
  });

  it("updates to a valid in-range quantity", () => {
    expect(resolveQuantityCommit(7, 3, max)).toEqual({
      kind: "update",
      quantity: 7,
    });
  });

  it("is a noop when the entered quantity equals the current one", () => {
    expect(resolveQuantityCommit(3, 3, max)).toEqual({ kind: "noop" });
  });

  it("clamps values above maxQty down to maxQty", () => {
    expect(resolveQuantityCommit(150, 3, max)).toEqual({
      kind: "update",
      quantity: max,
    });
  });

  it("is a noop when the clamped value equals the current quantity", () => {
    expect(resolveQuantityCommit(150, max, max)).toEqual({ kind: "noop" });
  });

  it("truncates decimals before validating (7.9 → 7)", () => {
    expect(resolveQuantityCommit(7.9, 3, max)).toEqual({
      kind: "update",
      quantity: 7,
    });
  });

  it("restores when a decimal truncates to zero (0.4 → 0)", () => {
    expect(resolveQuantityCommit(0.4, 3, max)).toEqual({ kind: "restore" });
  });

  it("allows committing 1 (minimum valid quantity)", () => {
    expect(resolveQuantityCommit(1, 3, max)).toEqual({
      kind: "update",
      quantity: 1,
    });
  });
});
