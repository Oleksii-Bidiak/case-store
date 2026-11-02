// R2 (TASK-2047 / TASK-951): «Повернути гроші» without a return — a cancelled
// paid order, or an overpayment. With `forReturn` (TASK-2046) the same dialog
// is «Виплатити» on the return page, sending `returnId`.
export {
  RecordPayoutAction,
  type PayoutForReturn,
} from "./ui/record-payout-action";
