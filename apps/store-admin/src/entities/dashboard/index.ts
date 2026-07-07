// Dashboard entity — domain types, API hook, and query-key getter.
// Re-exports the Orval-generated admin-dashboard client from the shared layer
// so widgets depend on `@/entities/dashboard` rather than reaching into
// `@/shared/api` directly.

export {
  useAdminDashboardControllerGetSummary,
  getAdminDashboardControllerGetSummaryQueryKey,
  useAdminDashboardControllerGetNeedsAction,
  getAdminDashboardControllerGetNeedsActionQueryKey,
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
  LowStockProductDto,
  OrderStatusCountDto,
  NeedsActionDto,
  NeedsActionResponse,
} from "@/shared/api";
