import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiExtraModels } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import {
  DailyDataPointDto,
  DashboardSummaryResponse,
  InventoryMetricsDto,
  LowStockProductDto,
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
  ProductMetricsDto,
  InventoryMetricsDto,
  DailyDataPointDto,
  TopProductDto,
  LowStockProductDto,
  OrderStatusCountDto,
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
}
