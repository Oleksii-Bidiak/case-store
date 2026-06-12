// Dashboard entity — domain types, API hook, and query-key getter.
// Re-exports the Orval-generated admin-dashboard client from the shared layer
// so widgets depend on `@/entities/dashboard` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminDashboardControllerGetSummary,
  getAdminDashboardControllerGetSummaryQueryKey,
} from "@/shared/api";

export type {
  DashboardSummaryResponse,
  RevenueMetricsDto,
  OrderMetricsDto,
  UserMetricsDto,
  ProductMetricsDto,
  InventoryMetricsDto,
  DailyDataPointDto,
  TopProductDto,
  LowStockVariantDto,
  OrderStatusCountDto,
} from "@/shared/api";
