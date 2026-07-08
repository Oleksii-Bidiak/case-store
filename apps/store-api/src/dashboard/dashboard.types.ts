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
  /** Sum of Order.total for active orders not yet marked PAID (TASK-137). */
  unrealizedRevenue: number;
  /** Unrealized revenue created in the rolling window (TASK-137). */
  unrealizedRevenueLast30Days: number;
  /**
   * Average order value over the last 30 days: earned revenue in the window
   * divided by the number of PAID orders in the window, `0` if none (TASK-249).
   */
  averageOrderValueLast30Days: number;
  revenueByDay: DailyDataPoint[];
}

/**
 * Customer-relationship metrics (TASK-249). `repeatBuyerRate` is the share
 * (0..1) of customers with 2+ non-CANCELLED orders; the 90-day variant windows
 * both numerator and denominator to orders created in the last 90 days.
 */
export interface CustomerMetrics {
  /** All-time share (0..1) of customers with 2+ non-CANCELLED orders. */
  repeatBuyerRate: number;
  /** Same share, restricted to orders created in the last 90 days. */
  repeatBuyerRateLast90Days: number;
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

/**
 * Operational-efficiency metrics (TASK-251). A distinct slice from `orders`
 * (which counts orders) — this measures fulfilment speed.
 */
export interface OperationsMetrics {
  /**
   * Average hours from order creation to its first SHIPPED transition, for
   * orders created in the last 30 days that have shipped at least once. `0` when
   * none have shipped yet.
   */
  averageProcessingHoursLast30Days: number;
}

export interface DashboardSummary {
  revenue: RevenueMetrics;
  orders: OrderMetrics;
  users: UserMetrics;
  customers: CustomerMetrics;
  products: ProductMetrics;
  inventory: InventoryMetrics;
  operations: OperationsMetrics;
}

/**
 * "Needs action" counters for the admin dashboard widget + sidebar badges
 * (TASK-248). Four independent COUNT reads over existing columns — no writes,
 * no migration. Plain mirror of {@link NeedsActionDto} (the decorated Swagger
 * class the controller returns), carrying no decorator metadata.
 */
export interface NeedsAction {
  /** Orders awaiting confirmation (`status = PENDING`). */
  newOrders: number;
  /** Reviews awaiting moderation (`isActive = false`). */
  pendingReviews: number;
  /** Active orders not yet paid (`paymentStatus != PAID` AND `status NOT IN (CANCELLED, REFUNDED)`). */
  unpaidInTransit: number;
  /** Outbound emails permanently failed (`MailOutbox.status = FAILED`). */
  failedMails: number;
  /**
   * Orders sitting in PENDING for more than {@link PENDING_STALE_HOURS} hours
   * (TASK-251). A subset of `newOrders` (not mutually exclusive) — of the new
   * orders, how many have been waiting too long.
   */
  pendingOver48h: number;
}

/** Rolling window (in days) used for all time-series metrics. */
export const DASHBOARD_WINDOW_DAYS = 30;

/**
 * How many hours a PENDING order may sit before the dashboard flags it as stale
 * in the "needs action" widget (TASK-251).
 */
export const PENDING_STALE_HOURS = 48;

/**
 * Fixed window (in days) for the recent repeat-buyer rate (TASK-249). This is a
 * metric-specific window, not a global dashboard period selector (see plan 120
 * Design Decision 2 — the whole-dashboard 7/30/90 selector stays out of scope).
 */
export const REPEAT_BUYER_WINDOW_DAYS = 90;

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
