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
