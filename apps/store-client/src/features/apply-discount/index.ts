export { ApplyDiscount } from "./ui/apply-discount";
// The store itself belongs to `entities/discount` (TASK-819); re-exported so
// the widgets that render this feature keep one import for both.
export {
  useAppliedDiscount,
  setAppliedDiscount,
  clearAppliedDiscount,
  type AppliedDiscount,
} from "@/entities/discount";
