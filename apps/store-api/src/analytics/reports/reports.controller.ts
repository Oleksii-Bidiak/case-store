import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentActor,
  PermissionGuard,
  RequirePermission,
  type PermissionActor,
} from '../../auth/permissions';
import { PeriodQueryDto } from './dto/period-query.dto';
import { SalesReportEntity } from './entities/sales-report.entity';
import { SalesReportService } from './sales-report.service';

class SalesReportEnvelope {
  @ApiProperty({ type: SalesReportEntity })
  data!: SalesReportEntity;
}

/**
 * The `/analytics` reports (plan 188, TASK-686…690).
 *
 *   GET /api/admin/analytics/reports/sales?preset=30d
 *   GET /api/admin/analytics/reports/sales?preset=custom&from=2026-08-01&to=2026-08-31
 *
 * One controller for the five reports so they share a prefix, a tag in the
 * generated client, and the guard. Each route names its own permission: a
 * report that is entirely money (sales) requires `analytics:revenue`; the
 * reports that mix units and sums (TASK-687/688) will require `analytics:read`
 * and cut the sums out of the answer for anyone without the money key.
 */
@ApiTags('Admin Analytics Reports')
@ApiBearerAuth('access-token')
@UseGuards(PermissionGuard)
@Controller('admin/analytics/reports')
export class ReportsController {
  constructor(private readonly salesReportService: SalesReportService) {}

  /**
   * «Продажі за період». Withheld whole (403) from anyone without
   * `analytics:revenue` — owner's decision: there is nothing in it that is not
   * money, so a trimmed answer would be an empty one.
   *
   * The route's door is `analytics:read`, like every report and the dashboard;
   * the service then demands `analytics:revenue` on top. `analytics:revenue`
   * widens what a reader of analytics sees — it is not a door of its own, so a
   * person holding it without `analytics:read` is refused here exactly as on
   * the dashboard.
   */
  @Get('sales')
  @RequirePermission('analytics:read')
  @ApiOperation({
    summary: 'Sales, refunds and net revenue for a period, compared with the previous one',
    description:
      'Sales = Σ totals of orders created in the period whose payment is PAID, ' +
      'PARTIALLY_REFUNDED or REFUNDED. Refunds = money returned in the period (refunded ' +
      'returns by resolution date, plus full payment refunds not covered by returns, by the ' +
      'date the payment became REFUNDED). Net = sales − refunds; average order value = net ÷ ' +
      'orders. Days are Kyiv calendar days.',
    operationId: 'getSalesReport',
  })
  @ApiResponse({ status: 200, description: 'Sales report', type: SalesReportEnvelope })
  @ApiResponse({ status: 400, description: 'The period cannot be answered' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — analytics:read and analytics:revenue required',
  })
  async getSales(
    @Query() query: PeriodQueryDto,
    @CurrentActor() actor: PermissionActor,
  ): Promise<{ data: SalesReportEntity }> {
    const data = await this.salesReportService.getSalesReport(query, actor);
    return { data };
  }
}
