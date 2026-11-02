import { parseKop } from "@/shared/lib";
import type { ReturnItemEntity } from "@/shared/api";

/**
 * What the lines coming back are worth — Σ unit price × quantity, in integer
 * kopecks (R2, TASK-2046; was `returnedValueOf` of the resolve form, which
 * multiplied a parsed float).
 *
 * The GROSS value of the lines, before the promo share: what the customer is
 * owed back is the server's «До повернення» (`creditKop`), which takes the
 * discount out. Add-ons and shipping are not part of either.
 *
 * `null` when a line has no price (the admin response always joins the order
 * line, so that should not happen) — a guessed figure would be a lie.
 */
export function returnLinesValueKop(
  items: ReadonlyArray<Pick<ReturnItemEntity, "price" | "quantity">>,
): number | null {
  let kop = 0;
  for (const item of items) {
    const unitKop = item.price === null ? null : parseKop(item.price);
    if (unitKop === null) return null;
    kop += unitKop * item.quantity;
  }
  return kop;
}
