/**
 * Pure decision logic for committing a manually typed cart quantity
 * (TASK-207). The `<input type="number">` in CartItemRow lets the user clear
 * the field or type 0 / negatives / decimals; committing those raw values used
 * to write 0 to the server (removing the line). Instead the resolver maps the
 * entered value to one of three outcomes:
 *
 * - `restore` — invalid input (empty, 0, negative, NaN, or an out-of-stock
 *   line): snap the input back to the previous authoritative quantity and do
 *   not touch the server. Removal stays an explicit action (trash button).
 * - `noop`    — the (clamped) value equals the current quantity: nothing to
 *   write, just normalize the input display.
 * - `update`  — a valid quantity in `[1, maxQty]` (decimals truncated,
 *   overflow clamped to `maxQty`): write it.
 */
export type QuantityCommitResult =
  | { kind: "restore" }
  | { kind: "noop" }
  | { kind: "update"; quantity: number };

/**
 * Resolve a typed quantity against the line's current quantity and stock cap.
 *
 * @param entered  Raw input state: a number, or `""` when the field is cleared.
 * @param currentQuantity  The cart's authoritative quantity for this line.
 * @param maxQty  Upper bound for the line (min of the global cap and stock).
 */
export function resolveQuantityCommit(
  entered: number | "",
  currentQuantity: number,
  maxQty: number,
): QuantityCommitResult {
  if (entered === "" || !Number.isFinite(entered)) {
    return { kind: "restore" };
  }
  const whole = Math.trunc(entered);
  if (whole <= 0 || maxQty <= 0) {
    return { kind: "restore" };
  }
  const clamped = Math.min(maxQty, whole);
  if (clamped === currentQuantity) {
    return { kind: "noop" };
  }
  return { kind: "update", quantity: clamped };
}
