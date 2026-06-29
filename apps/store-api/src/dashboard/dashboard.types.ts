/**
 * Internal TypeScript shapes for the dashboard metrics.
 *
 * These mirror the Swagger DTO classes in `dto/dashboard-summary.dto.ts` but
 * carry no decorator metadata — they are the plain return types used inside the
 * repository. The service hands the assembled object straight back to the
 * controller, where it is typed as `DashboardSummaryResponse` (the structurally
 * identical decorated class Swagger/Orval consume).
 */

export interface DailyDataPoint {
  /** Day bucket formatted as `YYYY-MM-DD`. */
  date: string;
  value: number;
}

export interface OrderStatusCount {
  status: string;
  count: number;
}

export interface RevenueMetrics {
  totalRevenue: number;
  revenueLast30Days: number;
  revenueByDay: DailyDataPoint[];
}

export interface OrderMetrics {
  totalOrders: number;
  ordersByStatus: OrderStatusCount[];
  ordersByDay: DailyDataPoint[];
}

export interface UserMetrics {
  totalUsers: number;
  newUsersByDay: DailyDataPoint[];
}

export interface TopProduct {
  productId: string;
  name: string;
  totalRevenue: number;
}

export interface ProductMetrics {
  totalProducts: number;
  activeProducts: number;
  topProducts: TopProduct[];
}

export interface LowStockProduct {
  productId: string;
  productName: string;
  stock: number;
}

export interface InventoryMetrics {
  lowStockProducts: LowStockProduct[];
}

export interface DashboardSummary {
  revenue: RevenueMetrics;
  orders: OrderMetrics;
  users: UserMetrics;
  products: ProductMetrics;
  inventory: InventoryMetrics;
}

/** Rolling window (in days) used for all time-series metrics. */
export const DASHBOARD_WINDOW_DAYS = 30;

/**
 * Low-stock threshold for the dashboard restock query. Re-exported from the
 * product module (`product.constants.ts`) — its canonical home — so the public
 * product contract and the dashboard share a single source of truth. Existing
 * dashboard imports of `LOW_STOCK_THRESHOLD` from this module keep working.
 */
export { LOW_STOCK_THRESHOLD } from '../product/product.constants';

/** Maximum number of low-stock positions returned. */
export const LOW_STOCK_LIMIT = 10;

/** Number of top-selling products returned. */
export const TOP_PRODUCTS_LIMIT = 5;
