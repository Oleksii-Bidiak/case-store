import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiExtraModels } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import {
  CustomerMetricsDto,
  DailyDataPointDto,
  DashboardSummaryResponse,
  InventoryMetricsDto,
  LowStockProductDto,
  NeedsActionDto,
  NeedsActionResponse,
  OrderMetricsDto,
  OrderStatusCountDto,
  ProductMetricsDto,
  RevenueMetricsDto,
  TopProductDto,
  UserMetricsDto,
} from './dto';
import { AdminGuard } from '../auth/guards';

/**
 * Admin dashboard endpoint.
 *
 *   GET /api/admin/dashboard/summary — all metrics in one read-only payload.
 *
 * Admin-only (ADMIN role required via {@link AdminGuard}). Mirrors the
 * `admin/orders` controller split: a flat response (no `{ data }` wrapper),
 * since the summary IS the resource and has no identity or pagination.
 */
@ApiTags('Admin Dashboard')
@ApiExtraModels(
  DashboardSummaryResponse,
  RevenueMetricsDto,
  OrderMetricsDto,
  UserMetricsDto,
  CustomerMetricsDto,
  ProductMetricsDto,
  InventoryMetricsDto,
  DailyDataPointDto,
  TopProductDto,
  LowStockProductDto,
  OrderStatusCountDto,
  NeedsActionDto,
  NeedsActionResponse,
)
@Controller('admin/dashboard')
@UseGuards(AdminGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/admin/dashboard/summary
   *
   * Returns revenue, order, user, product, and inventory metrics in a single
   * payload to avoid waterfall fetches on the dashboard page load.
   */
  @Get('summary')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get dashboard summary metrics (admin)',
    operationId: 'adminDashboardControllerGetSummary',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated dashboard metrics',
    type: DashboardSummaryResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getSummary(): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary();
  }

  /**
   * GET /api/admin/dashboard/needs-action
   *
   * Four "needs action" counters (new orders, pending reviews, unpaid-in-transit
   * orders, failed mail) for the dashboard widget + sidebar badges (TASK-248).
   * A small, cache-friendly payload mirroring `GET /api/contact/admin/unread-count`
   * — the sidebar is mounted on every admin page, so it reads this narrow shape
   * rather than the heavy summary endpoint. Admin-only via the class-level
   * {@link AdminGuard}.
   */
  @Get('needs-action')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get needs-action counters (admin)',
    operationId: 'adminDashboardControllerGetNeedsAction',
  })
  @ApiResponse({
    status: 200,
    description: 'Needs-action counts',
    type: NeedsActionResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getNeedsAction(): Promise<NeedsActionResponse> {
    const data = await this.dashboardService.getNeedsAction();
    return { data };
  }
}
