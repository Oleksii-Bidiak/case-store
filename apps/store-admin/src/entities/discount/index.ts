// Discount entity — domain types, API hooks, and query-key getters.
// Re-exports the Orval-generated admin-discount client from the shared layer so
// the rest of the app depends on `@/entities/discount` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminListDiscounts,
  useAdminGetDiscount,
  useAdminCreateDiscount,
  useAdminUpdateDiscount,
  useAdminDeactivateDiscount,
  // Wave 198 (TASK-1076): the public «active» list is exactly what the
  // storefront «Акції» page renders — the content map reads it.
  useListActiveDiscounts,
  getAdminListDiscountsQueryKey,
  getAdminGetDiscountQueryKey,
} from "@/shared/api";

export type {
  DiscountEntity,
  CreateDiscountDto,
  UpdateDiscountDto,
  AdminDiscountListResponse,
  AdminListDiscountsParams,
} from "@/shared/api";

// Wave 198, DiscountsProposal ПК1 (TASK-1085): what a code does right now,
// read from the switch AND the window, and the code's terms in words.
export {
  discountAmount,
  discountConditions,
  discountDisplayState,
  discountPeriod,
  discountStatusLabel,
  discountValueLabel,
  type DiscountDisplayState,
  type DiscountStateFields,
} from "./lib/display-state";
export { DiscountStatusBadge } from "./ui/discount-status-badge";
