// R2 (TASK-2047 / TASK-2337): «Сторнувати» a manual money entry, «Анулювати
// запит» on a LiqPay refund that never went through — both with a reason.
export {
  EntryCorrectionAction,
  type EntryCorrectionMode,
} from "./ui/entry-correction-action";
