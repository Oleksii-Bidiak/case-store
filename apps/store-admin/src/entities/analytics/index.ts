// Analytics entity (TASK-380) — storefront traffic as the admin dashboard sees
// it.
//
// The numbers come from our own API, not from Umami directly: the analytics
// credential must stay server-side, and anything this bundle holds is public.

export { useGetTrafficSummary } from "@/shared/api";

export type { TrafficSummaryEntity } from "@/shared/api";

// TASK-692 — the /analytics reports (plan 188A). Every report takes the same
// period query (`preset`, and `from`/`to` for `custom`) and answers with the
// server's resolved `period`; every number in them is a `ComparedValueEntity`.
export {
  useGetSalesReport,
  useGetCategoryReport,
  useGetBrandReport,
  useGetProductsReport,
  useGetRegistrationsReport,
  useGetFunnelReport,
  ReportPreset,
  // TASK-691: the CSV reads an open category's children from the cache entry
  // its rows render from.
  getGetCategoryReportQueryKey,
} from "@/shared/api";

export type {
  ComparedValueEntity,
  ReportPeriodEntity,
  CategoryReportRowEntity,
  CategoryReportEnvelope,
  BrandReportRowEntity,
  GetSalesReportParams,
  GetCategoryReportParams,
  GetBrandReportParams,
  GetProductsReportParams,
  GetRegistrationsReportParams,
  GetFunnelReportParams,
  SalesReportEntity,
  CategoryReportEntity,
  BrandReportEntity,
  ProductsReportEntity,
  RegistrationsReportEntity,
  FunnelReportEntity,
} from "@/shared/api";
