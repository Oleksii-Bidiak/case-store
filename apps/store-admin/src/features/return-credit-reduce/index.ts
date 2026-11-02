// R2 (TASK-2046): «Зменшити» the amount owed back on a REFUND return —
// reduce-only, not below what was paid out, with a reason.
export { ReduceCreditAction } from "./ui/reduce-credit-action";
export { checkReduceReason, checkReducedCredit } from "./model/reduce-credit";
